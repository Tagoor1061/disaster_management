"""
Wind Preparedness Unit — AI/ML Hazard Classification & Gust Forecasting
========================================================================
Models
------
1. GradientBoostingClassifier : wind hazard classification into
   LOW / MODERATE / HIGH / EXTREME from weather features.
2. ARIMA (statsmodels)        : hourly gust-speed time-series forecasting;
   falls back to a scikit-learn GradientBoosting regressor with lag features
   when statsmodels is unavailable.

Explainability
--------------
- SHAP : feature importance (humidity, pressure, past wind speeds).
- LIME : local explanation of individual hazard classifications.

Persisted under /models: wind_classifier.pkl / wind_gust_model.pkl /
wind_meta.json
"""

import os
import json
import pickle
import datetime
import numpy as np
import pandas as pd

from app.utils.wind_data import WindDataManager

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

CLASSIFIER_FILE = os.path.join(MODEL_DIR, "wind_classifier.pkl")
GUST_MODEL_FILE = os.path.join(MODEL_DIR, "wind_gust_model.pkl")
META_FILE = os.path.join(MODEL_DIR, "wind_meta.json")

# Engineered predictors for both models
FEATURE_NAMES = ["humidity", "pressure_hpa", "wind_lag1", "wind_lag2", "wind_lag3", "gust_lag1"]
LAGS = 3
FORECAST_HORIZON = 24  # hours ahead for the gust trajectory

# IMD-style hazard classes derived from peak gust speed (kmph)
HAZARD_CLASSES = ["LOW", "MODERATE", "HIGH", "EXTREME"]
HAZARD_COLORS = {"LOW": "#2e7d32", "MODERATE": "#fbc02d",
                 "HIGH": "#FFA500", "EXTREME": "#FF0000"}

# Gust-speed thresholds used to label training samples and predictions
MODERATE_THRESHOLD = 40.0   # Cat4  -> <40 light
HIGH_THRESHOLD = 62.0       # Cat9  -> 41-61 moderate
EXTREME_THRESHOLD = 87.0    # Cat14 -> 62-87 severe; Cat15 -> >87 very severe


def _hazard_from_gust(gust_kmph):
    if gust_kmph >= EXTREME_THRESHOLD:
        return "EXTREME"
    if gust_kmph >= HIGH_THRESHOLD:
        return "HIGH"
    if gust_kmph >= MODERATE_THRESHOLD:
        return "MODERATE"
    return "LOW"

# ---------------------------------------------------------------------------
# Synthetic hourly history builder (deterministic, seeded)
# ---------------------------------------------------------------------------
def _build_hourly_history(n_hours=24 * 120):
    """Build a 120-day hourly wind + weather-feature history.

    Deterministic diurnal + synoptic pattern anchored to the live IMD
    station nowcast peak gust when available, so training is reproducible.
    """
    rng = np.random.default_rng(21)
    idx = pd.date_range(end=pd.Timestamp.today().floor("h"), periods=n_hours, freq="h")

    hour = np.asarray(idx.hour)
    # Diurnal cycle: afternoon convective peak (14-18h), calm early morning
    diurnal = 10.0 + 9.0 * np.sin((hour - 6) * np.pi / 12.0).clip(min=0)
    # Slow synoptic systems (storms passing every ~8 days)
    synoptic = 12.0 * (0.5 + 0.5 * np.sin(np.arange(n_hours) * 2 * np.pi / (24 * 8)))

    gust = np.clip(diurnal + synoptic + rng.normal(0, 4.5, n_hours), 2, None)

    humidity = np.clip(58 + 20 * np.sin(np.arange(n_hours) * 2 * np.pi / 24.0
                                        + 1.2) + rng.normal(0, 5, n_hours), 15, 100)
    pressure = np.clip(1006 - 0.16 * (gust - gust.mean()) + rng.normal(0, 1.2, n_hours),
                       985, 1020)

    df = pd.DataFrame({
        "time": idx,
        "gust_kmph": gust.round(1),
        "humidity": humidity.round(1),
        "pressure_hpa": pressure.round(1),
    })

    # Anchor latest hours with the live IMD nowcast gusts if present
    try:
        nowcast = WindDataManager.fetch_station_nowcast()
        rows = nowcast.get("nowcast", []) if isinstance(nowcast, dict) else []
        live_gusts = [float(n["gust_speed_kmph"]) for n in rows
                      if isinstance(n, dict) and n.get("gust_speed_kmph") is not None]
        for i, g in enumerate(live_gusts[:6]):
            df.iloc[-1 - i, df.columns.get_loc("gust_kmph")] = g
    except Exception:
        pass
    return df


def _add_lag_features(df):
    """Add past-wind / past-gust lag columns used as model features."""
    out = df.copy()
    out["wind_lag1"] = out["gust_kmph"].shift(1)
    out["wind_lag2"] = out["gust_kmph"].shift(2)
    out["wind_lag3"] = out["gust_kmph"].shift(3)
    out["gust_lag1"] = out["gust_kmph"].shift(1) * 1.18  # gust factor proxy
    out = out.dropna().reset_index(drop=True)
    return out

# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------
def train_wind_models(force=False):
    """Train (or load) the hazard classifier + gust forecaster. Returns meta."""
    if not force and os.path.exists(META_FILE) and os.path.exists(CLASSIFIER_FILE):
        try:
            with open(META_FILE, "r") as f:
                meta = json.load(f)
            if meta.get("classifier_kind"):
                return meta
        except Exception:
            pass

    df = _add_lag_features(_build_hourly_history())
    X = df[FEATURE_NAMES].values
    gust = df["gust_kmph"].values
    y = np.array([_hazard_from_gust(g) for g in gust])

    # ---- Hazard classifier (GradientBoosting, RandomForest alternative) ----
    from sklearn.ensemble import GradientBoostingClassifier
    clf = GradientBoostingClassifier(n_estimators=220, learning_rate=0.06,
                                     max_depth=3, random_state=21)
    clf.fit(X, y)

    # ---- Gust forecaster: ARIMA first, GradientBoosting fallback ----------
    arima_summary = _fit_arima(gust)
    if arima_summary.get("ok"):
        gust_kind = "ARIMA (statsmodels)"
        gust_model = None  # ARIMA is re-fit at forecast time on the full series
    else:
        from sklearn.ensemble import GradientBoostingRegressor
        gust_model = GradientBoostingRegressor(n_estimators=250, learning_rate=0.05,
                                               max_depth=3, random_state=21)
        gust_model.fit(X, gust)
        gust_kind = "GradientBoosting Regressor (ARIMA fallback)"

    # SHAP background sample (kept small for speed)
    bg = X[np.random.default_rng(5).choice(len(X), size=min(40, len(X)), replace=False)]

    meta = {
        "trained_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": "GradientBoostingClassifier (scikit-learn)",
        "gust_model_kind": gust_kind,
        "arima": arima_summary,
        "feature_names": FEATURE_NAMES,
        "n_samples": int(len(X)),
        "class_distribution": {c: int((y == c).sum()) for c in HAZARD_CLASSES},
        "background_sample": bg.tolist(),
    }
    with open(CLASSIFIER_FILE, "wb") as f:
        pickle.dump(clf, f)
    with open(GUST_MODEL_FILE, "wb") as f:
        pickle.dump(gust_model, f)
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=4)
    print(f"[WindML] Trained classifier + {gust_kind} on {len(X)} samples.")
    return meta


def _fit_arima(series):
    """Fit ARIMA(2,0,2) on the hourly gust series; returns summary dict."""
    try:
        import warnings
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ar = ARIMA(np.asarray(series, dtype=float), order=(2, 0, 2)).fit(method_kwargs={"maxiter": 200})
        return {"ok": True, "order": [2, 0, 2], "aic": round(float(ar.aic), 2)}
    except Exception as exc:
        print(f"[WindML] ARIMA unavailable ({exc}); using regressor fallback.")
        return {"ok": False, "order": [2, 0, 2], "aic": None}

# ---------------------------------------------------------------------------
# Explainability — SHAP + LIME
# ---------------------------------------------------------------------------
def _explain_with_shap(clf, X_sample, background):
    """Per-class SHAP attributions for the hazard classifier."""
    try:
        import shap
        explainer = shap.TreeExplainer(clf)
        sv = np.asarray(explainer.shap_values(X_sample))
        # Multiclass shape can be (classes, samples, feats) or (samples, feats, classes)
        if sv.ndim == 3:
            sv = np.abs(sv).mean(axis=(0, 1)) if sv.shape[0] == len(HAZARD_CLASSES) \
                else np.abs(sv).mean(axis=(0, 2))
        else:
            sv = np.abs(sv).mean(axis=0)
        return {FEATURE_NAMES[i]: round(float(v), 4) for i, v in enumerate(sv)}
    except Exception as exc:
        print(f"[WindML] SHAP unavailable ({exc}); using permutation approximation.")
        try:
            imp = clf.feature_importances_ if hasattr(clf, "feature_importances_") else None
            if imp is not None:
                return {FEATURE_NAMES[i]: round(float(v), 4) for i, v in enumerate(imp)}
        except Exception:
            pass
        return {name: 1.0 / len(FEATURE_NAMES) for name in FEATURE_NAMES}


def _explain_with_lime(clf, X_instance):
    """LIME local explanation of a single hazard classification."""
    try:
        from lime.lime_tabular import LimeTabularExplainer
        rng = np.random.default_rng(13)
        train = rng.normal(loc=X_instance, scale=3.0, size=(80, len(FEATURE_NAMES)))
        exp = LimeTabularExplainer(train, feature_names=FEATURE_NAMES,
                                   mode="classification", random_state=13,
                                   discretize_continuous=True)
        probs = exp.explain_instance(X_instance[0], clf.predict_proba,
                                     num_features=len(FEATURE_NAMES),
                                     labels=(0,))
        return [{"feature": feat, "weight": round(float(w), 4)}
                for feat, w in probs.as_list(label=0)]
    except Exception as exc:
        print(f"[WindML] LIME unavailable ({exc}); returning empty local explanation.")
        return []

# ---------------------------------------------------------------------------
# Prediction pipeline
# ---------------------------------------------------------------------------
def predict_wind(include_explanations=True):
    """Full wind prediction payload for /api/predict/wind.

    - Loads (or trains) the hazard classifier + gust forecaster.
    - Produces a 24-hour gust-speed trajectory with hazard classification.
    - Attaches SHAP global attributions and LIME local explanation.
    """
    meta = train_wind_models()

    with open(CLASSIFIER_FILE, "rb") as f:
        clf = pickle.load(f)
    with open(GUST_MODEL_FILE, "rb") as f:
        gust_model = pickle.load(f)

    df = _add_lag_features(_build_hourly_history())
    X = df[FEATURE_NAMES].values
    gust = df["gust_kmph"].values
    last_row = X[-1:]

    # ---- 24-hour gust trajectory ------------------------------------------
    future_times = pd.date_range(start=df["time"].iloc[-1] + pd.Timedelta(hours=1),
                                 periods=FORECAST_HORIZON, freq="h")
    arima_future = _arima_forecast(gust, FORECAST_HORIZON)

    ml_future, roll = [], list(df.iloc[-1][FEATURE_NAMES[-3:]].astype(float))
    for ts in future_times:
        hour = ts.hour
        diurnal = 10.0 + 9.0 * max(np.sin((hour - 6) * np.pi / 12.0), 0.0)
        feats = np.array([[58.0, 1006.0, roll[0], roll[1], roll[2], roll[0] * 1.18]])
        feats[0, 0] = float(np.clip(58 + 8 * np.sin((hour - 6) * np.pi / 12.0), 15, 100))
        feats[0, 1] = float(np.clip(1006 - 0.16 * (diurnal - 15), 985, 1020))

        if gust_model is not None:
            val = float(np.ravel(gust_model.predict(feats))[0])
        else:
            val = float(arima_future[len(ml_future)])
        val = max(0.0, val)
        ml_future.append(round(val, 1))
        roll = [val, roll[0], roll[1]]

    blended = [round(0.5 * m + 0.5 * a, 1) for m, a in zip(ml_future, arima_future)]

    # ---- Current hazard classification (latest observation) ----------------
    current_feats = last_row
    hazard_idx = int(np.ravel(clf.predict(current_feats))[0])
    hazard = HAZARD_CLASSES[hazard_idx] if isinstance(hazard_idx, (int, np.integer)) \
        else str(hazard_idx)
    try:
        proba = clf.predict_proba(current_feats)[0]
        confidence = round(float(np.max(proba)) * 100, 1)
    except Exception:
        confidence = None

    peak_val = float(max(blended))
    peak_hazard = _hazard_from_gust(peak_val)

    # ---- Next-year severe-wind event estimate ------------------------------
    current_year = datetime.datetime.now().year
    next_year = current_year + 1
    severe_hours_this_year = int((gust >= HIGH_THRESHOLD).sum())
    severe_ratio = severe_hours_this_year / max(len(gust), 1)
    predicted_severe_events_next_year = int(round(severe_ratio * 24 * 365 * 1.06))

    trend = "increasing" if predicted_severe_events_next_year > severe_hours_this_year \
        else "decreasing"

    # ---- Explainability -----------------------------------------------------
    shap_values = lime_explanation = None
    if include_explanations:
        background = np.asarray(meta.get("background_sample", X[:20]))
        shap_values = _explain_with_shap(clf, last_row, background)
        lime_explanation = _explain_with_lime(clf, last_row)

    return {
        "disaster": "wind",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": meta.get("classifier_kind"),
        "gust_model_kind": meta.get("gust_model_kind"),
        "arima": meta.get("arima", {}),
        "trained_at": meta.get("trained_at"),
        "next_year": next_year,
        "current_hazard": hazard,
        "current_hazard_color": HAZARD_COLORS.get(hazard, "#2e7d32"),
        "hazard_confidence_pct": confidence,
        "peak_forecast_hour": future_times[int(np.argmax(blended))].strftime("%d %b %H:%M"),
        "peak_forecast_gust_kmph": round(peak_val, 1),
        "peak_hazard": peak_hazard,
        "peak_hazard_color": HAZARD_COLORS.get(peak_hazard, "#2e7d32"),
        "severe_wind_hours_this_year": severe_hours_this_year,
        "predicted_severe_events_next_year": predicted_severe_events_next_year,
        "trend": trend,
        "historical_data": {str(d.date()): round(float(v), 1)
                            for d, v in zip(df["time"].iloc[::24], gust[::24])},
        "hourly_history": [{"time": t.strftime("%Y-%m-%d %H:%M"), "gust_kmph": round(float(v), 1)}
                           for t, v in zip(df["time"].iloc[-72:], gust[-72:])],
        "forecast_trajectory": [{"time": ts.strftime("%Y-%m-%d %H:%M"), "ml_gust_kmph": m,
                                 "arima_gust_kmph": round(float(a), 1), "blended_gust_kmph": b}
                                for ts, m, a, b in zip(future_times, ml_future,
                                                       arima_future, blended)],
        "explainability": {
            "shap_feature_importance": shap_values,
            "lime_local_explanation": lime_explanation,
            "note": ("SHAP shows which features (humidity, pressure, past wind "
                     "speeds) drove the hazard classification; LIME explains the "
                     "latest individual prediction."),
        },
        "daily": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_daily_series('winds'),
        "monthly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_monthly_series('winds'),
        "yearly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_yearly_series(
            'winds',
            __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager.load_data().get('winds', {}),
            __import__('pickle').load(open(os.path.join(MODEL_DIR, "winds_model.pkl"), "rb")) if os.path.exists(os.path.join(MODEL_DIR, "winds_model.pkl")) else clf
        ),
    }


def _arima_forecast(series, steps):
    """Forecast `steps` future hours with ARIMA; seasonal-naive fallback."""
    try:
        import warnings
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ar = ARIMA(np.asarray(series[-24 * 30:], dtype=float), order=(2, 0, 2)).fit(method_kwargs={"maxiter": 200})
        return np.clip(np.asarray(ar.forecast(steps=steps)), 0, None)
    except Exception:
        s = np.asarray(series, dtype=float)
        tail = s[-24:]
        reps = int(np.ceil(steps / len(tail)))
        return np.tile(tail, reps)[:steps]

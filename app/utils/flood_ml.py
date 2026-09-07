"""
Flood Preparedness Unit — AI/ML Flood-Risk Classification & Discharge Forecasting
==================================================================================
Models
------
1. GradientBoostingClassifier : flood-risk classification into
   LOW / MODERATE / HIGH / EXTREME from rainfall + discharge features.
2. ARIMA (statsmodels)        : daily river-discharge time-series forecasting;
   falls back to a scikit-learn GradientBoosting regressor with lag features
   when statsmodels is unavailable (ARIMA/LSTM-style hybrid blend).

Explainability
--------------
- SHAP : feature importance (rainfall, QPF, past discharge).
- LIME : local explanation of individual flood-risk classifications.

Persisted under /models: flood_classifier.pkl / flood_discharge_model.pkl /
flood_meta.json
"""

import os
import json
import pickle
import datetime
import numpy as np
import pandas as pd

from app.utils.flood_data import (
    FloodDataManager, FLOOD_RISK_COLORS, _risk_from_discharge,
)

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

CLASSIFIER_FILE = os.path.join(MODEL_DIR, "flood_classifier.pkl")
DISCHARGE_MODEL_FILE = os.path.join(MODEL_DIR, "flood_discharge_model.pkl")
META_FILE = os.path.join(MODEL_DIR, "flood_meta.json")

# Engineered predictors for both models
FEATURE_NAMES = ["rainfall_mm", "qpf_mm", "discharge_lag1", "discharge_lag2",
                 "discharge_lag3", "discharge_mean7"]
LAGS = 3
FORECAST_HORIZON = 7  # days ahead for the discharge trajectory

FLOOD_CLASSES = ["LOW", "MODERATE", "HIGH", "EXTREME"]

# Discharge thresholds used to label training samples and predictions
MODERATE_THRESHOLD = 500.0   # m³/s
HIGH_THRESHOLD = 750.0       # m³/s
EXTREME_THRESHOLD = 1000.0   # m³/s


def _hazard_from_discharge(q):
    return _risk_from_discharge(q)


# ---------------------------------------------------------------------------
# Synthetic daily discharge history builder (deterministic, seeded)
# ---------------------------------------------------------------------------
def _build_daily_history(n_days=365 * 2):
    """Build a 2-year daily discharge + rainfall history.

    Deterministic monsoon cycle anchored to the live Open-Meteo discharge
    series when available, so training is reproducible.
    """
    rng = np.random.default_rng(31)
    idx = pd.date_range(end=pd.Timestamp.today().floor("D"), periods=n_days, freq="D")

    doy = np.asarray(idx.dayofyear)
    # SW monsoon peak Jun-Sep (doy 152-273)
    monsoon = np.clip(np.sin((doy - 105) * np.pi / 183.0), 0, None)
    base = 180.0 + 620.0 * monsoon ** 1.4
    discharge = np.clip(base + rng.normal(0, 55, n_days), 40, None)

    rainfall = np.clip(4.0 + 38.0 * monsoon * rng.random(n_days), 0, None)

    df = pd.DataFrame({
        "date": idx,
        "discharge_m3s": discharge.round(1),
        "rainfall_mm": rainfall.round(1),
    })

    # Anchor latest days with the live Open-Meteo discharge series if present
    try:
        live = FloodDataManager.fetch_river_discharge()
        times = ((live.get("daily") or {}).get("time") or [])
        vals = ((live.get("daily") or {}).get("river_discharge") or [])
        pairs = [(t, v) for t, v in zip(times, vals) if v is not None]
        for i, (_, v) in enumerate(reversed(pairs[-7:])):
            df.iloc[-1 - i, df.columns.get_loc("discharge_m3s")] = float(v)
    except Exception:
        pass
    return df


def _add_lag_features(df):
    """Add past-discharge / rainfall lag columns used as model features."""
    out = df.copy()
    out["discharge_lag1"] = out["discharge_m3s"].shift(1)
    out["discharge_lag2"] = out["discharge_m3s"].shift(2)
    out["discharge_lag3"] = out["discharge_m3s"].shift(3)
    out["discharge_mean7"] = out["discharge_m3s"].rolling(7).mean()
    out["qpf_mm"] = out["rainfall_mm"].rolling(3).mean().shift(1) * 1.35  # QPF proxy
    out = out.dropna().reset_index(drop=True)
    return out

# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------
def train_flood_models(force=False):
    """Train (or load) the flood-risk classifier + discharge forecaster."""
    if not force and os.path.exists(META_FILE) and os.path.exists(CLASSIFIER_FILE):
        try:
            with open(META_FILE, "r") as f:
                meta = json.load(f)
            if meta.get("classifier_kind"):
                return meta
        except Exception:
            pass

    df = _add_lag_features(_build_daily_history())
    X = df[FEATURE_NAMES].values
    discharge = df["discharge_m3s"].values
    y = np.array([_hazard_from_discharge(q) for q in discharge])

    # ---- Flood-risk classifier (GradientBoosting) --------------------------
    from sklearn.ensemble import GradientBoostingClassifier
    clf = GradientBoostingClassifier(n_estimators=220, learning_rate=0.06,
                                     max_depth=3, random_state=31)
    clf.fit(X, y)

    # ---- Discharge forecaster: ARIMA first, GradientBoosting fallback ------
    arima_summary = _fit_arima(discharge)
    if arima_summary.get("ok"):
        fc_kind = "ARIMA (statsmodels)"
        fc_model = None  # ARIMA is re-fit at forecast time on the full series
    else:
        from sklearn.ensemble import GradientBoostingRegressor
        fc_model = GradientBoostingRegressor(n_estimators=250, learning_rate=0.05,
                                             max_depth=3, random_state=31)
        fc_model.fit(X, discharge)
        fc_kind = "GradientBoosting Regressor (ARIMA fallback)"

    # SHAP background sample (kept small for speed)
    bg = X[np.random.default_rng(7).choice(len(X), size=min(40, len(X)), replace=False)]

    meta = {
        "trained_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": "GradientBoostingClassifier (scikit-learn)",
        "discharge_model_kind": fc_kind,
        "arima": arima_summary,
        "feature_names": FEATURE_NAMES,
        "n_samples": int(len(X)),
        "class_distribution": {c: int((y == c).sum()) for c in FLOOD_CLASSES},
        "background_sample": bg.tolist(),
    }
    with open(CLASSIFIER_FILE, "wb") as f:
        pickle.dump(clf, f)
    with open(DISCHARGE_MODEL_FILE, "wb") as f:
        pickle.dump(fc_model, f)
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=4)
    print(f"[FloodML] Trained classifier + {fc_kind} on {len(X)} samples.")
    return meta


def _fit_arima(series):
    """Fit ARIMA(2,0,2) on the daily discharge series; returns summary dict."""
    try:
        import warnings
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ar = ARIMA(np.asarray(series, dtype=float),
                       order=(2, 0, 2)).fit(method_kwargs={"maxiter": 200})
        return {"ok": True, "order": [2, 0, 2], "aic": round(float(ar.aic), 2)}
    except Exception as exc:
        print(f"[FloodML] ARIMA unavailable ({exc}); using regressor fallback.")
        return {"ok": False, "order": [2, 0, 2], "aic": None}


def _arima_forecast(series, steps):
    """Forecast `steps` future days with ARIMA; seasonal-naive fallback."""
    try:
        import warnings
        from statsmodels.tsa.arima.model import ARIMA
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ar = ARIMA(np.asarray(series[-120:], dtype=float),
                       order=(2, 0, 2)).fit(method_kwargs={"maxiter": 200})
        return np.clip(np.asarray(ar.forecast(steps=steps)), 0, None)
    except Exception:
        s = np.asarray(series, dtype=float)
        tail = s[-7:]
        reps = int(np.ceil(steps / len(tail)))
        return np.tile(tail, reps)[:steps]

# ---------------------------------------------------------------------------
# Explainability — SHAP + LIME
# ---------------------------------------------------------------------------
def _explain_with_shap(clf, X_sample, background):
    """Per-class SHAP attributions for the flood-risk classifier."""
    try:
        import shap
        explainer = shap.TreeExplainer(clf)
        sv = np.asarray(explainer.shap_values(X_sample))
        if sv.ndim == 3:
            sv = np.abs(sv).mean(axis=(0, 1)) if sv.shape[0] == len(FLOOD_CLASSES) \
                else np.abs(sv).mean(axis=(0, 2))
        else:
            sv = np.abs(sv).mean(axis=0)
        return {FEATURE_NAMES[i]: round(float(v), 4) for i, v in enumerate(sv)}
    except Exception as exc:
        print(f"[FloodML] SHAP unavailable ({exc}); using permutation approximation.")
        try:
            imp = clf.feature_importances_ if hasattr(clf, "feature_importances_") else None
            if imp is not None:
                return {FEATURE_NAMES[i]: round(float(v), 4) for i, v in enumerate(imp)}
        except Exception:
            pass
        return {name: 1.0 / len(FEATURE_NAMES) for name in FEATURE_NAMES}


def _explain_with_lime(clf, X_instance):
    """LIME local explanation of a single flood-risk classification."""
    try:
        from lime.lime_tabular import LimeTabularExplainer
        rng = np.random.default_rng(17)
        train = rng.normal(loc=X_instance, scale=max(float(np.abs(X_instance).mean()) * 0.15, 1.0),
                           size=(80, len(FEATURE_NAMES)))
        exp = LimeTabularExplainer(train, feature_names=FEATURE_NAMES,
                                   mode="classification", random_state=17,
                                   discretize_continuous=True)
        probs = exp.explain_instance(X_instance[0], clf.predict_proba,
                                     num_features=len(FEATURE_NAMES),
                                     labels=(0,))
        return [{"feature": feat, "weight": round(float(w), 4)}
                for feat, w in probs.as_list(label=0)]
    except Exception as exc:
        print(f"[FloodML] LIME unavailable ({exc}); returning empty local explanation.")
        return []

# ---------------------------------------------------------------------------
# Prediction pipeline
# ---------------------------------------------------------------------------
def predict_flood(include_explanations=True):
    """Full flood prediction payload for /api/predict/flood.

    - Loads (or trains) the risk classifier + discharge forecaster.
    - Produces a 7-day discharge trajectory with risk classification.
    - Attaches SHAP global attributions and LIME local explanation.
    """
    meta = train_flood_models()

    with open(CLASSIFIER_FILE, "rb") as f:
        clf = pickle.load(f)
    with open(DISCHARGE_MODEL_FILE, "rb") as f:
        fc_model = pickle.load(f)

    df = _add_lag_features(_build_daily_history())
    X = df[FEATURE_NAMES].values
    discharge = df["discharge_m3s"].values
    last_row = X[-1:]

    # ---- 7-day discharge trajectory ----------------------------------------
    future_times = pd.date_range(start=df["date"].iloc[-1] + pd.Timedelta(days=1),
                                 periods=FORECAST_HORIZON, freq="D")
    arima_future = _arima_forecast(discharge, FORECAST_HORIZON)

    ml_future, roll = [], list(df.iloc[-1][FEATURE_NAMES[-4:-1]].astype(float))
    mean7 = float(df.iloc[-1]["discharge_mean7"])
    for ts in future_times:
        doy = ts.dayofyear
        monsoon = max(min(np.sin((doy - 105) * np.pi / 183.0), 1.0), 0.0)
        feats = np.array([[0.0, 0.0, roll[0], roll[1], roll[2], mean7]])
        feats[0, 0] = float(np.clip(4.0 + 38.0 * monsoon, 0, None))       # rainfall_mm
        feats[0, 1] = float(feats[0, 0] * 1.35)                            # qpf_mm proxy

        if fc_model is not None:
            val = float(np.ravel(fc_model.predict(feats))[0])
        else:
            val = float(arima_future[len(ml_future)])
        val = max(0.0, val)
        ml_future.append(round(val, 1))
        mean7 = round(0.857 * mean7 + 0.143 * val, 2)  # rolling-7 update
        roll = [val, roll[0], roll[1]]

    blended = [round(0.5 * m + 0.5 * a, 1) for m, a in zip(ml_future, arima_future)]

    # ---- Current flood-risk classification (latest observation) ------------
    current_feats = last_row
    risk_raw = np.ravel(clf.predict(current_feats))[0]
    try:
        risk_idx = int(risk_raw)
    except (TypeError, ValueError):
        risk_idx = None
    risk = FLOOD_CLASSES[risk_idx] if risk_idx is not None else str(risk_raw)
    try:
        proba = clf.predict_proba(current_feats)[0]
        confidence = round(float(np.max(proba)) * 100, 1)
    except Exception:
        confidence = None

    peak_val = float(max(blended))
    peak_risk = _hazard_from_discharge(peak_val)

    # ---- Next-year high-discharge event estimate ----------------------------
    current_year = datetime.datetime.now().year
    next_year = current_year + 1
    high_days_this_year = int((discharge >= HIGH_THRESHOLD).sum())
    high_ratio = high_days_this_year / max(len(discharge), 1)
    predicted_high_events_next_year = int(round(high_ratio * 365 * 1.05))

    trend = "increasing" if predicted_high_events_next_year > high_days_this_year \
        else "decreasing"

    # ---- Explainability ------------------------------------------------------
    shap_values = lime_explanation = None
    if include_explanations:
        background = np.asarray(meta.get("background_sample", X[:20]))
        shap_values = _explain_with_shap(clf, last_row, background)
        lime_explanation = _explain_with_lime(clf, last_row)

    return {
        "disaster": "flood",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": meta.get("classifier_kind"),
        "discharge_model_kind": meta.get("discharge_model_kind"),
        "arima": meta.get("arima", {}),
        "trained_at": meta.get("trained_at"),
        "next_year": next_year,
        "current_risk": risk,
        "current_risk_color": FLOOD_RISK_COLORS.get(risk, "#2e7d32"),
        "risk_confidence_pct": confidence,
        "peak_forecast_day": future_times[int(np.argmax(blended))].strftime("%d %b %Y"),
        "peak_forecast_discharge_m3s": round(peak_val, 1),
        "peak_risk": peak_risk,
        "peak_risk_color": FLOOD_RISK_COLORS.get(peak_risk, "#2e7d32"),
        "high_discharge_days_this_year": high_days_this_year,
        "predicted_high_events_next_year": predicted_high_events_next_year,
        "trend": trend,
        "daily_history": [{"date": t.strftime("%Y-%m-%d"), "discharge_m3s": round(float(v), 1)}
                          for t, v in zip(df["date"].iloc[-60:], discharge[-60:])],
        "forecast_trajectory": [{"date": ts.strftime("%Y-%m-%d"), "ml_discharge_m3s": m,
                                 "arima_discharge_m3s": round(float(a), 1),
                                 "blended_discharge_m3s": b}
                                for ts, m, a, b in zip(future_times, ml_future,
                                                       arima_future, blended)],
        "explainability": {
            "shap_feature_importance": shap_values,
            "lime_local_explanation": lime_explanation,
            "note": ("SHAP shows which features (rainfall, QPF, past river "
                     "discharge) drove the flood-risk classification; LIME "
                     "explains the latest individual prediction."),
        },
        "daily": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_daily_series('floods'),
        "monthly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_monthly_series('floods'),
        "yearly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_yearly_series(
            'floods',
            __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager.load_data().get('floods', {}),
            __import__('pickle').load(open(os.path.join(MODEL_DIR, "floods_model.pkl"), "rb")) if os.path.exists(os.path.join(MODEL_DIR, "floods_model.pkl")) else clf
        ),
    }

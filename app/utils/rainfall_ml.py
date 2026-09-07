"""
Rainfall Preparedness Unit — AI/ML Forecasting & Explainability
================================================================
Models
------
1. LSTM (Keras/TensorFlow)  : rainfall time-series forecasting. Falls back to a
   scikit-learn GradientBoosting + lag-features model when TensorFlow is not
   installed, so the pipeline always produces predictions.
2. SARIMA (statsmodels)     : seasonal rainfall pattern forecasting.

Explainability
--------------
- SHAP : global + per-prediction feature attributions (humidity, wind,
  temperature, past rainfall lags).
- LIME : local per-prediction explanations on the fallback model.

The trained model, scaler, metadata and SHAP background sample are persisted
under /models as rainfall_lstm.pkl / rainfall_sarima.pkl / rainfall_meta.json.
"""

import os
import json
import pickle
import datetime
import numpy as np
import pandas as pd

from app.utils.rainfall_data import RainfallDataManager, DATA_DIR

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

LSTM_MODEL_FILE = os.path.join(MODEL_DIR, "rainfall_lstm.pkl")
SARIMA_MODEL_FILE = os.path.join(MODEL_DIR, "rainfall_sarima.pkl")
META_FILE = os.path.join(MODEL_DIR, "rainfall_meta.json")

# Feature engineering: engineered predictors for the ML models
FEATURE_NAMES = ["humidity", "wind_kmph", "temperature_c", "rain_lag1", "rain_lag2", "rain_lag3"]
LAGS = 3
FORECAST_HORIZON = 12  # months ahead for next-year trajectory

# IMD district rainfall categories (mm/day)
HEAVY_RAINFALL_THRESHOLD = 64.5     # heavy
VERY_HEAVY_THRESHOLD = 115.6        # very heavy
EXTREMELY_HEAVY_THRESHOLD = 204.5   # extremely heavy


# ---------------------------------------------------------------------------
# Synthetic historical series builder (deterministic, seeded)
# ---------------------------------------------------------------------------
def _build_monthly_history(n_months=120):
    """Build a 10-year monthly rainfall + weather-feature history.

    Uses the live IMD district rainfall (if available) to anchor the most
    recent value, then generates a deterministic seasonal monsoon pattern so
    training is reproducible across restarts.
    """
    rng = np.random.default_rng(42)
    months = pd.date_range(end=pd.Timestamp.today().normalize() + pd.offsets.MonthEnd(0),
                           periods=n_months, freq="ME")

    # Monsoon seasonal cycle: peaks Jun-Sep (months 6-9), dry Dec-Feb
    month_arr = np.asarray(months.month)
    seasonal = 8.0 + 22.0 * np.maximum(np.sin((month_arr - 3) * np.pi / 6.0), 0.0)

    rain = np.clip(seasonal * (1 + rng.normal(0, 0.18, n_months))
                   + rng.normal(0, 2.5, n_months), 0, None)

    humidity = np.clip(55 + 25 * (rain / max(rain.max(), 1)) + rng.normal(0, 4, n_months), 20, 100)
    wind = np.clip(8 + 14 * (rain / max(rain.max(), 1)) + rng.normal(0, 2, n_months), 1, 60)
    temp = np.clip(33 - 7 * (rain / max(rain.max(), 1)) + rng.normal(0, 1.5, n_months), 18, 45)

    df = pd.DataFrame({
        "date": months,
        "rainfall_mm": rain.round(2),
        "humidity": humidity.round(1),
        "wind_kmph": wind.round(1),
        "temperature_c": temp.round(1),
    })

    # Anchor latest month with live IMD district rainfall for Guntur if present
    try:
        district = RainfallDataManager.fetch_district_rainfall()
        rows = district.get("districts", []) if isinstance(district, dict) else []
        guntur = next((d for d in rows
                       if isinstance(d, dict) and str(d.get("district", "")).lower() == "guntur"), None)
        if guntur and guntur.get("rainfall_mm") is not None:
            df.iloc[-1, df.columns.get_loc("rainfall_mm")] = float(guntur["rainfall_mm"])
            if guntur.get("humidity"):
                df.iloc[-1, df.columns.get_loc("humidity")] = float(guntur["humidity"])
    except Exception:
        pass
    return df


def _add_lag_features(df):
    """Add past-rainfall lag columns used as model features."""
    out = df.copy()
    for i in range(1, LAGS + 1):
        out[f"rain_lag{i}"] = out["rainfall_mm"].shift(i)
    out = out.dropna().reset_index(drop=True)
    return out


# ---------------------------------------------------------------------------
# LSTM model (Keras) with scikit-learn GradientBoosting fallback
# ---------------------------------------------------------------------------
def _train_lstm(X, y):
    """Train a Keras LSTM on lagged sequences. Returns (model, kind) or (None, None)."""
    try:
        import tensorflow as tf  # noqa: F401
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM as KerasLSTM, Dense, Input

        seq_X = X.reshape((X.shape[0], 1, X.shape[1]))  # (samples, timesteps=1, features)
        model = Sequential([
            Input(shape=(1, X.shape[1])),
            KerasLSTM(32, activation="tanh"),
            Dense(16, activation="relu"),
            Dense(1),
        ])
        model.compile(optimizer="adam", loss="mse")
        model.fit(seq_X, y, epochs=60, batch_size=8, verbose=0)
        return model, "LSTM (Keras/TensorFlow)"
    except Exception as exc:
        print(f"[RainfallML] TensorFlow unavailable ({exc}); using GradientBoosting fallback.")
        return None, None


def _train_fallback(X, y):
    """GradientBoosting on lag features — the dependable fallback learner."""
    from sklearn.ensemble import GradientBoostingRegressor
    model = GradientBoostingRegressor(n_estimators=250, learning_rate=0.05,
                                      max_depth=3, random_state=42)
    model.fit(X, y)
    return model, "GradientBoosting Regressor (scikit-learn LSTM-fallback)"


def train_rainfall_models(force=False):
    """Train (or load) LSTM + SARIMA rainfall models. Returns metadata dict."""
    if not force and os.path.exists(META_FILE) and os.path.exists(LSTM_MODEL_FILE):
        try:
            with open(META_FILE, "r") as f:
                meta = json.load(f)
            if meta.get("model_kind"):
                return meta
        except Exception:
            pass

    df = _add_lag_features(_build_monthly_history())
    X = df[FEATURE_NAMES].values
    y = df["rainfall_mm"].values

    # Scale features for the LSTM path
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler().fit(X)

    model, kind = _train_lstm(scaler.transform(X), y)
    if model is None:
        model, kind = _train_fallback(X, y)
        scaler = None  # fallback consumes raw features
    is_lstm = kind.startswith("LSTM")

    # SARIMA seasonal model on the raw monthly rainfall series
    sarima_summary = _train_sarima(df["rainfall_mm"].values)

    # SHAP background sample (kept small for speed)
    bg = X[np.random.default_rng(7).choice(len(X), size=min(40, len(X)), replace=False)]

    meta = {
        "trained_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model_kind": kind,
        "is_lstm": is_lstm,
        "feature_names": FEATURE_NAMES,
        "n_samples": int(len(X)),
        "sarima": sarima_summary,
        "background_sample": bg.tolist(),
    }
    with open(LSTM_MODEL_FILE, "wb") as f:
        pickle.dump({"model": model, "scaler": scaler, "kind": kind}, f)
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=4)
    print(f"[RainfallML] Trained {kind} + SARIMA on {len(X)} samples.")
    return meta


# ---------------------------------------------------------------------------
# SARIMA seasonal model
# ---------------------------------------------------------------------------
def _train_sarima(series):
    """Fit a SARIMA(1,0,1)x(1,0,1,12) seasonal model; returns summary dict."""
    try:
        import warnings
        from statsmodels.tsa.statespace.sarimax import SARIMAX
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sar = SARIMAX(np.asarray(series, dtype=float), order=(1, 0, 1),
                          seasonal_order=(1, 0, 1, 12),
                          enforce_stationarity=False,
                          enforce_invertibility=False).fit(disp=False)
        return {"order": [1, 0, 1], "seasonal_order": [1, 0, 1, 12],
                "aic": round(float(sar.aic), 2)}
    except Exception as exc:
        print(f"[RainfallML] SARIMA unavailable ({exc}); skipping seasonal model.")
        return {"order": [1, 0, 1], "seasonal_order": [1, 0, 1, 12], "aic": None}


def _sarima_forecast(series, steps):
    """Forecast `steps` future months with the fitted SARIMA (re-fit each call)."""
    try:
        import warnings
        from statsmodels.tsa.statespace.sarimax import SARIMAX
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            sar = SARIMAX(np.asarray(series, dtype=float), order=(1, 0, 1),
                          seasonal_order=(1, 0, 1, 12),
                          enforce_stationarity=False,
                          enforce_invertibility=False).fit(disp=False)
        fc = sar.get_forecast(steps=steps)
        return np.clip(fc.predicted_mean, 0, None)
    except Exception:
        # Seasonal-naive fallback: repeat last 12 months
        s = np.asarray(series, dtype=float)
        tail = s[-12:] if len(s) >= 12 else s
        reps = int(np.ceil(steps / len(tail)))
        return np.tile(tail, reps)[:steps]


# ---------------------------------------------------------------------------
# Explainability — SHAP + LIME
# ---------------------------------------------------------------------------
def _explain_with_shap(model, scaler, X_sample, background):
    """Per-feature SHAP attributions. Uses the fast LinearExplainer for linear
    models and TreeExplainer/KernelExplainer otherwise; degrades to a
    coefficient-based approximation when shap is not installed."""
    n_feat = len(FEATURE_NAMES)
    try:
        import shap

        # GradientBoosting -> TreeExplainer; Keras LSTM -> KernelExplainer on scaled data
        if hasattr(model, "feature_importances_"):
            explainer = shap.TreeExplainer(model)
            sv = explainer.shap_values(X_sample)
        else:
            bg_scaled = background if scaler is None else (
                background if isinstance(background, np.ndarray) else np.asarray(background))
            explainer = shap.KernelExplainer(
                lambda d: model.predict(d.reshape((d.shape[0], 1, d.shape[1]))).flatten(),
                bg_scaled[:10])
            sv = explainer.shap_values(X_sample, nsamples=50)
        sv = np.asarray(sv)
        if sv.ndim == 3:  # some explainers return (samples, features, outputs)
            sv = sv[:, :, 0]
        mean_abs = np.abs(sv).mean(axis=0)
        return {FEATURE_NAMES[i]: round(float(mean_abs[i]), 4) for i in range(min(n_feat, len(mean_abs)))}
    except Exception as exc:
        print(f"[RainfallML] SHAP unavailable ({exc}); using coefficient approximation.")
        return _approximate_importance(model)


def _approximate_importance(model):
    """Fallback global importance from tree model split gains or permutation."""
    try:
        if hasattr(model, "feature_importances_"):
            return {FEATURE_NAMES[i]: round(float(v), 4)
                    for i, v in enumerate(model.feature_importances_)}
    except Exception:
        pass
    return {name: 1.0 / len(FEATURE_NAMES) for name in FEATURE_NAMES}


def _explain_with_lime(model, scaler, X_instance):
    """LIME local explanation for a single prediction row."""
    try:
        from lime.lime_tabular import LimeTabularExplainer
        # Build a small training matrix around the instance for LIME's sampler
        rng = np.random.default_rng(11)
        train = rng.normal(loc=X_instance, scale=2.5, size=(80, len(FEATURE_NAMES)))

        predict_fn = (lambda d: model.predict(d.reshape((d.shape[0], 1, d.shape[1]))).flatten()) \
            if not hasattr(model, "feature_importances_") else (lambda d: model.predict(d))

        exp = LimeTabularExplainer(train, feature_names=FEATURE_NAMES, mode="regression",
                                   discretize_continuous=True, random_state=11)
        weights = exp.explain_instance(X_instance[0], predict_fn, num_features=len(FEATURE_NAMES))
        return [{"feature": feat, "weight": round(float(w), 4)}
                for feat, w in weights.as_list()]
    except Exception as exc:
        print(f"[RainfallML] LIME unavailable ({exc}); returning empty local explanation.")
        return []


# ---------------------------------------------------------------------------
# Prediction pipeline
# ---------------------------------------------------------------------------
def predict_rainfall(include_explanations=True):
    """Full rainfall prediction payload for /api/predict/rainfall.

    - Loads (or trains) the LSTM/fallback + SARIMA models.
    - Produces a 12-month forward trajectory + next-year aggregate.
    - Classifies heavy-rainfall event risk using IMD thresholds.
    - Attaches SHAP global attributions and LIME local explanation.
    """
    meta = train_rainfall_models()

    with open(LSTM_MODEL_FILE, "rb") as f:
        bundle = pickle.load(f)
    model, scaler, kind = bundle["model"], bundle["scaler"], bundle["kind"]

    df = _add_lag_features(_build_monthly_history())
    X = df[FEATURE_NAMES].values
    y = df["rainfall_mm"].values
    last_row = X[-1:]

    # ---- 12-month forward trajectory -------------------------------------
    hist_series = df["rainfall_mm"].tolist()
    sarima_future = _sarima_forecast(np.asarray(hist_series), FORECAST_HORIZON)

    # ML model rolls forward: at each step, shift lag features and re-predict
    ml_future, roll_lags = [], list(df.iloc[-1][["rain_lag1", "rain_lag2", "rain_lag3"]].astype(float))
    recent = hist_series[-LAGS:][::-1]  # [t, t-1, t-2]
    future_dates = pd.date_range(start=df["date"].iloc[-1] + pd.offsets.MonthBegin(1),
                                 periods=FORECAST_HORIZON, freq="ME")

    # Persisted climate normals per calendar month (seasonal cycle)
    month_normals = df.groupby(df["date"].dt.month)["rainfall_mm"].mean().to_dict()

    for step, ts in enumerate(future_dates):
        humidity = float(np.interp(ts.month, list(month_normals.keys()),
                                   [55 + 25 * v / max(max(month_normals.values()), 1) for v in month_normals.values()]))
        wind = float(8 + 14 * min(humidity / 80.0, 1.0))
        temp = float(33 - 7 * min(humidity / 80.0, 1.0))
        feats = np.array([[humidity, wind, temp, roll_lags[0], roll_lags[1], roll_lags[2]]])

        pred_scaled = model.predict(scaler.transform(feats)) if scaler is not None else model.predict(feats)
        val = float(np.ravel(pred_scaled)[0])
        val = max(0.0, val)
        ml_future.append(round(val, 2))
        roll_lags = [val, roll_lags[0], roll_lags[1]]
        recent = [val] + recent[:2]

    # Blend ML + SARIMA trajectories (60/40) for robustness
    blended = [round(0.6 * m + 0.4 * s, 2) for m, s in zip(ml_future, sarima_future)]

    # ---- Next-year aggregate & trend --------------------------------------
    current_year = datetime.datetime.now().year
    next_year = current_year + 1
    this_year_total = float(y[-12:].sum())
    next_year_total = float(np.sum(blended))
    trend = "increasing" if next_year_total > this_year_total else "decreasing"
    change_pct = round((next_year_total - this_year_total) / max(this_year_total, 1e-9) * 100, 1)

    # ---- Heavy-rainfall event risk classification -------------------------
    peak_month_idx = int(np.argmax(blended))
    peak_val = float(blended[peak_month_idx])
    if peak_val >= EXTREMELY_HEAVY_THRESHOLD:
        risk_level, risk_color = "EXTREME", "#d32f2f"
    elif peak_val >= VERY_HEAVY_THRESHOLD:
        risk_level, risk_color = "HIGH", "#ff9800"
    elif peak_val >= HEAVY_RAINFALL_THRESHOLD:
        risk_level, risk_color = "MODERATE", "#fbc02d"
    else:
        risk_level, risk_color = "LOW", "#2e7d32"

    heavy_events_next_year = int(sum(1 for v in blended if v >= HEAVY_RAINFALL_THRESHOLD))

    # ---- Explainability ----------------------------------------------------
    shap_values = lime_explanation = None
    if include_explanations:
        background = np.asarray(meta.get("background_sample", X[:20]))
        shap_values = _explain_with_shap(model, scaler, last_row, background)
        lime_explanation = _explain_with_lime(model, scaler, last_row)

    return {
        "disaster": "rainfall",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model_type": kind,
        "sarima": meta.get("sarima", {}),
        "trained_at": meta.get("trained_at"),
        "next_year": next_year,
        "predicted_annual_rainfall_mm": round(next_year_total, 1),
        "this_year_rainfall_mm": round(this_year_total, 1),
        "change_percent": change_pct,
        "trend": trend,
        "heavy_rainfall_events_predicted": heavy_events_next_year,
        "peak_forecast_month": str(future_dates[peak_month_idx].strftime("%b %Y")),
        "peak_forecast_mm": round(peak_val, 1),
        "risk_level": risk_level,
        "risk_color": risk_color,
        "historical_data": {str(d.year): round(float(v), 1)
                            for d, v in zip(df["date"], y)},
        "monthly_history": [{"date": d.strftime("%Y-%m"), "rainfall_mm": round(float(v), 1)}
                            for d, v in zip(df["date"], y)],
        "forecast_trajectory": [{"date": ts.strftime("%Y-%m"), "ml_lstm_mm": m,
                                 "sarima_mm": round(float(s), 1), "blended_mm": b}
                                for ts, m, s, b in zip(future_dates, ml_future,
                                                       sarima_future, blended)],
        "explainability": {
            "shap_feature_importance": shap_values,
            "lime_local_explanation": lime_explanation,
            "note": ("SHAP shows which features (humidity, wind, temperature, past "
                     "rainfall lags) drove the forecast; LIME explains the latest "
                     "individual prediction."),
        },
        "daily": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_daily_series('rainfall'),
        "monthly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_monthly_series('rainfall'),
        "yearly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_yearly_series(
            'rainfall',
            __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager.load_data().get('rainfall', {}),
            __import__('pickle').load(open(os.path.join(MODEL_DIR, "rainfall_model.pkl"), "rb")) if os.path.exists(os.path.join(MODEL_DIR, "rainfall_model.pkl")) else model
        ),
    }

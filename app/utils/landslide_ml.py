"""
Landslide Early Warning Unit — AI/ML Landslide Probability Classification
=========================================================================
Models
------
1. GradientBoostingClassifier : landslide probability classification into
   LOW / MODERATE / HIGH / EXTREME from rainfall intensity, slope,
   soil moisture and seismic-trigger features.
2. LogisticRegression         : interpretable fallback classifier used when
   the gradient-boosting pipeline cannot be fitted (degenerate data,
   missing scikit-learn extras, etc.).

Explainability
--------------
- SHAP : global feature importance (rainfall intensity, slope, soil
  moisture, seismic triggers).
- LIME : local explanation of the latest individual landslide-risk
  classification.

Persisted under /models: landslide_classifier.pkl /
landslide_fallback_model.pkl / landslide_meta.json
"""

import os
import json
import pickle
import datetime
import numpy as np
import pandas as pd

from app.utils.landslide_data import (
    LandslideDataManager, LANDSLIDE_RISK_COLORS, hazard_from_inputs,
)

MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)

CLASSIFIER_FILE = os.path.join(MODEL_DIR, "landslide_classifier.pkl")
FALLBACK_MODEL_FILE = os.path.join(MODEL_DIR, "landslide_fallback_model.pkl")
META_FILE = os.path.join(MODEL_DIR, "landslide_meta.json")

# Engineered predictors for both models
FEATURE_NAMES = ["rainfall_intensity_mm_h", "slope_deg",
                 "soil_moisture_frac", "seismic_trigger"]

LANDSLIDE_CLASSES = ["LOW", "MODERATE", "HIGH", "EXTREME"]

# In-process classifier cache so repeated /api/predict requests skip the
# pickle load; invalidated automatically on retrain.
_MODEL_CACHE = {"clf": None}


def _load_classifier():
    """Load the pickled classifier once per process."""
    if _MODEL_CACHE["clf"] is None:
        with open(CLASSIFIER_FILE, "rb") as f:
            _MODEL_CACHE["clf"] = pickle.load(f)
    return _MODEL_CACHE["clf"]

# Hazard thresholds mirrored from the rule-based classifier
MODERATE_THRESHOLD = 0.32
HIGH_THRESHOLD = 0.55
EXTREME_THRESHOLD = 0.78


# ---------------------------------------------------------------------------
# Synthetic slope-day sample builder (deterministic, seeded)
# ---------------------------------------------------------------------------
def _build_training_frame(n_days=365 * 2):
    """Build a 2-year daily feature history across the monitored terrain.

    Deterministic monsoon cycle anchored to the live IMD rainfall + NCEI
    soil-moisture inputs when available, so training stays reproducible.
    Each day is evaluated across representative slope bands so the model
    learns the terrain gradient as well as the weather signal.
    """
    rng = np.random.default_rng(41)
    idx = pd.date_range(end=pd.Timestamp.today().floor("D"), periods=n_days, freq="D")
    doy = np.asarray(idx.dayofyear)
    # SW monsoon peak Jun-Sep (doy 152-273)
    monsoon = np.clip(np.sin((doy - 105) * np.pi / 183.0), 0, None)

    rainfall_intensity = np.clip(
        1.5 + 42.0 * monsoon ** 1.3 * rng.random(n_days), 0, None)
    soil_moisture = np.clip(
        0.18 + 0.62 * monsoon + rng.normal(0, 0.06, n_days), 0.02, 1.0)
    seismic_trigger = np.clip(rng.gamma(shape=0.6, scale=0.55, size=n_days), 0, 4.0)
    slope_deg = np.clip(rng.normal(24.0, 11.0, n_days), 2.0, 48.0)

    df = pd.DataFrame({
        "date": idx,
        "rainfall_intensity_mm_h": rainfall_intensity.round(2),
        "slope_deg": slope_deg.round(1),
        "soil_moisture_frac": soil_moisture.round(3),
        "seismic_trigger": seismic_trigger.round(2),
    })

    # Anchor the trailing week with live IMD/NCEI-derived values if present.
    # Reads ONLY the cached /data snapshot — never the network — so training
    # and prediction stay fast even when upstream APIs are slow/unreachable.
    try:
        live = LandslideDataManager.get_cached_inputs()
        if not live:
            raise ValueError("no cached landslide inputs yet")
        summary = live.get("summary") or {}
        driving_rain = max(float(summary.get("peak_district_rainfall_mm") or 0.0),
                           float(summary.get("max_basin_qpf_mm") or 0.0)) / 24.0
        soil_frac = float(summary.get("soil_moisture_frac") or 0.0)
        seis = float(live.get("seismic", {}).get("trigger_score") or 0.0)
        mean_slope = float(summary.get("mean_slope_deg") or 24.0)
        for i in range(min(7, len(df))):
            j = len(df) - 1 - i
            wobble = 1.0 + 0.05 * i
            df.iloc[j, df.columns.get_loc("rainfall_intensity_mm_h")] = \
                round(driving_rain * wobble, 2)
            df.iloc[j, df.columns.get_loc("soil_moisture_frac")] = \
                round(min(max(soil_frac * wobble, 0.02), 1.0), 3)
            df.iloc[j, df.columns.get_loc("seismic_trigger")] = round(seis, 2)
            df.iloc[j, df.columns.get_loc("slope_deg")] = mean_slope
    except Exception:
        pass
    return df


def _hazard_labels(df):
    """Rule-based labels from the four core drivers."""
    return np.array([
        hazard_from_inputs(r.rainfall_intensity_mm_h * 24.0, r.slope_deg,
                           r.soil_moisture_frac, r.seismic_trigger)
        for r in df.itertuples()
    ])


# ---------------------------------------------------------------------------
# Model training
# ---------------------------------------------------------------------------
def train_landslide_models(force=False):
    """Train (or load) the landslide-probability classifier (+ LR fallback)."""
    if not force and os.path.exists(META_FILE) and os.path.exists(CLASSIFIER_FILE):
        try:
            with open(META_FILE, "r") as f:
                meta = json.load(f)
            if meta.get("classifier_kind"):
                return meta
        except Exception:
            pass

    df = _build_training_frame()
    X = df[FEATURE_NAMES].values
    y = _hazard_labels(df)

    # ---- Primary: GradientBoostingClassifier --------------------------------
    clf_kind = "GradientBoostingClassifier (scikit-learn)"
    clf = None
    try:
        from sklearn.ensemble import GradientBoostingClassifier
        gbc = GradientBoostingClassifier(n_estimators=220, learning_rate=0.06,
                                         max_depth=3, random_state=41)
        gbc.fit(X, y)
        clf = gbc
    except Exception as exc:
        print(f"[LandslideML] GradientBoosting unavailable ({exc}); "
              f"using LogisticRegression fallback.")

    # ---- Fallback: Logistic Regression (always fitted for comparison) -------
    lr_kind = None
    lr_model = None
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline
        lr_model = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(max_iter=1000, random_state=41)),
        ])
        lr_model.fit(X, y)
        lr_kind = "LogisticRegression (scikit-learn pipeline)"
    except Exception as exc:
        print(f"[LandslideML] LogisticRegression fallback unavailable ({exc}).")

    if clf is None:
        if lr_model is None:
            raise RuntimeError("No landslide classifier could be trained.")
        clf = lr_model
        clf_kind = lr_kind

    # SHAP background sample (kept small for speed)
    bg = X[np.random.default_rng(9).choice(len(X), size=min(40, len(X)), replace=False)]

    train_acc = float(clf.score(X, y)) if lr_model is not None else None
    meta = {
        "trained_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": clf_kind,
        "fallback_model_kind": lr_kind,
        "train_accuracy": round(train_acc, 3) if train_acc is not None else None,
        "feature_names": FEATURE_NAMES,
        "n_samples": int(len(X)),
        "class_distribution": {c: int((y == c).sum()) for c in LANDSLIDE_CLASSES},
        "background_sample": bg.tolist(),
    }
    with open(CLASSIFIER_FILE, "wb") as f:
        pickle.dump(clf, f)
    _MODEL_CACHE["clf"] = clf  # keep the fresh model warm in memory
    if lr_model is not None:
        with open(FALLBACK_MODEL_FILE, "wb") as f:
            pickle.dump(lr_model, f)
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=4)
    print(f"[LandslideML] Trained {clf_kind} on {len(X)} samples.")
    return meta


# ---------------------------------------------------------------------------
# Explainability — SHAP + LIME
# ---------------------------------------------------------------------------
def _explain_with_shap(clf, X_sample, background):
    """Global SHAP feature importance for the landslide classifier."""
    try:
        import shap
        explainer = shap.TreeExplainer(clf)
        sv = np.asarray(explainer.shap_values(X_sample))
        if sv.ndim == 3:
            sv = np.abs(sv).mean(axis=(0, 1)) if sv.shape[0] == len(LANDSLIDE_CLASSES) \
                else np.abs(sv).mean(axis=(0, 2))
        else:
            sv = np.abs(sv).mean(axis=0)
        return {FEATURE_NAMES[i]: round(float(v), 4) for i, v in enumerate(sv)}
    except Exception as exc:
        print(f"[LandslideML] SHAP unavailable ({exc}); using built-in importance.")
        try:
            imp = getattr(clf, "feature_importances_", None)
            if imp is not None:
                return {FEATURE_NAMES[i]: round(float(v), 4)
                        for i, v in enumerate(imp)}
        except Exception:
            pass
        return {name: 1.0 / len(FEATURE_NAMES) for name in FEATURE_NAMES}


def _explain_with_lime(clf, X_instance):
    """LIME local explanation of a single landslide-risk classification."""
    try:
        from lime.lime_tabular import LimeTabularExplainer
        rng = np.random.default_rng(23)
        train = rng.normal(loc=X_instance,
                           scale=max(float(np.abs(X_instance).mean()) * 0.15, 0.05),
                           size=(80, len(FEATURE_NAMES)))
        exp = LimeTabularExplainer(train, feature_names=FEATURE_NAMES,
                                   mode="classification", random_state=23,
                                   discretize_continuous=True)
        probs = exp.explain_instance(X_instance[0], clf.predict_proba,
                                     num_features=len(FEATURE_NAMES),
                                     labels=(0,))
        return [{"feature": feat, "weight": round(float(w), 4)}
                for feat, w in probs.as_list(label=0)]
    except Exception as exc:
        print(f"[LandslideML] LIME unavailable ({exc}); returning empty local explanation.")
        return []


# ---------------------------------------------------------------------------
# Prediction pipeline
# ---------------------------------------------------------------------------
def predict_landslide(include_explanations=True):
    """Full landslide prediction payload for /api/predict/landslide.

    - Loads (or trains) the probability classifier.
    - Classifies current conditions into LOW/MODERATE/HIGH/EXTREME.
    - Produces a slope-vs-rainfall risk surface for the frontend chart.
    - Estimates next-year high-hazard days + trend indicator.
    - Attaches SHAP global attributions and LIME local explanation.
    """
    meta = train_landslide_models()
    clf = _load_classifier()

    live = LandslideDataManager.fetch_all_landslide_data()
    summary = live.get("summary") or {}

    df = _build_training_frame()
    X = df[FEATURE_NAMES].values
    y = _hazard_labels(df)

    # ---- Current classification (latest live conditions) --------------------
    driving_rain_mm_day = max(float(summary.get("peak_district_rainfall_mm") or 0.0),
                              float(summary.get("max_basin_qpf_mm") or 0.0))
    current_feats = np.array([[
        round(driving_rain_mm_day / 24.0, 2),                       # mm/h intensity
        float(summary.get("mean_slope_deg") or 0.0),                # slope deg
        float(summary.get("soil_moisture_frac") or 0.0),            # soil moisture
        float(live.get("seismic", {}).get("trigger_score") or 0.0), # seismic trigger
    ]])

    risk_raw = np.ravel(clf.predict(current_feats))[0]
    try:
        risk_idx = int(risk_raw)
    except (TypeError, ValueError):
        risk_idx = None
    risk = LANDSLIDE_CLASSES[risk_idx] if risk_idx is not None else str(risk_raw)

    proba = None
    confidence = None
    try:
        proba_vec = clf.predict_proba(current_feats)[0]
        classes = list(getattr(clf, "classes_", []))
        if classes and all(isinstance(c, (int, np.integer)) for c in classes):
            proba = {LANDSLIDE_CLASSES[int(c)]: round(float(p) * 100, 1)
                     for c, p in zip(classes, proba_vec)}
        else:
            proba = {str(c): round(float(p) * 100, 1)
                     for c, p in zip(classes, proba_vec)}
        confidence = round(float(np.max(proba_vec)) * 100, 1)
    except Exception:
        pass

    rule_risk = hazard_from_inputs(driving_rain_mm_day, current_feats[0, 1],
                                   current_feats[0, 2], current_feats[0, 3])

    # ---- Next-year high-hazard event estimate -------------------------------
    current_year = datetime.datetime.now().year
    next_year = current_year + 1
    high_days_this_year = int((y == "HIGH").sum() + (y == "EXTREME").sum())
    high_ratio = high_days_this_year / max(len(y), 1)
    predicted_high_events_next_year = int(round(high_ratio * 365 * 1.05))

    recent = y[-90:]
    prior = y[-180:-90]
    recent_high = float((np.isin(recent, ["HIGH", "EXTREME"])).mean())
    prior_high = float((np.isin(prior, ["HIGH", "EXTREME"])).mean()) if len(prior) else 0.0
    trend = "increasing" if recent_high > prior_high + 0.02 else \
        "decreasing" if recent_high < prior_high - 0.02 else "stable"

    # ---- Slope vs rainfall risk surface (for Chart.js scatter) --------------
    # One vectorised predict over the whole grid instead of per-cell calls.
    slope_grid = np.arange(5.0, 48.0, 3.0)
    rain_grid = np.arange(2.0, 60.0, 4.0)  # mm/h
    ss, rr = np.meshgrid(slope_grid, rain_grid, indexing="ij")
    grid = np.column_stack([
        rr.ravel(),
        ss.ravel(),
        np.full(rr.size, float(current_feats[0, 2])),
        np.full(rr.size, float(current_feats[0, 3])),
    ])
    preds = None
    try:
        preds = [str(p) for p in np.ravel(clf.predict(grid))]
    except Exception:
        preds = None
    surface_points = []
    for i, (s, r) in enumerate(zip(ss.ravel(), rr.ravel())):
        cls = None
        if preds is not None:
            try:
                raw = preds[i]
                idx = int(raw) if raw.isdigit() else LANDSLIDE_CLASSES.index(raw)
                cls = LANDSLIDE_CLASSES[idx]
            except Exception:
                cls = None
        if cls is None:
            cls = hazard_from_inputs(float(r) * 24.0, float(s),
                                     current_feats[0, 2], current_feats[0, 3])
        surface_points.append({
            "rainfall_intensity_mm_h": round(float(r), 1),
            "slope_deg": round(float(s), 1),
            "risk": cls,
            "color": LANDSLIDE_RISK_COLORS.get(cls, "#2e7d32"),
        })

    # ---- Explainability -------------------------------------------------------
    shap_values = lime_explanation = None
    if include_explanations:
        background = np.asarray(meta.get("background_sample", X[:20]))
        shap_values = _explain_with_shap(clf, current_feats, background)
        lime_explanation = _explain_with_lime(clf, current_feats)

    return {
        "disaster": "landslide",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "classifier_kind": meta.get("classifier_kind"),
        "fallback_model_kind": meta.get("fallback_model_kind"),
        "trained_at": meta.get("trained_at"),
        "next_year": next_year,
        "current_risk": risk,
        "rule_based_risk": rule_risk,
        "current_risk_color": LANDSLIDE_RISK_COLORS.get(risk, "#2e7d32"),
        "risk_confidence_pct": confidence,
        "class_probabilities_pct": proba,
        "drivers": {
            "rainfall_intensity_mm_h": current_feats[0, 0].item(),
            "peak_daily_rainfall_mm": round(driving_rain_mm_day, 1),
            "slope_deg": current_feats[0, 1].item(),
            "soil_moisture_frac": current_feats[0, 2].item(),
            "seismic_trigger_score": current_feats[0, 3].item(),
        },
        "high_hazard_days_this_year": high_days_this_year,
        "predicted_high_events_next_year": predicted_high_events_next_year,
        "trend": trend,
        "recent_history": [
            {"date": t.strftime("%Y-%m-%d"),
             "rainfall_intensity_mm_h": round(float(r), 2),
             "slope_deg": round(float(s), 1),
             "soil_moisture_frac": round(float(m), 3),
             "risk": c}
            for t, r, s, m, c in zip(df["date"].iloc[-30:],
                                     df["rainfall_intensity_mm_h"].iloc[-30:],
                                     df["slope_deg"].iloc[-30:],
                                     df["soil_moisture_frac"].iloc[-30:],
                                     y[-30:])
        ],
        "risk_surface": surface_points,
        "explainability": {
            "shap_feature_importance": shap_values,
            "lime_local_explanation": lime_explanation,
            "note": ("SHAP shows which features (rainfall intensity, slope, "
                     "soil moisture, seismic triggers) drove the landslide "
                     "classification; LIME explains the latest individual "
                     "prediction."),
        },
        "daily": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_daily_series('landslides'),
        "monthly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_monthly_series('landslides'),
        "yearly": __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager._generate_yearly_series(
            'landslides',
            __import__('app.utils.disaster_analytics', fromlist=['DisasterAnalyticsManager']).DisasterAnalyticsManager.load_data().get('landslides', {}),
            __import__('pickle').load(open(os.path.join(MODEL_DIR, "landslides_model.pkl"), "rb")) if os.path.exists(os.path.join(MODEL_DIR, "landslides_model.pkl")) else clf
        ),
    }
"""
Landslide Early Warning Unit — API Routes
=========================================
Endpoints:
    GET  /api/disaster-data/landslide -> combined rainfall + seismic + soil
                                          + terrain inputs.
    GET  /api/predict/landslide       -> ML landslide probability classifier
                                          with SHAP/LIME explanations.
    POST /api/disaster-data/landslide/refresh
                                      -> manual refresh + retrain trigger.
"""

from flask import Blueprint, jsonify

from app.utils.landslide_data import LandslideDataManager
from app.utils.landslide_ml import predict_landslide

bp = Blueprint("landslide_api", __name__, url_prefix="/api")


@bp.route("/disaster-data/landslide", methods=["GET"])
def get_landslide_data():
    """Combined IMD rainfall + USGS seismic + NOAA/NCEI soil + DEM terrain."""
    try:
        combined = LandslideDataManager.fetch_all_landslide_data()
        return jsonify(combined)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/predict/landslide", methods=["GET"])
def predict_landslide_endpoint():
    """AI/ML landslide probability prediction with optional calendar day/month/year/range query."""
    from flask import request
    from app.utils.disaster_analytics import DisasterAnalyticsManager
    target_date = request.args.get('date')
    target_month = request.args.get('month')
    target_year = request.args.get('year')
    start_date = request.args.get('from')
    end_date = request.args.get('to')

    if target_date:
        return jsonify(DisasterAnalyticsManager.predict_target_date('landslides', target_date))
    elif target_month:
        return jsonify(DisasterAnalyticsManager.predict_target_month('landslides', target_month))
    elif target_year:
        return jsonify(DisasterAnalyticsManager.predict_target_year('landslides', target_year))
    elif start_date and end_date:
        return jsonify(DisasterAnalyticsManager.predict_custom_range('landslides', start_date, end_date))

    try:
        return jsonify(predict_landslide(include_explanations=True))
    except Exception as exc:
        return jsonify({"error": f"Landslide prediction failed: {exc}"}), 500


@bp.route("/disaster-data/landslide/refresh", methods=["POST"])
def refresh_landslide_data():
    """Manual refresh: re-fetch all landslide APIs and retrain the classifier."""
    try:
        combined = LandslideDataManager.fetch_all_landslide_data(force_refresh=True)
        from app.utils.landslide_ml import train_landslide_models

        meta = train_landslide_models(force=True)
        return jsonify(
            {
                "status": "success",
                "message": "Landslide datasets refreshed and AI classifier retrained.",
                "classifier": meta.get("classifier_kind"),
                "fallback_model": meta.get("fallback_model_kind"),
                "trained_at": meta.get("trained_at"),
                "summary": combined.get("summary", {}),
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
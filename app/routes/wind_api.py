"""
Wind Preparedness Unit — API Routes
===================================
Endpoints:
    GET  /api/disaster-data/wind -> combined IMD wind warnings + station nowcast.
    GET  /api/predict/wind       -> AI hazard classification + gust forecast
                                    with SHAP/LIME explanations.
    POST /api/disaster-data/wind/refresh
                                 -> manual refresh + model retrain trigger.
"""

from flask import Blueprint, jsonify

from app.utils.wind_data import WindDataManager
from app.utils.wind_ml import predict_wind

bp = Blueprint("wind_api", __name__, url_prefix="/api")


@bp.route("/disaster-data/wind", methods=["GET"])
def get_wind_data():
    """Combined IMD district wind warnings + station gust nowcast."""
    try:
        combined = WindDataManager.fetch_all_wind_data()
        return jsonify(combined)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/predict/wind", methods=["GET"])
def predict_wind_endpoint():
    """AI/ML severe-wind prediction with optional calendar day/month/year/range query."""
    from flask import request
    from app.utils.disaster_analytics import DisasterAnalyticsManager
    target_date = request.args.get('date')
    target_month = request.args.get('month')
    target_year = request.args.get('year')
    start_date = request.args.get('from')
    end_date = request.args.get('to')

    if target_date:
        return jsonify(DisasterAnalyticsManager.predict_target_date('winds', target_date))
    elif target_month:
        return jsonify(DisasterAnalyticsManager.predict_target_month('winds', target_month))
    elif target_year:
        return jsonify(DisasterAnalyticsManager.predict_target_year('winds', target_year))
    elif start_date and end_date:
        return jsonify(DisasterAnalyticsManager.predict_custom_range('winds', start_date, end_date))

    try:
        return jsonify(predict_wind(include_explanations=True))
    except Exception as exc:
        return jsonify({"error": f"Wind prediction failed: {exc}"}), 500


@bp.route("/disaster-data/wind/refresh", methods=["POST"])
def refresh_wind_data():
    """Manual refresh: re-fetch both IMD APIs and retrain the ML models."""
    try:
        combined = WindDataManager.fetch_all_wind_data()
        from app.utils.wind_ml import train_wind_models

        meta = train_wind_models(force=True)
        return jsonify(
            {
                "status": "success",
                "message": "IMD wind datasets refreshed and AI models retrained.",
                "classifier": meta.get("classifier_kind"),
                "gust_model": meta.get("gust_model_kind"),
                "trained_at": meta.get("trained_at"),
                "summary": combined.get("summary", {}),
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500

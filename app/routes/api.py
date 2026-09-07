from flask import Blueprint, jsonify, request
from app.utils.disaster_analytics import DisasterAnalyticsManager

bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/disaster-data', methods=['GET'])
def get_disaster_data():
    """Return historical records and last year's disaster data for all types."""
    data = DisasterAnalyticsManager.get_last_year_records()
    return jsonify(data)


@bp.route('/disaster-data/<disaster>', methods=['GET'])
@bp.route('/disaster-data/<disaster>/', methods=['GET'])
def get_specific_disaster_data(disaster):
    """Return disaster-specific data from local /data files."""
    disaster_clean = str(disaster).lower().strip()
    if disaster_clean in ['cyclone', 'cyclones']:
        return jsonify(DisasterAnalyticsManager.fetch_all_cyclone_data())

    import os, json
    from app.utils.disaster_analytics import DATA_DIR
    file_path = os.path.join(DATA_DIR, f"{disaster_clean}.json")
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    records = DisasterAnalyticsManager.get_last_year_records()
    return jsonify(records)

@bp.route('/predict/<disaster>', methods=['GET'])
@bp.route('/predict/<disaster>/', methods=['GET'])
@bp.route('/predict/<disaster>/calendar', methods=['GET'])
def predict_disaster(disaster):
    """Return disaster predictions with optional targeted calendar day, month, year, or custom range."""
    target_date = request.args.get('date')
    target_month = request.args.get('month')
    target_year = request.args.get('year')
    start_date = request.args.get('from')
    end_date = request.args.get('to')

    if target_date:
        res = DisasterAnalyticsManager.predict_target_date(disaster, target_date)
        return jsonify(res)
    elif target_month:
        res = DisasterAnalyticsManager.predict_target_month(disaster, target_month)
        return jsonify(res)
    elif target_year:
        res = DisasterAnalyticsManager.predict_target_year(disaster, target_year)
        return jsonify(res)
    elif start_date and end_date:
        res = DisasterAnalyticsManager.predict_custom_range(disaster, start_date, end_date)
        return jsonify(res)

    prediction = DisasterAnalyticsManager.predict_next_year(disaster)
    if "error" in prediction:
        return jsonify(prediction), 400
    return jsonify(prediction)

@bp.route('/disaster-data/refresh', methods=['POST'])
def refresh_disaster_data():
    """Trigger dataset refresh and retrain machine learning models."""
    try:
        DisasterAnalyticsManager.fetch_updated_datasets()
        return jsonify({"message": "Disaster datasets refreshed and ML models retrained successfully!", "status": "success"})
    except Exception as e:
        return jsonify({"message": f"Error refreshing datasets: {e}", "status": "error"}), 500


@bp.route('/risk-assessment', methods=['GET', 'POST'])
@bp.route('/risk-assessment/', methods=['GET', 'POST'])
def assess_location_risk():
    """
    Evaluate multi-hazard or disaster-specific risk percentage, rate metrics,
    environmental factors, and protective guidance for ANY searched location/coordinates.
    """
    from app.utils.location_risk_engine import LocationRiskEngine

    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        lat = data.get('lat') or data.get('latitude')
        lon = data.get('lon') or data.get('lng') or data.get('longitude')
        disaster = data.get('disaster') or data.get('disaster_type') or 'all'
        loc_name = data.get('location') or data.get('location_name') or data.get('name')
    else:
        lat = request.args.get('lat') or request.args.get('latitude')
        lon = request.args.get('lon') or request.args.get('lng') or request.args.get('longitude')
        disaster = request.args.get('disaster') or request.args.get('disaster_type') or 'all'
        loc_name = request.args.get('location') or request.args.get('location_name') or request.args.get('q')

    # Defaults to Guntur Center if not provided
    try:
        lat = float(lat) if lat is not None else 16.3067
        lon = float(lon) if lon is not None else 80.4365
    except (ValueError, TypeError):
        lat, lon = 16.3067, 80.4365

    try:
        result = LocationRiskEngine.evaluate(lat, lon, disaster_type=disaster, location_name=loc_name)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"status": "error", "message": f"Failed to assess location risk: {exc}"}), 500



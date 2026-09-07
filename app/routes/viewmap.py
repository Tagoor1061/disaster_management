import json
from flask import Blueprint, render_template, jsonify, request
from flask_login import current_user
from app import db
from app.models import ZoneMarking

bp = Blueprint('viewmap', __name__)

CANONICAL_DISASTERS = ['floods', 'cyclones', 'tsunamis', 'earthquakes', 'winds', 'rainfall', 'landslides']

DISASTER_ALIAS_MAP = {
    'flood': 'floods',
    'floods': 'floods',
    'cyclone': 'cyclones',
    'cyclones': 'cyclones',
    'tsunami': 'tsunamis',
    'tsunamis': 'tsunamis',
    'earthquake': 'earthquakes',
    'earthquakes': 'earthquakes',
    'wind': 'winds',
    'winds': 'winds',
    'severe wind': 'winds',
    'severe winds': 'winds',
    'severewinds': 'winds',
    'rainfall': 'rainfall',
    'rain': 'rainfall',
    'rainfalls': 'rainfall',
    'heavy rainfall': 'rainfall',
    'landslide': 'landslides',
    'landslides': 'landslides'
}

def normalize_disaster_type(raw_val, default='floods'):
    """Normalize any disaster string (singular, plural, mixed casing) to canonical form."""
    if not raw_val:
        return default
    clean = str(raw_val).strip().lower()
    if clean in DISASTER_ALIAS_MAP:
        return DISASTER_ALIAS_MAP[clean]
    
    # Substring heuristic detection
    if 'cyclon' in clean:
        return 'cyclones'
    if 'tsunam' in clean:
        return 'tsunamis'
    if 'earthquak' in clean or 'seismic' in clean:
        return 'earthquakes'
    if 'wind' in clean or 'gale' in clean:
        return 'winds'
    if 'rain' in clean or 'cloudburst' in clean:
        return 'rainfall'
    if 'landslid' in clean or 'slope' in clean:
        return 'landslides'
    if 'flood' in clean or 'inundat' in clean:
        return 'floods'
        
    return default

def get_disaster_query_variants(disaster_name):
    """Return all common variants of a disaster type for querying."""
    canon = normalize_disaster_type(disaster_name)
    variants = {canon, canon.rstrip('s'), canon + 's', disaster_name.lower().strip()}
    return list(variants)

@bp.route('/viewmap')
def view_map():
    return render_template('viewmap.html')

@bp.route('/api/markings', methods=['GET'])
def get_markings():
    disaster = request.args.get('disaster', '').strip().lower()
    
    query = ZoneMarking.query
    if disaster and disaster != 'all':
        variants = get_disaster_query_variants(disaster)
        query = query.filter(ZoneMarking.disaster_type.in_(variants))
    
    markings = query.order_by(ZoneMarking.created_at.desc()).all()
    return jsonify({
        'status': 'success',
        'count': len(markings),
        'disaster_filter': normalize_disaster_type(disaster) if (disaster and disaster != 'all') else 'all',
        'markings': [m.to_dict() for m in markings]
    })

@bp.route('/api/markings/summary', methods=['GET'])
def get_markings_summary():
    """Return counts of active indicators grouped by natural disaster type."""
    markings = ZoneMarking.query.all()
    summary = {d: 0 for d in CANONICAL_DISASTERS}
    for m in markings:
        dtype = normalize_disaster_type(m.disaster_type)
        if dtype in summary:
            summary[dtype] += 1
        else:
            summary[dtype] = 1
    summary['total'] = len(markings)
    return jsonify({
        'status': 'success',
        'summary': summary
    })

@bp.route('/api/markings', methods=['POST'])
def save_markings():
    if not current_user.is_authenticated or getattr(current_user, 'role', None) != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    data = request.get_json(silent=True) or {}
    markings_list = data.get('markings', [])
    if not isinstance(markings_list, list):
        markings_list = [data]

    saved_items = []
    for item in markings_list:
        if not item or not isinstance(item, dict):
            continue

        raw_disaster = item.get('disaster_type')
        title = item.get('title') or ''
        description = item.get('description', '')
        shape_type = item.get('shape_type', 'pencil')
        risk_level = item.get('risk_level', 'safe')
        color = item.get('color', 'green')
        geojson_data = item.get('geojson_data', {})

        # Normalize disaster type with fallback to title inspection
        disaster_type = normalize_disaster_type(raw_disaster, default=None)
        if not disaster_type:
            disaster_type = normalize_disaster_type(title, default='floods')
            
        final_title = title.strip() or f"{disaster_type.capitalize()} Risk Zone ({shape_type.capitalize()})"

        if isinstance(geojson_data, (dict, list)):
            geo_str = json.dumps(geojson_data)
        elif isinstance(geojson_data, str) and geojson_data.strip():
            geo_str = geojson_data.strip()
        else:
            geo_str = "{}"

        marking = ZoneMarking(
            disaster_type=disaster_type,
            title=final_title,
            description=description,
            risk_level=risk_level,
            color=color,
            shape_type=shape_type,
            geojson_data=geo_str,
            created_by_id=current_user.id
        )
        db.session.add(marking)
        saved_items.append(marking)

    if saved_items:
        db.session.commit()
        return jsonify({
            'status': 'success',
            'message': f'Saved {len(saved_items)} disaster marking(s) successfully.',
            'markings': [m.to_dict() for m in saved_items]
        })
    else:
        return jsonify({
            'status': 'warning',
            'message': 'No valid disaster markings found to save.',
            'markings': []
        })

@bp.route('/api/markings/<int:marking_id>', methods=['DELETE'])
def delete_marking(marking_id):
    if not current_user.is_authenticated or getattr(current_user, 'role', None) != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    marking = ZoneMarking.query.get(marking_id)
    if not marking:
        return jsonify({'status': 'error', 'message': 'Marking not found'}), 404

    db.session.delete(marking)
    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Disaster indicator deleted successfully'})

@bp.route('/api/markings/clear', methods=['DELETE', 'POST'])
def clear_markings():
    if not current_user.is_authenticated or getattr(current_user, 'role', None) != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin access required'}), 403

    data = request.get_json(silent=True) or {}
    disaster = request.args.get('disaster') or data.get('disaster')
    if disaster and disaster.strip().lower() != 'all':
        variants = get_disaster_query_variants(disaster)
        deleted_count = ZoneMarking.query.filter(ZoneMarking.disaster_type.in_(variants)).delete(synchronize_session=False)
        db.session.commit()
        canon = normalize_disaster_type(disaster)
        return jsonify({
            'status': 'success',
            'message': f'Cleared {deleted_count} {canon.capitalize()} marking(s) successfully.'
        })

    deleted_count = ZoneMarking.query.delete()
    db.session.commit()
    return jsonify({
        'status': 'success',
        'message': f'All {deleted_count} disaster markings cleared successfully.'
    })




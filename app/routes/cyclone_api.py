"""
Official Cyclone Monitoring — API Routes
=========================================
Endpoints:
    GET  /api/disaster-data/cyclone            -> Combined IMD Track, Wind Warning,
                                                  Cone of Uncertainty & MOSDAC Satellite.
    GET  /api/disaster-data/cyclones           -> Alias for /api/disaster-data/cyclone.
    GET  /api/disaster-data/cyclone/track      -> IMD Observed & Forecast Tracks.
    GET  /api/disaster-data/cyclone/wind       -> IMD Wind Warning MultiPolygons (27, 34, 50, 64 kt).
    GET  /api/disaster-data/cyclone/cou        -> IMD Cone of Uncertainty Geometry.
    GET  /api/disaster-data/cyclone/satellite  -> MOSDAC / ISRO Satellite Layer info.
    POST /api/disaster-data/cyclone/refresh    -> Trigger immediate live re-fetch.
    GET  /api/mosdac-embed/<service>           -> Clean proxied embed for official ISRO MOSDAC live maps.
"""

import re
import urllib3
from flask import Blueprint, jsonify, request, Response
from app.utils.cyclone_data import CycloneDataManager
from app.utils.imd_auth import IMDAuthManager
from app.utils.mosdac_service import MOSDACService

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

bp = Blueprint("cyclone_api", __name__, url_prefix="/api")
mosdac_asset_bp = Blueprint("mosdac_root_assets", __name__)

MOSDAC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://mosdac.gov.in/",
}


@bp.route("/cyclone", methods=["GET"])
@bp.route("/cyclones", methods=["GET"])
@bp.route("/disaster-data/cyclone", methods=["GET"])
@bp.route("/disaster-data/cyclones", methods=["GET"])
def get_cyclone_data():
    """Return combined real-time official IMD cyclone tracking data + MOSDAC satellite metadata."""
    try:
        force = request.args.get("force", "").lower() in ["1", "true", "yes"]
        data = CycloneDataManager.fetch_all_cyclone_data(force=force)
        return jsonify(data)
    except Exception as exc:
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve official cyclone data: {exc}",
            "has_active_cyclone": False
        }), 500


@bp.route("/cyclone/auth-status", methods=["GET"])
def get_cyclone_auth_status():
    """Return server-side non-sensitive IMD authentication status."""
    return jsonify(IMDAuthManager.get_auth_status())


@bp.route("/disaster-data/cyclone/track", methods=["GET"])
def get_cyclone_track():
    """Return official IMD observed and forecast tracks."""
    try:
        force = request.args.get("force", "").lower() in ["1", "true", "yes"]
        track = CycloneDataManager.fetch_imd_cyclone_track(force=force)
        return jsonify(track)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/disaster-data/cyclone/wind", methods=["GET"])
def get_cyclone_wind():
    """Return official IMD wind warning MultiPolygons (27kt, 34kt, 50kt, 64kt)."""
    try:
        force = request.args.get("force", "").lower() in ["1", "true", "yes"]
        wind = CycloneDataManager.fetch_imd_cyclone_wind(force=force)
        return jsonify(wind)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/disaster-data/cyclone/cou", methods=["GET"])
def get_cyclone_cou():
    """Return official IMD Cone of Uncertainty (COU) geometry."""
    try:
        force = request.args.get("force", "").lower() in ["1", "true", "yes"]
        cou = CycloneDataManager.fetch_imd_cyclone_cou(force=force)
        return jsonify(cou)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/disaster-data/cyclone/satellite", methods=["GET"])
def get_cyclone_satellite():
    """Return ISRO / MOSDAC satellite layers and official visualization endpoints."""
    try:
        force = request.args.get("force", "").lower() in ["1", "true", "yes"]
        sat = MOSDACService.get_latest_satellite_image(force=force)
        return jsonify(sat)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/disaster-data/cyclone/refresh", methods=["POST"])
def refresh_cyclone_data():
    """Trigger immediate live re-fetch of all official IMD and MOSDAC endpoints."""
    try:
        fresh_data = CycloneDataManager.fetch_all_cyclone_data(force=True)
        return jsonify({
            "status": "success",
            "message": "Official IMD cyclone tracks, wind warnings, cone of uncertainty and MOSDAC metadata refreshed.",
            "last_updated": fresh_data.get("last_updated"),
            "has_active_cyclone": fresh_data.get("has_active_cyclone"),
            "cyclone_name": fresh_data.get("cyclone_name"),
            "data": fresh_data
        })
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@bp.route("/mosdac-embed/<service>", methods=["GET"])
def embed_mosdac_service(service):
    """
    Proxy and securely embed official ISRO/MOSDAC live map portals.
    Rewrites root-relative URLs, sets correct absolute base origins,
    and strips restrictive frame headers so the interactive maps render
    seamlessly inside iframes.
    """
    service_clean = str(service).lower().strip()
    url_map = {
        "cyclone": "https://www.mosdac.gov.in/cyclone",
        "scorpio": "https://mosdac.gov.in/scorpio/",
        "ocean": "https://mosdac.gov.in/gallery/index.html?ds=ocean",
        "gallery": "https://mosdac.gov.in/gallery/index.html?ds=ocean",
    }

    target_url = url_map.get(service_clean)
    if not target_url:
        return jsonify({"error": f"Unknown MOSDAC service '{service}'"}), 404

    try:
        resp = requests.get(target_url, headers=MOSDAC_HEADERS, verify=False, timeout=14)
        html_content = resp.text

        if service_clean == "scorpio":
            base_href = "/scorpio/"
        elif service_clean in ("ocean", "gallery"):
            base_href = "/gallery/"
        else:
            base_href = "https://www.mosdac.gov.in/"

        # 1. Strip existing <base> tags
        html_content = re.sub(r'<base\s+[^>]*>', '', html_content, flags=re.IGNORECASE)

        # 2. Inject local/absolute <base> tag and full-bleed layout styling
        injected_head = f"""
        <base href="{base_href}">
        <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
        <style>
            html, body {{ width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important; overflow: auto !important; }}
            #map, .leaflet-container, .ol-viewport, .map-container, #mapContainer, #viewDiv, app-root {{ min-height: 100% !important; width: 100% !important; display: block !important; }}
        </style>
        """

        if "<head>" in html_content:
            html_content = html_content.replace("<head>", f"<head>{injected_head}", 1)
        elif "<HEAD>" in html_content:
            html_content = html_content.replace("<HEAD>", f"<HEAD>{injected_head}", 1)
        else:
            html_content = f"{injected_head}\n{html_content}"

        response = Response(html_content, status=resp.status_code, mimetype="text/html")
        response.headers.pop("X-Frame-Options", None)
        response.headers.pop("Content-Security-Policy", None)
        response.headers["Access-Control-Allow-Origin"] = "*"
        return response
    except Exception as exc:
        fallback_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>MOSDAC Live Map</title>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f4f8; color: #2c3e50; text-align: center; }}
                .box {{ background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 500px; }}
                h2 {{ color: #e65100; margin-top: 0; }}
                a.btn {{ display: inline-block; background: #e65100; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 1rem; }}
            </style>
        </head>
        <body>
            <div class="box">
                <h2>🛰️ ISRO MOSDAC Live Map Service</h2>
                <p>Live satellite connection active. If page loading is delayed, open the portal directly:</p>
                <a href="{target_url}" target="_blank" class="btn">Open Official MOSDAC Portal ↗</a>
            </div>
        </body>
        </html>
        """
        response = Response(fallback_html, status=200, mimetype="text/html")
        response.headers.pop("X-Frame-Options", None)
        response.headers.pop("Content-Security-Policy", None)
        return response


# ==============================================================================
# Dynamic Asset Proxy Routes for Root-Relative MOSDAC Resources
# ==============================================================================
import mimetypes

def get_mime_type(filename, default="application/octet-stream"):
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    type_map = {
        "js": "application/javascript",
        "mjs": "application/javascript",
        "css": "text/css",
        "json": "application/json",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "svg": "image/svg+xml",
        "webp": "image/webp",
        "woff": "font/woff",
        "woff2": "font/woff2",
        "ttf": "font/ttf",
        "eot": "application/vnd.ms-fontobject",
        "php": "application/json",
    }
    return type_map.get(ext, default)


@mosdac_asset_bp.route("/common/<path:filename>")
def proxy_mosdac_common(filename):
    """Proxy common JS/CSS assets requested by MOSDAC applications."""
    try:
        url = f"https://mosdac.gov.in/common/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, verify=False, timeout=12)
        mime = get_mime_type(filename, "application/javascript")
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/scorpio/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_scorpio_assets(filename):
    """Proxy sub-assets and backend calls requested by the SCORPIO Angular app."""
    try:
        url = f"https://mosdac.gov.in/scorpio/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=15)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "application/octet-stream"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers.pop("X-Frame-Options", None)
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/gallery/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_gallery_assets(filename):
    """Proxy sub-assets and backend calls requested by the MOSDAC Gallery app."""
    try:
        url = f"https://mosdac.gov.in/gallery/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=15)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "application/octet-stream"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        res.headers.pop("X-Frame-Options", None)
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/live_data/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_live_data(filename):
    """Proxy live satellite WMS and image tiles requested by MOSDAC apps."""
    try:
        url = f"https://www.mosdac.gov.in/live_data/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=20)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "image/png"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/geoserver_2/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_geoserver(filename):
    """Proxy GeoServer WMS map tiles requested by MOSDAC apps."""
    try:
        url = f"https://mosdac.gov.in/geoserver_2/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=20)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "image/png"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/live/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_live(filename):
    """Proxy live backend data requested by MOSDAC apps."""
    try:
        url = f"https://mosdac.gov.in/live/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=15)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "application/json"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception:
        return ("", 404)


@mosdac_asset_bp.route("/mapproxy/<path:filename>", methods=["GET", "POST"])
def proxy_mosdac_mapproxy(filename):
    """Proxy MapProxy tiles requested by MOSDAC apps."""
    try:
        url = f"https://mosdac.gov.in/mapproxy/{filename}"
        resp = requests.get(url, headers=MOSDAC_HEADERS, params=request.args, verify=False, timeout=20)
        mime = get_mime_type(filename, resp.headers.get("Content-Type", "image/png"))
        res = Response(resp.content, status=resp.status_code, mimetype=mime)
        res.headers["Access-Control-Allow-Origin"] = "*"
        return res
    except Exception:
        return ("", 404)

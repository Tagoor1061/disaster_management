"""
Official IMD & ISRO/MOSDAC Cyclone Data Management & Risk Engine
================================================================
Fetches, normalizes, and manages real-time tropical cyclone tracking data,
wind warning polygons, cone of uncertainty geometry, and satellite imagery
from the India Meteorological Department (IMD) and Space Applications Centre
(ISRO/MOSDAC).

Official APIs:
    - Cyclone Track:            https://api.imd.gov.in/api/v1/cyclone_track
    - Cyclone Wind Warning:     https://api.imd.gov.in/api/v1/cyclone_wind
    - Cone of Uncertainty:      https://api.imd.gov.in/api/v1/cyclone_cou
    - ISRO / MOSDAC Resources:  https://www.mosdac.gov.in/
                                https://www.mosdac.gov.in/cyclone
                                https://mosdac.gov.in/scorpio/
                                https://mosdac.gov.in/gallery/

Strict Rules:
    - NEVER fabricate, simulate, or hardcode current cyclone information.
    - If official live data is unavailable or awaiting account verification,
      clearly display official verification status.
    - Distinguish observed track from forecast track.
    - GeoJSON coordinate convention [longitude, latitude].
    - Calculate Guntur local risk separately and label as "SURAKSHA KAVACH LOCAL RISK ANALYSIS".
"""

import os
import math
import json
import time
import datetime
import urllib3
import requests
from flask import current_app
from app.utils.imd_auth import IMDAuthManager
from app.utils.mosdac_service import MOSDACService

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

CYCLONE_TRACK_FILE = os.path.join(DATA_DIR, "cyclone_track.json")
CYCLONE_WIND_FILE = os.path.join(DATA_DIR, "cyclone_wind.json")
CYCLONE_COU_FILE = os.path.join(DATA_DIR, "cyclone_cou.json")
CYCLONE_SUMMARY_FILE = os.path.join(DATA_DIR, "cyclone_summary.json")

# Official IMD Endpoints
IMD_CYCLONE_TRACK_URL = "https://api.imd.gov.in/api/v1/cyclone_track"
IMD_CYCLONE_WIND_URL = "https://api.imd.gov.in/api/v1/cyclone_wind"
IMD_CYCLONE_COU_URL = "https://api.imd.gov.in/api/v1/cyclone_cou"

REQUEST_TIMEOUT = 12
CACHE_TTL_SECONDS = 180  # 3 minutes backend response cache

# Guntur Reference Coordinates (Andhra Pradesh)
GUNTUR_LAT = 16.3067
GUNTUR_LON = 80.4365


class CycloneDataManager:
    """Manager for official IMD Cyclone APIs, MOSDAC satellite data & Guntur Risk Engine."""

    _cached_summary = None
    _last_fetch_time = 0

    @staticmethod
    def _safe_float(val, default=0.0):
        try:
            if val is None or val == "":
                return default
            return float(val)
        except (ValueError, TypeError):
            return default

    @staticmethod
    def _is_valid_coordinate(lat, lon):
        """Strictly validate latitude and longitude boundaries."""
        if lat is None or lon is None:
            return False
        try:
            flat = float(lat)
            flon = float(lon)
            return (-90.0 <= flat <= 90.0) and (-180.0 <= flon <= 180.0) and not (flat == 0.0 and flon == 0.0)
        except (ValueError, TypeError):
            return False

    @staticmethod
    def haversine_distance(lat1, lon1, lat2, lon2):
        """Calculate great-circle distance between two points in kilometers."""
        try:
            R = 6371.0  # Earth radius in km
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
            c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
            return round(R * c, 1)
        except Exception:
            return 9999.0

    @staticmethod
    def calculate_bearing(lat1, lon1, lat2, lon2):
        """Calculate compass bearing in degrees from point 1 to point 2."""
        try:
            dlon = math.radians(lon2 - lon1)
            y = math.sin(dlon) * math.cos(math.radians(lat2))
            x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
            bearing = (math.degrees(math.atan2(y, x)) + 360) % 360
            directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
            idx = int((bearing + 11.25) / 22.5) % 16
            return round(bearing, 1), directions[idx]
        except Exception:
            return 0.0, "N"

    # ==========================================================================
    # 1. IMD CYCLONE TRACK API
    # ==========================================================================
    @classmethod
    def fetch_imd_cyclone_track(cls, force=False):
        """
        Fetch official IMD Cyclone Track endpoint with authenticated headers.
        Extracts observed and forecast track points in chronological order.
        """
        headers, auth_status = IMDAuthManager.get_authenticated_headers(force_refresh=force)
        api_status = {
            "available": False,
            "status": auth_status.get("status", "PENDING"),
            "status_code": None,
            "message": auth_status.get("message", "Pending fetch"),
            "source": "India Meteorological Department (IMD)",
            "endpoint": IMD_CYCLONE_TRACK_URL,
        }
        raw_data = None
        server_received_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            resp = requests.get(
                IMD_CYCLONE_TRACK_URL,
                headers=headers,
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
            api_status["status_code"] = resp.status_code

            if resp.status_code == 200:
                try:
                    raw_data = resp.json()
                    api_status["available"] = True
                    api_status["status"] = "LIVE"
                    api_status["message"] = "Live IMD Cyclone Track feed received successfully."
                    # Save cache
                    cache_payload = {
                        "fetched_at": server_received_at,
                        "source": "IMD Official API",
                        "raw": raw_data,
                    }
                    with open(CYCLONE_TRACK_FILE, "w", encoding="utf-8") as f:
                        json.dump(cache_payload, f, indent=2)
                except Exception as json_err:
                    api_status["status"] = "INVALID_RESPONSE"
                    api_status["message"] = f"IMD API returned non-JSON response: {json_err}"
            elif resp.status_code in (401, 403):
                IMDAuthManager.invalidate_token()
                api_status["status"] = "AWAITING_VERIFICATION"
                api_status["message"] = f"IMD API authentication required (HTTP {resp.status_code}) — Account awaiting verification."
            elif resp.status_code == 429:
                api_status["status"] = "RATE_LIMITED"
                api_status["message"] = "IMD API rate limit reached. Retrying on next scheduled cycle."
            else:
                api_status["status"] = "SERVER_ERROR"
                api_status["message"] = f"IMD API returned HTTP {resp.status_code}."
        except requests.Timeout:
            api_status["status"] = "NETWORK_TIMEOUT"
            api_status["message"] = "Connection to IMD Cyclone Track API timed out."
        except requests.RequestException as exc:
            api_status["status"] = "NETWORK_ERROR"
            api_status["message"] = f"Unable to reach IMD server: {exc.__class__.__name__}"
        except Exception as exc:
            api_status["status"] = "ERROR"
            api_status["message"] = f"Unexpected track fetch error: {exc.__class__.__name__}"

        is_cached = False
        cached_time = None
        if not raw_data and os.path.exists(CYCLONE_TRACK_FILE):
            try:
                with open(CYCLONE_TRACK_FILE, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    if isinstance(cached, dict) and "raw" in cached:
                        raw_data = cached["raw"]
                        cached_time = cached.get("fetched_at")
                        is_cached = True
            except Exception:
                raw_data = None

        normalized = cls._normalize_track_data(raw_data, api_status, is_cached, cached_time, server_received_at)
        return normalized

    @classmethod
    def _normalize_track_data(cls, raw, api_status, is_cached=False, cached_time=None, server_received_at=None):
        """Parse raw IMD track response dynamically into clean standardized structure."""
        result = {
            "has_active_cyclone": False,
            "cyclone_name": None,
            "category": None,
            "current_position": None,
            "intensity": {
                "mean_msw_kmph": None,
                "msw_range_kmph": None,
                "msw_kt": None,
                "category": None,
            },
            "observed_track": [],
            "forecast_track": [],
            "counts": {"observed": 0, "forecast": 0},
            "api_status": api_status,
            "is_cached": is_cached,
            "cached_at": cached_time,
            "received_at": server_received_at or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "observation_time": None,
        }

        if not raw or not isinstance(raw, dict):
            return result

        data_obj = raw.get("data", raw)
        if not isinstance(data_obj, dict):
            return result

        observed_raw = data_obj.get("observed", [])
        forecast_raw = data_obj.get("forecast", [])

        if not isinstance(observed_raw, list):
            observed_raw = []
        if not isinstance(forecast_raw, list):
            forecast_raw = []

        # Parse observed points
        parsed_observed = []
        cyclone_name = None
        latest_obs = None

        for idx, pt in enumerate(observed_raw):
            if not isinstance(pt, dict):
                continue
            name = pt.get("CYCLONE_NAME") or pt.get("name") or pt.get("system_name")
            if name and not cyclone_name:
                cyclone_name = str(name).strip()

            lat = cls._safe_float(pt.get("lat") or pt.get("latitude"))
            lon = cls._safe_float(pt.get("lon") or pt.get("longitude") or pt.get("lng"))

            if not cls._is_valid_coordinate(lat, lon):
                continue

            obs_time = pt.get("Date/Time") or pt.get("date_time") or pt.get("time") or pt.get("Hour") or ""
            mean_kmph = cls._safe_float(pt.get("Mean MSW (kmph)") or pt.get("mean_msw") or pt.get("msw_kmph"))
            msw_kt = cls._safe_float(pt.get("MSW (kt)") or pt.get("msw_kt"))
            category = str(pt.get("Category") or pt.get("category") or pt.get("stage") or "CYCLONE").strip()

            point_data = {
                "index": idx + 1,
                "type": "observed",
                "cyclone_name": str(name or cyclone_name or "Active System").strip(),
                "datetime": obs_time,
                "hour": pt.get("Hour") or pt.get("hour") or "",
                "lat": lat,
                "lon": lon,
                "coordinates": [lon, lat],  # GeoJSON convention [lon, lat]
                "lat_lon": [lat, lon],      # Leaflet convention [lat, lon]
                "msw_range_kmph": str(pt.get("MSW range (kmph)") or pt.get("msw_range") or "").strip(),
                "mean_msw_kmph": mean_kmph if mean_kmph > 0 else None,
                "msw_kt": msw_kt if msw_kt > 0 else (round(mean_kmph / 1.852, 1) if mean_kmph > 0 else None),
                "category": category,
                "source": "India Meteorological Department (IMD)",
            }
            parsed_observed.append(point_data)
            latest_obs = point_data

        # Parse forecast points
        parsed_forecast = []
        for idx, pt in enumerate(forecast_raw):
            if not isinstance(pt, dict):
                continue
            lat = cls._safe_float(pt.get("lat") or pt.get("latitude"))
            lon = cls._safe_float(pt.get("lon") or pt.get("longitude") or pt.get("lng"))

            if not cls._is_valid_coordinate(lat, lon):
                continue

            fc_time = pt.get("Date/Time") or pt.get("date_time") or pt.get("time") or pt.get("Hour") or ""
            mean_kmph = cls._safe_float(pt.get("Mean MSW (kmph)") or pt.get("mean_msw") or pt.get("msw_kmph"))
            msw_kt = cls._safe_float(pt.get("MSW (kt)") or pt.get("msw_kt"))
            category = str(pt.get("Category") or pt.get("category") or pt.get("stage") or "FORECAST").strip()

            point_data = {
                "index": idx + 1,
                "type": "forecast",
                "cyclone_name": str(pt.get("CYCLONE_NAME") or cyclone_name or "Active System").strip(),
                "datetime": fc_time,
                "hour": pt.get("Hour") or pt.get("hour") or "",
                "lat": lat,
                "lon": lon,
                "coordinates": [lon, lat],
                "lat_lon": [lat, lon],
                "msw_range_kmph": str(pt.get("MSW range (kmph)") or pt.get("msw_range") or "").strip(),
                "mean_msw_kmph": mean_kmph if mean_kmph > 0 else None,
                "msw_kt": msw_kt if msw_kt > 0 else (round(mean_kmph / 1.852, 1) if mean_kmph > 0 else None),
                "category": category,
                "source": "IMD Forecast Track",
            }
            parsed_forecast.append(point_data)

        result["observed_track"] = parsed_observed
        result["forecast_track"] = parsed_forecast
        result["counts"]["observed"] = len(parsed_observed)
        result["counts"]["forecast"] = len(parsed_forecast)

        if parsed_observed:
            result["has_active_cyclone"] = True
            result["cyclone_name"] = cyclone_name or "Active Tropical Cyclone"
            result["current_position"] = latest_obs
            result["category"] = latest_obs.get("category") if latest_obs else "CYCLONE"
            result["observation_time"] = latest_obs.get("datetime") if latest_obs else None
            result["intensity"] = {
                "mean_msw_kmph": latest_obs.get("mean_msw_kmph") if latest_obs else None,
                "msw_range_kmph": latest_obs.get("msw_range_kmph") if latest_obs else None,
                "msw_kt": latest_obs.get("msw_kt") if latest_obs else None,
                "category": latest_obs.get("category") if latest_obs else None,
            }

        return result

    # ==========================================================================
    # 2. IMD CYCLONE WIND WARNING API
    # ==========================================================================
    @classmethod
    def fetch_imd_cyclone_wind(cls, force=False):
        """
        Fetch official IMD Cyclone Wind Warnings (27kt, 34kt, 50kt, 64kt).
        Coordinates follow GeoJSON standard: [longitude, latitude].
        """
        headers, auth_status = IMDAuthManager.get_authenticated_headers(force_refresh=force)
        api_status = {
            "available": False,
            "status": auth_status.get("status", "PENDING"),
            "status_code": None,
            "message": auth_status.get("message", "Pending fetch"),
            "source": "India Meteorological Department (IMD)",
            "endpoint": IMD_CYCLONE_WIND_URL,
        }
        raw_data = None
        server_received_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            resp = requests.get(
                IMD_CYCLONE_WIND_URL,
                headers=headers,
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
            api_status["status_code"] = resp.status_code

            if resp.status_code == 200:
                try:
                    raw_data = resp.json()
                    api_status["available"] = True
                    api_status["status"] = "LIVE"
                    api_status["message"] = "Live IMD Wind Warning polygons received."
                    cache_payload = {
                        "fetched_at": server_received_at,
                        "source": "IMD Official API",
                        "raw": raw_data,
                    }
                    with open(CYCLONE_WIND_FILE, "w", encoding="utf-8") as f:
                        json.dump(cache_payload, f, indent=2)
                except Exception as json_err:
                    api_status["status"] = "INVALID_RESPONSE"
                    api_status["message"] = f"IMD Wind API returned invalid JSON: {json_err}"
            elif resp.status_code in (401, 403):
                IMDAuthManager.invalidate_token()
                api_status["status"] = "AWAITING_VERIFICATION"
                api_status["message"] = f"IMD Wind API authentication pending verification (HTTP {resp.status_code})."
            else:
                api_status["status"] = "SERVER_ERROR"
                api_status["message"] = f"IMD Wind API returned HTTP {resp.status_code}."
        except requests.Timeout:
            api_status["status"] = "NETWORK_TIMEOUT"
            api_status["message"] = "IMD Wind API request timed out."
        except requests.RequestException as exc:
            api_status["status"] = "NETWORK_ERROR"
            api_status["message"] = f"IMD Wind connection error: {exc.__class__.__name__}"
        except Exception as exc:
            api_status["status"] = "ERROR"
            api_status["message"] = f"Wind warning fetch error: {exc.__class__.__name__}"

        is_cached = False
        cached_time = None
        if not raw_data and os.path.exists(CYCLONE_WIND_FILE):
            try:
                with open(CYCLONE_WIND_FILE, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    if isinstance(cached, dict) and "raw" in cached:
                        raw_data = cached["raw"]
                        cached_time = cached.get("fetched_at")
                        is_cached = True
            except Exception:
                raw_data = None

        normalized = cls._normalize_wind_data(raw_data, api_status, is_cached, cached_time, server_received_at)
        return normalized

    @classmethod
    def _normalize_wind_data(cls, raw, api_status, is_cached=False, cached_time=None, server_received_at=None):
        """Normalize wind warning MultiPolygons for 27kt, 34kt, 50kt, and 64kt zones."""
        threshold_meta = {
            "27kt": {
                "label": "27 kt (50 km/h) Gale Warning Zone",
                "speed_range": "50–61 km/h (27–33 knots)",
                "color": "#fbc02d",
                "fillColor": "#ffeb3b",
                "fillOpacity": 0.25,
                "severity": "Moderate Gale",
            },
            "34kt": {
                "label": "34 kt (62 km/h) Strong Gale Warning Zone",
                "speed_range": "62–88 km/h (34–47 knots)",
                "color": "#f57c00",
                "fillColor": "#ff9800",
                "fillOpacity": 0.30,
                "severity": "Strong Gale",
            },
            "50kt": {
                "label": "50 kt (92 km/h) Storm Force Wind Zone",
                "speed_range": "89–117 km/h (48–63 knots)",
                "color": "#d32f2f",
                "fillColor": "#f44336",
                "fillOpacity": 0.35,
                "severity": "Storm Force",
            },
            "64kt": {
                "label": "64 kt (118+ km/h) Hurricane Force Wind Zone",
                "speed_range": "118+ km/h (64+ knots)",
                "color": "#7b1fa2",
                "fillColor": "#9c27b0",
                "fillOpacity": 0.40,
                "severity": "Hurricane Force",
            },
        }

        result = {
            "has_wind_warnings": False,
            "zones": {},
            "total_active_zones": 0,
            "api_status": api_status,
            "is_cached": is_cached,
            "cached_at": cached_time,
            "received_at": server_received_at or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        if not raw or not isinstance(raw, dict):
            for threshold, meta in threshold_meta.items():
                result["zones"][threshold] = {
                    "threshold": threshold,
                    "available": False,
                    "meta": meta,
                    "coordinates": None,
                }
            return result

        data_obj = raw.get("data", raw)
        if not isinstance(data_obj, dict):
            data_obj = {}

        active_count = 0
        for threshold, meta in threshold_meta.items():
            zone_data = data_obj.get(threshold)
            coords = None
            poly_type = "MultiPolygon"

            if zone_data and isinstance(zone_data, dict):
                raw_coords = zone_data.get("coordinates")
                if raw_coords and isinstance(raw_coords, list) and len(raw_coords) > 0:
                    coords = raw_coords
                    poly_type = zone_data.get("type", "MultiPolygon")
                    active_count += 1

            result["zones"][threshold] = {
                "threshold": threshold,
                "available": bool(coords),
                "type": poly_type,
                "coordinates": coords,  # GeoJSON [lon, lat]
                "meta": meta,
            }

        result["total_active_zones"] = active_count
        result["has_wind_warnings"] = (active_count > 0)
        return result

    # ==========================================================================
    # 3. IMD CONE OF UNCERTAINTY (COU) API
    # ==========================================================================
    @classmethod
    def fetch_imd_cyclone_cou(cls, force=False):
        """
        Fetch official IMD Cone of Uncertainty (COU).
        GeoJSON coordinate ordering: [longitude, latitude].
        """
        headers, auth_status = IMDAuthManager.get_authenticated_headers(force_refresh=force)
        api_status = {
            "available": False,
            "status": auth_status.get("status", "PENDING"),
            "status_code": None,
            "message": auth_status.get("message", "Pending fetch"),
            "source": "India Meteorological Department (IMD)",
            "endpoint": IMD_CYCLONE_COU_URL,
        }
        raw_data = None
        server_received_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        try:
            resp = requests.get(
                IMD_CYCLONE_COU_URL,
                headers=headers,
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
            api_status["status_code"] = resp.status_code

            if resp.status_code == 200:
                try:
                    raw_data = resp.json()
                    api_status["available"] = True
                    api_status["status"] = "LIVE"
                    api_status["message"] = "Live IMD Cone of Uncertainty polygon received."
                    cache_payload = {
                        "fetched_at": server_received_at,
                        "source": "IMD Official API",
                        "raw": raw_data,
                    }
                    with open(CYCLONE_COU_FILE, "w", encoding="utf-8") as f:
                        json.dump(cache_payload, f, indent=2)
                except Exception as json_err:
                    api_status["status"] = "INVALID_RESPONSE"
                    api_status["message"] = f"IMD COU API returned invalid JSON: {json_err}"
            elif resp.status_code in (401, 403):
                IMDAuthManager.invalidate_token()
                api_status["status"] = "AWAITING_VERIFICATION"
                api_status["message"] = f"IMD COU API authentication pending verification (HTTP {resp.status_code})."
            else:
                api_status["status"] = "SERVER_ERROR"
                api_status["message"] = f"IMD COU API returned HTTP {resp.status_code}."
        except requests.Timeout:
            api_status["status"] = "NETWORK_TIMEOUT"
            api_status["message"] = "IMD COU API request timed out."
        except requests.RequestException as exc:
            api_status["status"] = "NETWORK_ERROR"
            api_status["message"] = f"IMD COU connection error: {exc.__class__.__name__}"
        except Exception as exc:
            api_status["status"] = "ERROR"
            api_status["message"] = f"COU fetch error: {exc.__class__.__name__}"

        is_cached = False
        cached_time = None
        if not raw_data and os.path.exists(CYCLONE_COU_FILE):
            try:
                with open(CYCLONE_COU_FILE, "r", encoding="utf-8") as f:
                    cached = json.load(f)
                    if isinstance(cached, dict) and "raw" in cached:
                        raw_data = cached["raw"]
                        cached_time = cached.get("fetched_at")
                        is_cached = True
            except Exception:
                raw_data = None

        normalized = cls._normalize_cou_data(raw_data, api_status, is_cached, cached_time, server_received_at)
        return normalized

    @classmethod
    def _normalize_cou_data(cls, raw, api_status, is_cached=False, cached_time=None, server_received_at=None):
        """Normalize Cone of Uncertainty polygon geometry."""
        result = {
            "has_cone": False,
            "type": "MultiPolygon",
            "coordinates": None,
            "meta": {
                "label": "IMD Forecast Cone of Uncertainty",
                "description": "Represents the probable path of the cyclone center (60–90% confidence envelope). Does NOT indicate the full extent of the storm.",
                "color": "#e65100",
                "fillColor": "#ff9800",
                "fillOpacity": 0.22,
                "weight": 2,
                "dashArray": "4, 6",
            },
            "api_status": api_status,
            "is_cached": is_cached,
            "cached_at": cached_time,
            "received_at": server_received_at or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        if not raw or not isinstance(raw, dict):
            return result

        data_obj = raw.get("data", raw)
        if isinstance(data_obj, dict):
            if data_obj.get("coordinates"):
                result["coordinates"] = data_obj.get("coordinates")
                result["type"] = data_obj.get("type", "MultiPolygon")
                result["has_cone"] = True
            elif data_obj.get("cou_polygon"):
                raw_poly = data_obj.get("cou_polygon")
                if isinstance(raw_poly, list) and len(raw_poly) > 0:
                    geo_coords = [[[cls._safe_float(p[1]), cls._safe_float(p[0])] for p in raw_poly if len(p) >= 2]]
                    result["coordinates"] = [geo_coords]
                    result["has_cone"] = True

        return result

    # ==========================================================================
    # 4. SURAKSHA KAVACH GUNTUR LOCAL RISK ANALYSIS ENGINE
    # ==========================================================================
    @classmethod
    def calculate_guntur_local_risk(cls, track_data, wind_data, cou_data):
        """
        Calculate Guntur / Andhra Pradesh coastal proximity and threat metrics
        derived from official IMD data.
        Clearly labeled as: SURAKSHA KAVACH LOCAL RISK ANALYSIS.
        """
        has_active = track_data.get("has_active_cyclone", False)
        current_pos = track_data.get("current_position")
        forecast_track = track_data.get("forecast_track", [])

        if not has_active or not current_pos:
            return {
                "source": "Suraksha Kavach Local Risk Analysis",
                "disclaimer": "Calculated by Suraksha Kavach algorithms based on official IMD feeds.",
                "threat_level": "LOW",
                "threat_badge": "🟢 Normal / No Active Coastal Threat",
                "distance_to_eye_km": None,
                "closest_approach_km": None,
                "bearing_to_eye": None,
                "direction": None,
                "closest_forecast_time": None,
                "guntur_in_wind_zone": False,
                "guntur_in_cone": False,
                "active_warnings": [],
                "advisory": (
                    "No active tropical cyclones currently detected in the North Indian Ocean basin. "
                    "Routine coastal monitoring is maintained in coordination with IMD and APSDMA."
                ),
                "mandal_readiness": {
                    "coastal_mandals": ["Bapatla", "Nizampatnam", "Repalle", "Karlapalem"],
                    "status": "Normal Watch",
                    "shelter_status": "Pre-positioned / Standby"
                }
            }

        # Calculate distance to current eye position
        eye_lat = current_pos.get("lat", 0.0)
        eye_lon = current_pos.get("lon", 0.0)
        dist_to_eye = cls.haversine_distance(GUNTUR_LAT, GUNTUR_LON, eye_lat, eye_lon)
        bearing, direction = cls.calculate_bearing(GUNTUR_LAT, GUNTUR_LON, eye_lat, eye_lon)

        # Calculate closest approach along forecast track
        min_forecast_dist = dist_to_eye
        closest_time = current_pos.get("datetime")

        for pt in forecast_track:
            f_lat = pt.get("lat")
            f_lon = pt.get("lon")
            if f_lat and f_lon:
                d = cls.haversine_distance(GUNTUR_LAT, GUNTUR_LON, f_lat, f_lon)
                if d < min_forecast_dist:
                    min_forecast_dist = d
                    closest_time = pt.get("datetime")

        # Determine threat level
        threat_level = "LOW"
        threat_badge = "🟢 Low Alert"
        warnings = []

        if min_forecast_dist < 150:
            threat_level = "SEVERE"
            threat_badge = "🔴 Red Alert — Immediate Coastal Landfall / Close Approach"
            warnings.append("Cyclone forecast trajectory passes within 150 km of Guntur / Krishna / Bapatla coastal belt.")
        elif min_forecast_dist < 300:
            threat_level = "HIGH"
            threat_badge = "🟠 Orange Alert — High Wind & Gale Threat"
            warnings.append("Storm track approaching within 300 km. Gale force winds and heavy squalls anticipated.")
        elif min_forecast_dist < 600:
            threat_level = "MODERATE"
            threat_badge = "🟡 Yellow Alert — Cyclone Watch"
            warnings.append("System in Bay of Bengal; trajectory monitored for coastal recurvature.")

        advisory = (
            f"Current storm center is {dist_to_eye} km {direction} of Guntur. "
            f"Closest forecast approach is projected at {min_forecast_dist} km ({closest_time or 'Forecast timeline'}). "
            "Follow official GMC and APSDMA instructions. Keep emergency kits ready."
        )

        return {
            "source": "Suraksha Kavach Local Risk Analysis",
            "disclaimer": "Calculated by Suraksha Kavach algorithms based on official IMD feeds. Not official IMD designation.",
            "threat_level": threat_level,
            "threat_badge": threat_badge,
            "distance_to_eye_km": dist_to_eye,
            "closest_approach_km": min_forecast_dist,
            "bearing_to_eye": bearing,
            "direction": direction,
            "closest_forecast_time": closest_time,
            "guntur_in_wind_zone": bool(wind_data.get("has_wind_warnings")),
            "guntur_in_cone": bool(cou_data.get("has_cone")),
            "active_warnings": warnings,
            "advisory": advisory,
            "mandal_readiness": {
                "coastal_mandals": ["Bapatla", "Nizampatnam", "Repalle", "Karlapalem"],
                "status": "High Alert" if threat_level in ("HIGH", "SEVERE") else ("Advisory" if threat_level == "MODERATE" else "Standby"),
                "shelter_status": "Active & Stocked" if threat_level in ("HIGH", "SEVERE") else "Standby"
            }
        }

    # ==========================================================================
    # 5. UNIFIED NORMALIZED CYCLONE PAYLOAD
    # ==========================================================================
    @classmethod
    def fetch_all_cyclone_data(cls, force=False):
        """
        Fetch all 3 official IMD endpoints + MOSDAC satellite metadata + Guntur Risk.
        Returns combined normalized payload with TTL caching.
        """
        now = time.time()
        if not force and cls._cached_summary and (now - cls._last_fetch_time < CACHE_TTL_SECONDS):
            return cls._cached_summary

        track = cls.fetch_imd_cyclone_track(force=force)
        wind = cls.fetch_imd_cyclone_wind(force=force)
        cou = cls.fetch_imd_cyclone_cou(force=force)
        satellite = MOSDACService.get_latest_satellite_image(force=force)
        guntur_risk = cls.calculate_guntur_local_risk(track, wind, cou)

        has_active = track.get("has_active_cyclone", False)
        cyclone_name = track.get("cyclone_name")

        # Determine aggregate system status
        auth_status = IMDAuthManager.get_auth_status()
        if not auth_status.get("is_configured"):
            system_status = "awaiting_verification"
            status_message = "IMD Live Data Connection — Awaiting Account Verification / Configuration"
        elif has_active:
            system_status = "active_cyclone"
            status_message = f"Active Tropical Cyclone: {cyclone_name} ({track.get('category', 'Cyclonic System')})"
        else:
            system_status = "no_active_cyclone"
            status_message = "No active tropical cyclone currently reported by IMD in North Indian Ocean (Bay of Bengal / Arabian Sea)."

        sources_status = {
            "imd_track": track.get("api_status", {}),
            "imd_wind": wind.get("api_status", {}),
            "imd_cou": cou.get("api_status", {}),
            "mosdac_satellite": {
                "status": satellite.get("status", "AWAITING_CONFIG"),
                "available": satellite.get("available", False),
                "source": satellite.get("source", "ISRO / MOSDAC"),
                "message": satellite.get("message", "Satellite layer active"),
            }
        }

        server_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        combined = {
            "status": "success",
            "system_status": system_status,
            "status_message": status_message,
            "has_active_cyclone": has_active,
            "cyclone_name": cyclone_name,
            "category": track.get("category"),
            "current_position": track.get("current_position"),
            "intensity": track.get("intensity"),
            "observed_track": track.get("observed_track", []),
            "forecast_track": track.get("forecast_track", []),
            "track_counts": track.get("counts", {"observed": 0, "forecast": 0}),
            "wind_warnings": wind.get("zones", {}),
            "has_wind_warnings": wind.get("has_wind_warnings", False),
            "cone_of_uncertainty": cou,
            "satellite_info": satellite,
            "guntur_risk_analysis": guntur_risk,
            "storm_surge_assessment": {
                "available": False,
                "status": "MODEL_REQUIRED",
                "message": "Storm surge assessment requires verified coastal/ocean hydrodynamic model data.",
                "disclaimer": "Official IMD cyclone track API provides atmospheric parameters. Storm surge heights are not fabricated.",
            },
            "sources": sources_status,
            "received_at": server_time,
            "observation_time": track.get("observation_time") or "Official IMD Bulletin Schedule",
            "is_cached": track.get("is_cached", False) or wind.get("is_cached", False) or cou.get("is_cached", False),
            "official_portals": {
                "imd_cyclone": "https://mausam.imd.gov.in/responsive/cycloneinformation.php",
                "rsmc_newdelhi": "https://rsmcnewdelhi.imd.gov.in/",
                "mosdac_cyclone": "https://www.mosdac.gov.in/cyclone",
                "mosdac_home": "https://www.mosdac.gov.in/",
                "mosdac_scorpio": "https://mosdac.gov.in/scorpio/",
                "mosdac_gallery": "https://mosdac.gov.in/gallery/",
            }
        }

        # Cache combined summary
        cls._cached_summary = combined
        cls._last_fetch_time = now

        try:
            with open(CYCLONE_SUMMARY_FILE, "w", encoding="utf-8") as f:
                json.dump(combined, f, indent=2)
        except Exception:
            pass

        return combined

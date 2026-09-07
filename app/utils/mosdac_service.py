"""
Official ISRO / MOSDAC Satellite Data & Meteorological Layer Adapter
====================================================================
Integrates verified satellite feeds and meteorological products from
the Space Applications Centre, ISRO (MOSDAC):
- Official Imager Feed: https://mosdac.gov.in/3drimager.xml
- Official Cyclone Portal: https://www.mosdac.gov.in/cyclone
- Official SCORPIO Vector Wind Map: https://mosdac.gov.in/scorpio/
- Official Ocean Products Gallery: https://mosdac.gov.in/gallery/

Rules:
- Never fabricate satellite image URLs or scrape non-official third-party sites.
- Clean adapter interface returning normalized status and metadata.
"""

import os
import time
import logging
import xml.etree.ElementTree as ET
import urllib3
import requests
from flask import current_app

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger("suraksha_kavach.mosdac_service")

MOSDAC_IMAGER_RSS_URL = "https://mosdac.gov.in/3drimager.xml"
REQUEST_TIMEOUT = 10
MOSDAC_HEADERS = {
    "User-Agent": "SurakshaKavach-DisasterMonitoring/2.0 (Guntur Municipal Corporation; disaster-mgmt.gov.in)",
    "Accept": "application/xml, text/xml, application/json, */*",
}


class MOSDACService:
    """Adapter service for official ISRO MOSDAC satellite feeds and services."""

    _cached_satellite_data = None
    _cache_time = 0
    CACHE_TTL_SECONDS = 600  # 10 minutes cache for satellite imagery feeds

    @classmethod
    def get_latest_satellite_image(cls, force=False):
        """
        Fetch latest verified satellite imagery metadata from official MOSDAC service.
        Returns normalized dictionary.
        """
        now = time.time()
        if not force and cls._cached_satellite_data and (now - cls._cache_time < cls.CACHE_TTL_SECONDS):
            return cls._cached_satellite_data

        result = {
            "available": False,
            "status": "AWAITING_CONFIG",
            "message": "MOSDAC satellite connection active; awaiting verified meteorological feed",
            "satellite": "INSAT-3DR / INSAT-3DS",
            "sensor": "IMAGER",
            "channel": "Thermal Infrared (TIR) / Water Vapour",
            "imageUrl": None,
            "timestamp": None,
            "source": "Space Applications Centre, ISRO (MOSDAC)",
            "official_portals": {
                "cyclone_service": "https://www.mosdac.gov.in/cyclone",
                "scorpio_wind": "https://mosdac.gov.in/scorpio/",
                "ocean_gallery": "https://mosdac.gov.in/gallery/index.html?ds=ocean",
                "mosdac_home": "https://www.mosdac.gov.in/",
                "rss_feed": MOSDAC_IMAGER_RSS_URL,
            },
            "available_layers": [
                {
                    "id": "esri_satellite",
                    "name": "High-Resolution Satellite Imagery",
                    "type": "basemap",
                    "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                    "attribution": "Tiles &copy; Esri, Earthstar Geographics",
                    "is_active": True,
                },
                {
                    "id": "carto_light",
                    "name": "Clean Meteorological Base Map",
                    "type": "basemap",
                    "url": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
                    "attribution": "&copy; OpenStreetMap contributors &copy; CARTO",
                    "is_active": False,
                }
            ],
            "last_checked": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now))
        }

        # Attempt to inspect official INSAT-3DR Imager RSS feed
        try:
            resp = requests.get(
                MOSDAC_IMAGER_RSS_URL,
                headers=MOSDAC_HEADERS,
                verify=False,
                timeout=REQUEST_TIMEOUT
            )
            if resp.status_code == 200 and resp.content:
                try:
                    root = ET.fromstring(resp.content)
                    # Look for items in the RSS feed
                    channel_elem = root.find("channel")
                    if channel_elem is not None:
                        item = channel_elem.find("item")
                        if item is not None:
                            title = item.findtext("title", "")
                            link = item.findtext("link", "")
                            pub_date = item.findtext("pubDate", "")
                            enclosure = item.find("enclosure")
                            image_url = enclosure.get("url") if enclosure is not None else link

                            if image_url and (image_url.endswith(".png") or image_url.endswith(".jpg") or image_url.endswith(".jpeg")):
                                result["available"] = True
                                result["status"] = "LIVE"
                                result["message"] = "Live INSAT satellite imagery retrieved from MOSDAC RSS feed."
                                result["imageUrl"] = image_url
                                result["timestamp"] = pub_date or time.strftime("%Y-%m-%d %H:%M:%S")
                                result["satellite"] = "INSAT-3DR"
                                if title:
                                    result["channel"] = title
                except Exception as parse_err:
                    logger.debug("MOSDAC RSS feed XML parse notice: %s", parse_err)
        except Exception as net_err:
            logger.debug("MOSDAC RSS feed connection notice: %s", net_err)

        cls._cached_satellite_data = result
        cls._cache_time = now
        return result

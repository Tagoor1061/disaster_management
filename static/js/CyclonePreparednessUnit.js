/**
 * Suraksha Kavach — Real-Time Cyclone Monitoring & Meteorological Center
 * ======================================================================
 * Authenticated IMD Tracking & Warning APIs + ISRO MOSDAC Satellite Integration
 *
 * Core Features:
 *   1. Interactive Leaflet Cyclone Map:
 *      - Basemaps: High-Res Satellite (Esri), Voyager (CartoDB), Standard OSM
 *      - Dynamic Layer 1: Current Cyclone Eye (Pulsing Animated Marker + Rich IMD Popup)
 *      - Dynamic Layer 2: IMD Observed Track (Solid path + chronological waypoint markers)
 *      - Dynamic Layer 3: IMD Forecast Track (Dashed path + forecast markers)
 *      - Dynamic Layer 4: IMD Cone of Uncertainty (COU Translucent 60-90% Confidence Polygon)
 *      - Dynamic Layer 5: IMD Wind Warnings (27kt Yellow, 34kt Orange, 50kt Red, 64kt Purple)
 *      - Dynamic Layer 6: MOSDAC / INSAT Satellite Weather Overlay
 *      - Dynamic Layer 7: Guntur Municipal Center & Coastal Reference Marker
 *      - Dynamic Active Layer Counter (computes actual available GIS layers)
 *      - Leaflet Layer Control + Symbology Legend
 *   2. Suraksha Kavach Guntur Local Risk Analysis Engine (Proximity, Approach, Alert Level)
 *   3. Official Meteorological Data Sources & Real-Time Sync Status Table
 *   4. Official Government Web Portals Directory (IMD, MOSDAC, SCORPIO, Ocean Gallery)
 *   5. Dual Timestamps (Server Sync Time vs Official IMD Observation Time)
 *   6. Controlled 5-Minute Auto-Refresh with Countdown & Manual Force Refresh
 *
 * Guntur Municipal Corporation — Suraksha Kavach Disaster Portal
 */

(function () {
    const WIDGET_ID = 'cyclone-preparedness-widget';
    const AUTO_REFRESH_SECONDS = 300; // 5 minutes

    let cycloneMap = null;
    let mapLayers = {
        currentEye: null,
        observedTrack: null,
        forecastTrack: null,
        coneOfUncertainty: null,
        wind27kt: null,
        wind34kt: null,
        wind50kt: null,
        wind64kt: null,
        gunturMarker: null,
        satelliteOverlay: null,
    };
    let layerControl = null;
    let refreshTimerInterval = null;
    let secondsUntilRefresh = AUTO_REFRESH_SECONDS;
    let isMapInitialized = false;

    // Guntur Reference Coordinates (AP)
    const GUNTUR_COORDS = [16.3067, 80.4365];

    // IMD Cyclone Category Color Palette
    const CATEGORY_COLORS = {
        'SUPER CYCLONE': '#4a148c',
        'SUPER CYCLONIC STORM': '#4a148c',
        'EXTREMELY SEVERE CYCLONIC STORM': '#b71c1c',
        'VERY SEVERE CYCLONIC STORM': '#d32f2f',
        'SEVERE CYCLONIC STORM': '#e65100',
        'CYCLONIC STORM': '#f57c00',
        'DEEP DEPRESSION': '#fbc02d',
        'DEPRESSION': '#388e3c',
        'LOW PRESSURE AREA': '#0288d1',
        'DEFAULT': '#e65100'
    };

    function getCategoryColor(cat) {
        if (!cat) return CATEGORY_COLORS.DEFAULT;
        const upper = String(cat).toUpperCase();
        for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
            if (upper.includes(key)) return color;
        }
        return CATEGORY_COLORS.DEFAULT;
    }

    /**
     * Main Entrypoint — Renders Container and Initializes Everything
     */
    window.renderCyclonePreparedness = function () {
        const container = document.getElementById(WIDGET_ID);
        if (!container) return;

        container.innerHTML = `
            <div class="cyclone-dashboard-card" style="background:#ffffff; border-radius:18px; padding:2rem; box-shadow:0 12px 36px rgba(0,0,0,0.08); margin-bottom:2.6rem; border:2px solid #ffe0b2;">
                
                <!-- 1. Header Banner with Refresh Controls -->
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.2rem; margin-bottom:1.6rem; border-bottom:2px solid #ffe0b2; padding-bottom:1.4rem;">
                    <div>
                        <div style="font-size:1.65rem; font-weight:800; color:#e65100; display:flex; align-items:center; gap:0.7rem; flex-wrap:wrap;">
                            <span>🌀</span> Real-Time Cyclone Monitoring & Official Satellite Radar
                            <span id="cyclone-live-status-pill" style="font-size:0.82rem; background:#1565c0; color:#fff; padding:4px 14px; border-radius:14px; font-weight:700; letter-spacing:0.5px;">
                                IMD LIVE DATA — AWAITING ACCOUNT VERIFICATION
                            </span>
                        </div>
                        <small style="color:#555; display:block; margin-top:6px; font-size:0.96rem;">
                            India Meteorological Department Real-Time Cyclone Tracks, Gale Warning MultiPolygons & ISRO Space Applications Centre Satellite Feeds
                        </small>
                    </div>

                    <div style="display:flex; align-items:center; gap:0.9rem; flex-wrap:wrap;">
                        <span id="cyclone-refresh-timer" style="font-size:0.92rem; color:#666; background:#fff3e0; padding:8px 16px; border-radius:10px; border:1px solid #ffcc80; font-weight:700;">
                            <i class="fas fa-clock text-orange"></i> Auto-refresh in: <strong id="refresh-countdown">5:00</strong>
                        </span>
                        <button id="cyclone-manual-refresh-btn" style="background:#e65100; color:#ffffff; border:none; padding:0.8rem 1.5rem; border-radius:10px; cursor:pointer; font-weight:700; font-size:0.95rem; display:inline-flex; align-items:center; gap:0.6rem; transition:background 0.2s, transform 0.2s; box-shadow:0 4px 12px rgba(230,81,0,0.25);">
                            <i class="fas fa-sync-alt" id="cyclone-refresh-icon"></i> Refresh Live Data
                        </button>
                    </div>
                </div>

                <!-- 2. Dynamic Real-Time Storm Status Summary Card -->
                <div id="cyclone-info-card-container" style="margin-bottom:1.8rem;">
                    <div style="background:#fff8e1; padding:1.5rem; border-radius:14px; border-left:6px solid #ffa000; display:flex; align-items:center; gap:1.2rem;">
                        <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:#e65100;"></i>
                        <div>
                            <strong style="font-size:1.15rem; color:#e65100;">Connecting to Official Meteorological Network…</strong>
                            <div style="font-size:0.92rem; color:#666; margin-top:3px;">
                                Querying India Meteorological Department (IMD) Cyclone Warning Division & ISRO MOSDAC…
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. Interactive Leaflet Cyclone Map Section -->
                <div style="margin-bottom:2rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                        <div>
                            <h3 style="margin:0; font-size:1.35rem; color:#2c3e50; display:flex; align-items:center; gap:0.6rem; font-weight:800;">
                                <i class="fas fa-map-marked-alt text-orange"></i> Live Cyclone Trajectory, Warning Polygons & Satellite Map
                            </h3>
                            <p style="margin:3px 0 0 0; color:#666; font-size:0.92rem;">
                                North Indian Ocean (Bay of Bengal / Arabian Sea) Interactive GIS Radar & Gale Threshold Zones
                            </p>
                        </div>
                        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                            <span id="cyclone-active-layers-badge" style="font-size:0.82rem; background:#e8f5e9; color:#2e7d32; padding:5px 12px; border-radius:12px; font-weight:700;">
                                <i class="fas fa-layer-group"></i> 2 GIS Layers Active
                            </span>
                        </div>
                    </div>

                    <!-- Leaflet Map Container -->
                    <div id="cyclone-leaflet-map" style="height:520px; width:100%; border-radius:14px; border:2px solid #e0e0e0; overflow:hidden; position:relative; z-index:1; box-shadow:0 6px 20px rgba(0,0,0,0.06);"></div>

                    <!-- Map Symbology Legend -->
                    <div style="background:#fafafa; border:1px solid #e0e0e0; border-radius:10px; padding:0.9rem 1.2rem; margin-top:0.9rem; font-size:0.86rem; color:#444; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.8rem;">
                        <span style="font-weight:700; color:#2c3e50;"><i class="fas fa-info-circle text-orange"></i> Map Legend:</span>
                        <div style="display:flex; align-items:center; gap:1.2rem; flex-wrap:wrap;">
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#d32f2f; border:2px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.4);"></span> Current Eye
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:16px; height:3px; background:#d32f2f;"></span> Observed Track
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:16px; height:3px; border-top:2px dashed #e65100;"></span> Forecast Track
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:14px; height:10px; background:rgba(255,152,0,0.25); border:1px dashed #e65100;"></span> Cone of Uncertainty
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:10px; height:10px; background:#ffeb3b; border:1px solid #fbc02d;"></span> 27 kt Gale
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:10px; height:10px; background:#ff9800; border:1px solid #f57c00;"></span> 34 kt Gale
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:10px; height:10px; background:#f44336; border:1px solid #d32f2f;"></span> 50 kt Storm
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:10px; height:10px; background:#9c27b0; border:1px solid #7b1fa2;"></span> 64 kt Hurricane
                            </span>
                            <span style="display:inline-flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:#1565c0; border:2px solid #fff;"></span> Guntur City
                            </span>
                        </div>
                    </div>
                </div>

                <!-- 4. Suraksha Kavach Guntur Local Risk Analysis Panel -->
                <div id="cyclone-guntur-risk-panel" style="margin-bottom:2rem;"></div>

                <!-- 5. Storm Surge Science & Preparedness Notice -->
                <div style="background:#e1f5fe; border:2px solid #81d4fa; border-radius:12px; padding:1.4rem; margin-bottom:2rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1.2rem;">
                    <div style="display:flex; align-items:center; gap:1.1rem;">
                        <span style="font-size:2.2rem; color:#0288d1;"><i class="fas fa-water"></i></span>
                        <div>
                            <strong style="color:#01579b; font-size:1.1rem;">🌊 Coastal Storm Surge Monitoring & Ocean Dynamics</strong>
                            <p style="margin:4px 0 0 0; color:#0277bd; font-size:0.92rem; max-width:900px; line-height:1.5;">
                                Storm surge is driven by atmospheric pressure deficit and onshore gale friction piling seawater against the coastline.
                                Official numerical ocean storm surge modeling is provided by INCOIS & IMD Ocean State Forecasts.
                                Suraksha Kavach strictly presents verified coastal surge data without numerical fabrication.
                            </p>
                        </div>
                    </div>
                    <a href="https://incois.gov.in/portal/osf/osf.jsp" target="_blank" rel="noopener noreferrer" style="background:#0288d1; color:#fff; padding:0.65rem 1.2rem; border-radius:8px; text-decoration:none; font-weight:700; font-size:0.88rem; display:inline-flex; align-items:center; gap:0.5rem; white-space:nowrap;">
                        <span>INCOIS Ocean Portal</span> <i class="fas fa-external-link-alt"></i>
                    </a>
                </div>

                <!-- 6. Official Government Meteorological Portals (4 Cards) -->
                <div style="margin:2.2rem 0 1.2rem 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <h3 style="margin:0; font-size:1.35rem; font-weight:800; color:#2c3e50; display:flex; align-items:center; gap:0.6rem;">
                            <i class="fas fa-external-link-alt text-orange"></i> Official Real-Time Meteorological & Satellite Portals
                        </h3>
                        <p style="margin:4px 0 0 0; color:#666; font-size:0.94rem;">
                            Direct authenticated access to official tracking maps, INSAT satellite products, and ocean surface wind vector systems.
                        </p>
                    </div>
                    <span style="background:#e8f5e9; color:#2e7d32; padding:6px 14px; border-radius:20px; font-weight:700; font-size:0.86rem; display:inline-flex; align-items:center; gap:0.4rem;">
                        <i class="fas fa-shield-alt"></i> Verified Government Endpoints
                    </span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.5rem; margin-bottom:2rem;">
                    <!-- 1. IMD Real-Time Map -->
                    <div class="portal-card" style="background:#ffffff; border:2px solid #ffcc80; border-radius:14px; padding:1.6rem; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 6px 18px rgba(230,81,0,0.06); position:relative; overflow:hidden;">
                        <div style="position:absolute; top:0; left:0; right:0; height:5px; background:linear-gradient(90deg, #e65100, #ff9800);"></div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                                <span style="background:#fff3e0; color:#e65100; font-weight:800; font-size:0.8rem; padding:4px 10px; border-radius:8px; border:1px solid #ffe0b2;">
                                    🇮🇳 IMD / MoES
                                </span>
                                <span style="background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:0.78rem; padding:4px 10px; border-radius:8px;">
                                    <i class="fas fa-circle" style="font-size:0.55rem;"></i> Official Portal
                                </span>
                            </div>
                            <h4 style="margin:0 0 0.5rem 0; font-size:1.2rem; color:#2c3e50; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fas fa-map-marked-alt text-orange"></i> 1. IMD Real-Time Track & Warning Map
                            </h4>
                            <p style="margin:0 0 1rem 0; color:#555; font-size:0.91rem; line-height:1.5;">
                                India Meteorological Department's official live storm tracking system featuring observed tracks, 120-hour forecast cone of uncertainty (COU), and coastal gale wind warning threshold polygons (27, 34, 50, 64 kt).
                            </p>
                        </div>
                        <div>
                            <a href="https://mausam.imd.gov.in/responsive/cycloneinformation.php" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:#e65100; color:#ffffff; text-decoration:none; padding:0.75rem 1.2rem; border-radius:10px; font-weight:700; font-size:0.92rem; box-shadow:0 4px 12px rgba(230,81,0,0.25);">
                                <span>Open IMD Real-Time Map</span>
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                            <div style="text-align:center; margin-top:0.4rem;">
                                <a href="https://rsmcnewdelhi.imd.gov.in/" target="_blank" rel="noopener noreferrer" style="color:#666; font-size:0.8rem; text-decoration:underline;">
                                    RSMC New Delhi Portal ↗
                                </a>
                            </div>
                        </div>
                    </div>

                    <!-- 2. MOSDAC Cyclone Service Live Map -->
                    <div class="portal-card" style="background:#ffffff; border:2px solid #ffe0b2; border-radius:14px; padding:1.6rem; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 6px 18px rgba(230,81,0,0.06); position:relative; overflow:hidden;">
                        <div style="position:absolute; top:0; left:0; right:0; height:5px; background:linear-gradient(90deg, #f57c00, #ffb74d);"></div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                                <span style="background:#fff3e0; color:#e65100; font-weight:800; font-size:0.8rem; padding:4px 10px; border-radius:8px; border:1px solid #ffe0b2;">
                                    🛰️ ISRO / MOSDAC SAC
                                </span>
                                <span style="background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:0.78rem; padding:4px 10px; border-radius:8px;">
                                    <i class="fas fa-satellite" style="font-size:0.55rem;"></i> Satellite Active
                                </span>
                            </div>
                            <h4 style="margin:0 0 0.5rem 0; font-size:1.2rem; color:#2c3e50; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fas fa-satellite text-orange"></i> 2. MOSDAC Cyclone Service Live Map
                            </h4>
                            <p style="margin:0 0 1rem 0; color:#555; font-size:0.91rem; line-height:1.5;">
                                ISRO Space Applications Centre automated satellite-derived tropical cyclogenesis monitoring, rapid INSAT-3D/3DR thermal infrared scans, and storm center tracking.
                            </p>
                        </div>
                        <div>
                            <a href="https://www.mosdac.gov.in/cyclone" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:#e65100; color:#ffffff; text-decoration:none; padding:0.75rem 1.2rem; border-radius:10px; font-weight:700; font-size:0.92rem; box-shadow:0 4px 12px rgba(230,81,0,0.25);">
                                <span>Open MOSDAC Cyclone Map</span>
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                            <div style="text-align:center; margin-top:0.4rem;">
                                <a href="https://www.mosdac.gov.in/" target="_blank" rel="noopener noreferrer" style="color:#666; font-size:0.8rem; text-decoration:underline;">
                                    MOSDAC Home Portal ↗
                                </a>
                            </div>
                        </div>
                    </div>

                    <!-- 3. MOSDAC SCORPIO Wind Map -->
                    <div class="portal-card" style="background:#ffffff; border:2px solid #b2dfdb; border-radius:14px; padding:1.6rem; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 6px 18px rgba(0,105,92,0.06); position:relative; overflow:hidden;">
                        <div style="position:absolute; top:0; left:0; right:0; height:5px; background:linear-gradient(90deg, #00695c, #26a69a);"></div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                                <span style="background:#e0f2f1; color:#00695c; font-weight:800; font-size:0.8rem; padding:4px 10px; border-radius:8px; border:1px solid #b2dfdb;">
                                    🌪️ ISRO SCORPIO
                                </span>
                                <span style="background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:0.78rem; padding:4px 10px; border-radius:8px;">
                                    <i class="fas fa-wind" style="font-size:0.55rem;"></i> Wind Vectors
                                </span>
                            </div>
                            <h4 style="margin:0 0 0.5rem 0; font-size:1.2rem; color:#2c3e50; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fas fa-wind text-teal"></i> 3. MOSDAC SCORPIO Wind Map
                            </h4>
                            <p style="margin:0 0 1rem 0; color:#555; font-size:0.91rem; line-height:1.5;">
                                Ocean surface scatterometer-derived wind vectors, atmospheric circulation trajectory maps, vorticity streamlines, and marine gale velocity contours.
                            </p>
                        </div>
                        <div>
                            <a href="https://mosdac.gov.in/scorpio/" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:#00695c; color:#ffffff; text-decoration:none; padding:0.75rem 1.2rem; border-radius:10px; font-weight:700; font-size:0.92rem; box-shadow:0 4px 12px rgba(0,105,92,0.25);">
                                <span>Open SCORPIO Wind Map</span>
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>

                    <!-- 4. MOSDAC Ocean Products Gallery -->
                    <div class="portal-card" style="background:#ffffff; border:2px solid #b3e5fc; border-radius:14px; padding:1.6rem; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 6px 18px rgba(2,136,209,0.06); position:relative; overflow:hidden;">
                        <div style="position:absolute; top:0; left:0; right:0; height:5px; background:linear-gradient(90deg, #0288d1, #4fc3f7);"></div>
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.8rem;">
                                <span style="background:#e1f5fe; color:#0288d1; font-weight:800; font-size:0.8rem; padding:4px 10px; border-radius:8px; border:1px solid #b3e5fc;">
                                    🌊 ISRO Ocean Gallery
                                </span>
                                <span style="background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:0.78rem; padding:4px 10px; border-radius:8px;">
                                    <i class="fas fa-water" style="font-size:0.55rem;"></i> Gallery Live
                                </span>
                            </div>
                            <h4 style="margin:0 0 0.5rem 0; font-size:1.2rem; color:#2c3e50; display:flex; align-items:center; gap:0.5rem;">
                                <i class="fas fa-water text-blue"></i> 4. MOSDAC Ocean Products Gallery
                            </h4>
                            <p style="margin:0 0 1rem 0; color:#555; font-size:0.91rem; line-height:1.5;">
                                Comprehensive oceanographic satellite product gallery featuring Sea Surface Temperature (SST), thermal infrared brightness, and ocean color dynamics.
                            </p>
                        </div>
                        <div>
                            <a href="https://mosdac.gov.in/gallery/index.html?ds=ocean" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:#0288d1; color:#ffffff; text-decoration:none; padding:0.75rem 1.2rem; border-radius:10px; font-weight:700; font-size:0.92rem; box-shadow:0 4px 12px rgba(2,136,209,0.25);">
                                <span>Open Ocean Products Gallery</span>
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                </div>

                <!-- 7. Official Data Sources & Real-Time Sync Status Table -->
                <div style="background:#fafafa; border:1px solid #e0e0e0; border-radius:12px; padding:1.4rem; margin-top:1.6rem;">
                    <div style="font-weight:700; color:#2c3e50; margin-bottom:0.8rem; font-size:1.05rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.6rem;">
                        <span style="display:flex; align-items:center; gap:0.5rem;">
                            <i class="fas fa-satellite-dish text-orange"></i> Official Data Sources & Real-Time Sync Status
                        </span>
                        <div style="display:flex; gap:0.8rem; font-size:0.84rem; flex-wrap:wrap;">
                            <span id="cyclone-server-time-badge" style="background:#e3f2fd; padding:4px 12px; border-radius:12px; color:#1565c0; font-weight:700;">
                                Server Sync: Checking…
                            </span>
                            <span id="cyclone-obs-time-badge" style="background:#fff3e0; padding:4px 12px; border-radius:12px; color:#e65100; font-weight:700;">
                                IMD Obs: Checking…
                            </span>
                        </div>
                    </div>
                    <div id="cyclone-api-health-table" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:0.8rem; font-size:0.9rem;">
                        <div style="color:#666;">Verifying official IMD & MOSDAC endpoints…</div>
                    </div>
                </div>

            </div>
        `;

        // Attach UI event listeners
        attachUIListeners();

        // Initialize Leaflet Map
        initLeafletMap();

        // Fetch Live Data
        loadCycloneData();

        // Start Auto-Refresh Timer
        startAutoRefreshTimer();
    };

    /**
     * Attach UI listeners
     */
    function attachUIListeners() {
        const refreshBtn = document.getElementById('cyclone-manual-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                loadCycloneData(true);
            });
        }
    }

    /**
     * Initialize Leaflet Map
     */
    function initLeafletMap() {
        const mapContainer = document.getElementById('cyclone-leaflet-map');
        if (!mapContainer) return;

        if (typeof L === 'undefined') {
            mapContainer.innerHTML = '<div style="padding:2rem; text-align:center; color:#666;">Loading Leaflet Map Engine…</div>';
            return;
        }

        // Cleanup previous instance if any
        if (cycloneMap) {
            try {
                cycloneMap.remove();
            } catch (e) {
                console.warn('Map cleanup notice:', e);
            }
        }

        // Base Layers
        const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri, Earthstar Geographics',
            maxZoom: 18
        });

        const cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            maxZoom: 19
        });

        const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        });

        // Initialize map centered over Bay of Bengal and coastal Andhra Pradesh
        cycloneMap = L.map('cyclone-leaflet-map', {
            center: [15.5, 83.0],
            zoom: 6,
            layers: [cartoVoyager]
        });

        // Layer groups
        mapLayers.currentEye = L.layerGroup().addTo(cycloneMap);
        mapLayers.observedTrack = L.layerGroup().addTo(cycloneMap);
        mapLayers.forecastTrack = L.layerGroup().addTo(cycloneMap);
        mapLayers.coneOfUncertainty = L.layerGroup().addTo(cycloneMap);
        mapLayers.wind27kt = L.layerGroup().addTo(cycloneMap);
        mapLayers.wind34kt = L.layerGroup().addTo(cycloneMap);
        mapLayers.wind50kt = L.layerGroup().addTo(cycloneMap);
        mapLayers.wind64kt = L.layerGroup().addTo(cycloneMap);
        mapLayers.municipalMarkings = L.layerGroup().addTo(cycloneMap);
        mapLayers.gunturMarker = L.layerGroup().addTo(cycloneMap);
        mapLayers.satelliteOverlay = L.layerGroup();

        // Add Guntur Reference Marker
        addGunturCityMarker();

        // Setup Layer Control
        const baseMaps = {
            "🗺️ Voyager Map": cartoVoyager,
            "🛰️ Satellite Imagery": esriSatellite,
            "🌐 Standard OSM": osmStandard,
        };

        const overlayMaps = {
            "🌀 Current Cyclone Position": mapLayers.currentEye,
            "● IMD Observed Track": mapLayers.observedTrack,
            "— IMD Forecast Track": mapLayers.forecastTrack,
            "▱ IMD Cone of Uncertainty": mapLayers.coneOfUncertainty,
            "🟡 IMD 27 kt Gale Warning": mapLayers.wind27kt,
            "🟠 IMD 34 kt Strong Gale": mapLayers.wind34kt,
            "🔴 IMD 50 kt Storm Warning": mapLayers.wind50kt,
            "🟣 IMD 64 kt Hurricane Zone": mapLayers.wind64kt,
            "🛡️ Municipal Cyclone Risk Zones": mapLayers.municipalMarkings,
            "📍 Guntur City & Coast": mapLayers.gunturMarker,
            "🛰️ MOSDAC Satellite Overlay": mapLayers.satelliteOverlay,
        };

        layerControl = L.control.layers(baseMaps, overlayMaps, {
            position: 'topright',
            collapsed: false
        }).addTo(cycloneMap);

        isMapInitialized = true;
    }

    /**
     * Add Guntur Reference City Marker to Map
     */
    function addGunturCityMarker() {
        if (!mapLayers.gunturMarker) return;
        mapLayers.gunturMarker.clearLayers();

        const gunturIcon = L.divIcon({
            className: 'guntur-custom-marker',
            html: `
                <div style="background:#1565c0; color:#fff; padding:4px 8px; border-radius:6px; font-weight:800; font-size:11px; border:2px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.35); display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
                    <i class="fas fa-landmark"></i> GUNTUR
                </div>
            `,
            iconSize: [80, 24],
            iconAnchor: [40, 12]
        });

        const marker = L.marker(GUNTUR_COORDS, { icon: gunturIcon });
        marker.bindPopup(`
            <div style="font-family:sans-serif; padding:4px; font-size:13px; color:#2c3e50;">
                <strong style="color:#1565c0; font-size:14px;"><i class="fas fa-landmark"></i> Guntur Municipal Corporation</strong>
                <p style="margin:4px 0 2px 0;">Andhra Pradesh Disaster Coordination Centre</p>
                <div style="font-size:11px; color:#666;">Coordinates: 16.31° N, 80.44° E</div>
                <div style="margin-top:6px; font-weight:700; color:#2e7d32;">● Suraksha Kavach Local Risk Node Active</div>
            </div>
        `);
        mapLayers.gunturMarker.addLayer(marker);
    }

    /**
     * Load cyclone data from backend API
     */
    async function loadCycloneData(isManual = false) {
        const refreshBtn = document.getElementById('cyclone-manual-refresh-btn');
        const refreshIcon = document.getElementById('cyclone-refresh-icon');

        if (refreshBtn && isManual) {
            refreshBtn.disabled = true;
            if (refreshIcon) refreshIcon.classList.add('fa-spin');
        }

        try {
            const url = isManual ? '/api/disaster-data/cyclone?force=1' : '/api/disaster-data/cyclone';
            const resp = await fetch(url);
            const data = await resp.json();

            // 1. Update Header Status Pill
            updateHeaderStatusPill(data);

            // 2. Render Top Dynamic Status & Bulletin Card
            renderTopDynamicBulletin(data);

            // 3. Render Main Widget Info Card
            renderCycloneInfoCard(data);

            // 4. Update Interactive Leaflet Map Layers & Dynamic Active Layer Counter
            updateLeafletMapLayers(data);

            // 5. Render Guntur Local Risk Analysis
            renderGunturRiskPanel(data);

            // 6. Render API Health & Source Status Table
            renderApiHealthTable(data);

            // Reset countdown timer
            secondsUntilRefresh = AUTO_REFRESH_SECONDS;
        } catch (err) {
            console.error('Failed to load cyclone data:', err);
            renderErrorState(err);
        } finally {
            if (refreshBtn && isManual) {
                refreshBtn.disabled = false;
                if (refreshIcon) refreshIcon.classList.remove('fa-spin');
            }
        }
    }

    /**
     * Update Header Status Pill
     */
    function updateHeaderStatusPill(data) {
        const pill = document.getElementById('cyclone-live-status-pill');
        if (!pill) return;

        const sources = (data && data.sources) || {};
        const trackStatus = sources.imd_track && sources.imd_track.status;
        const isLiveConnected = (trackStatus === 'LIVE' || trackStatus === 'CONNECTED');

        if (isLiveConnected) {
            pill.style.background = '#2e7d32';
            pill.textContent = 'IMD LIVE DATA — CONNECTED';
        } else {
            pill.style.background = '#1565c0';
            pill.textContent = 'IMD LIVE DATA — AWAITING ACCOUNT VERIFICATION';
        }
    }

    /**
     * Render Top Dynamic Bulletin & Status Pills on the main page
     */
    function renderTopDynamicBulletin(data) {
        const bulletinContainer = document.querySelector('.imd-bulletin-card');
        if (!bulletinContainer) return;

        const hasActive = data && data.has_active_cyclone;
        const sources = (data && data.sources) || {};
        const isLiveConnected = sources.imd_track && (sources.imd_track.status === 'LIVE' || sources.imd_track.status === 'CONNECTED');
        const cycloneName = (data && data.cyclone_name) || 'No Active System';
        const category = (data && data.category) || 'Normal Status';
        const intensity = data && data.intensity;
        const windKmph = (intensity && intensity.mean_msw_kmph) || (data.current_position && data.current_position.mean_msw_kmph) || '--';
        const windKt = (intensity && intensity.msw_kt) || (data.current_position && data.current_position.msw_kt) || '--';
        const obsTime = (data && data.observation_time) || (data && data.received_at) || 'Scheduled Check';

        if (hasActive) {
            const catColor = getCategoryColor(category);
            bulletinContainer.style.borderColor = catColor;
            bulletinContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                    <h3 style="margin:0; color:${catColor}; display:flex; align-items:center; gap:0.6rem; font-size:1.3rem;">
                        <i class="fas fa-bullhorn"></i> Official IMD Cyclone Bulletin — ${cycloneName}
                    </h3>
                    <span style="background:${catColor}; color:#fff; padding:4px 14px; border-radius:20px; font-weight:700; font-size:0.85rem;">
                        ${category}
                    </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1.2rem; background:#ffffff; padding:1.2rem; border-radius:8px; border:1px solid #ffe0b2;">
                    <div>
                        <strong>🌀 Storm Category & Name:</strong> ${cycloneName} (${category})
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">Observed by IMD Cyclone Warning Division. Official tracking active.</p>
                    </div>
                    <div>
                        <strong>⚡ Max Sustained Wind Speed:</strong> ${windKmph} km/h (${windKt} knots)
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">Observation recorded: ${obsTime} (IMD Observation Feed).</p>
                    </div>
                    <div>
                        <strong>🌊 Marine & Coastal Advisory:</strong> High Sea Alert
                        <p style="margin:0.3rem 0 0 0; color:#b71c1c; font-weight:600; font-size:0.92rem;">Fishermen warned against venturing into deep sea along AP coast.</p>
                    </div>
                </div>
            `;
        } else if (!isLiveConnected) {
            bulletinContainer.style.borderColor = '#1565c0';
            bulletinContainer.style.background = '#e3f2fd';
            bulletinContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                    <h3 style="margin:0; color:#1565c0; display:flex; align-items:center; gap:0.6rem; font-size:1.3rem;">
                        <i class="fas fa-satellite-dish"></i> Official IMD Cyclone Advisories & Real-Time Monitoring
                    </h3>
                    <span style="background:#1565c0; color:#fff; padding:4px 14px; border-radius:20px; font-weight:700; font-size:0.85rem;">
                        IMD LIVE DATA — AWAITING ACCOUNT VERIFICATION
                    </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1.2rem; background:#ffffff; padding:1.2rem; border-radius:8px; border:1px solid #bbdefb;">
                    <div>
                        <strong>🛰️ IMD Live Data Bridge:</strong> Configuration Ready
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">Account verification is in progress with IMD. Server-side OAuth2 adapter is operational.</p>
                    </div>
                    <div>
                        <strong>🌊 North Indian Ocean Status:</strong> Routine Atmospheric Watch
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">Monitored continuously via official portals linked below.</p>
                    </div>
                    <div>
                        <strong>🛡️ GMC Coastal Preparedness:</strong> Normal Standby
                        <p style="margin:0.3rem 0 0 0; color:#2e7d32; font-weight:600; font-size:0.92rem;">Multi-purpose relief shelters and coastal monitoring teams on routine readiness.</p>
                    </div>
                </div>
            `;
        } else {
            bulletinContainer.style.borderColor = '#81c784';
            bulletinContainer.style.background = '#f1f8e9';
            bulletinContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                    <h3 style="margin:0; color:#2e7d32; display:flex; align-items:center; gap:0.6rem; font-size:1.3rem;">
                        <i class="fas fa-shield-alt"></i> Official IMD Cyclone Advisories & Bulletins
                    </h3>
                    <span style="background:#2e7d32; color:#fff; padding:4px 14px; border-radius:20px; font-weight:700; font-size:0.85rem;">
                        IMD LIVE DATA — CONNECTED (NO ACTIVE CYCLONE)
                    </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1.2rem; background:#ffffff; padding:1.2rem; border-radius:8px; border:1px solid #c8e6c9;">
                    <div>
                        <strong>🌀 Storm Category:</strong> No Active Tropical Cyclone
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">No deep depression or cyclonic storm currently reported by IMD in Bay of Bengal.</p>
                    </div>
                    <div>
                        <strong>⚡ Coastal Wind Condition:</strong> Normal Sea Breeze
                        <p style="margin:0.3rem 0 0 0; color:#555; font-size:0.92rem;">Official IMD check executed at: ${obsTime}.</p>
                    </div>
                    <div>
                        <strong>🌊 Marine & Fishermen Advisory:</strong> Green / Normal Navigation
                        <p style="margin:0.3rem 0 0 0; color:#2e7d32; font-weight:600; font-size:0.92rem;">Safe navigation along Andhra Pradesh and Bay of Bengal coast.</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Render Dynamic Cyclone Information Card
     */
    function renderCycloneInfoCard(data) {
        const container = document.getElementById('cyclone-info-card-container');
        if (!container) return;

        const hasActive = data && data.has_active_cyclone;
        const sources = (data && data.sources) || {};
        const isLiveConnected = sources.imd_track && (sources.imd_track.status === 'LIVE' || sources.imd_track.status === 'CONNECTED');
        const cycloneName = (data && data.cyclone_name) || 'No Active Cyclone';
        const category = (data && data.category) || 'NORMAL STATUS';
        const categoryColor = getCategoryColor(category);
        const serverTime = (data && data.received_at) || new Date().toLocaleString();
        const obsTime = (data && data.observation_time) || serverTime;

        if (hasActive && data.current_position) {
            const pos = data.current_position;
            const windKmph = (data.intensity && data.intensity.mean_msw_kmph) || pos.mean_msw_kmph || '--';
            const windKt = (data.intensity && data.intensity.msw_kt) || pos.msw_kt || '--';
            const windRange = (data.intensity && data.intensity.msw_range_kmph) || pos.msw_range_kmph || '';
            const obsTimestamp = pos.datetime || obsTime;

            container.innerHTML = `
                <div style="background:linear-gradient(135deg, #ffffff 0%, #fff8f0 100%); border-radius:14px; border:2px solid ${categoryColor}; padding:1.8rem; box-shadow:0 6px 18px rgba(0,0,0,0.06);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.2rem; margin-bottom:1.4rem; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:1.2rem;">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <span style="font-size:2.4rem; display:inline-block;">🌀</span>
                            <div>
                                <h3 style="margin:0; font-size:1.6rem; color:#2c3e50; display:flex; align-items:center; gap:0.7rem; flex-wrap:wrap;">
                                    CYCLONE <strong style="color:${categoryColor};">${cycloneName}</strong>
                                    <span style="font-size:0.85rem; background:${categoryColor}; color:#fff; padding:4px 12px; border-radius:16px; font-weight:700;">
                                        ${category}
                                    </span>
                                </h3>
                                <small style="color:#666; font-size:0.92rem;">Source: India Meteorological Department (IMD) Cyclone Warning Division</small>
                            </div>
                        </div>

                        <div style="text-align:right;">
                            <div style="font-size:0.86rem; color:#666;">Official IMD Observation Time:</div>
                            <strong style="color:#2c3e50; font-size:1.05rem;">${obsTimestamp}</strong>
                        </div>
                    </div>

                    <!-- Metrics Grid -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.2rem;">
                        <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:10px; padding:1.2rem;">
                            <div style="font-size:0.84rem; color:#777; text-transform:uppercase; font-weight:700;">Current Storm Eye Position</div>
                            <div style="font-size:1.35rem; font-weight:800; color:#1565c0; margin-top:4px;">
                                ${pos.lat ? pos.lat.toFixed(2) : '--'}° N, ${pos.lon ? pos.lon.toFixed(2) : '--'}° E
                            </div>
                            <small style="color:#666; font-size:0.86rem;">North Indian Ocean Basin</small>
                        </div>

                        <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:10px; padding:1.2rem;">
                            <div style="font-size:0.84rem; color:#777; text-transform:uppercase; font-weight:700;">Max Sustained Wind (MSW)</div>
                            <div style="font-size:1.35rem; font-weight:800; color:#e65100; margin-top:4px;">
                                ${windKmph} km/h <span style="font-size:0.95rem; font-weight:600; color:#666;">(${windKt} kt)</span>
                            </div>
                            <small style="color:#666; font-size:0.86rem;">${windRange ? 'Range: ' + windRange + ' km/h' : 'IMD Mean Sustained Velocity'}</small>
                        </div>

                        <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:10px; padding:1.2rem;">
                            <div style="font-size:0.84rem; color:#777; text-transform:uppercase; font-weight:700;">GIS Trajectory Tracking</div>
                            <div style="font-size:1.35rem; font-weight:800; color:#2e7d32; margin-top:4px;">
                                ${(data.observed_track || []).length} Observed &bull; ${(data.forecast_track || []).length} Forecast
                            </div>
                            <small style="color:#666; font-size:0.86rem;">Cone of Uncertainty: ${data.cone_of_uncertainty && data.cone_of_uncertainty.has_cone ? 'Active' : 'Standby'}</small>
                        </div>

                        <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:10px; padding:1.2rem;">
                            <div style="font-size:0.84rem; color:#777; text-transform:uppercase; font-weight:700;">Gale Warning Thresholds</div>
                            <div style="font-size:1.35rem; font-weight:800; color:#b71c1c; margin-top:4px;">
                                ${data.has_wind_warnings ? 'Warning Polygons Active' : 'Advisory Active'}
                            </div>
                            <small style="color:#666; font-size:0.86rem;">27 / 34 / 50 / 64 kt Gale Zones</small>
                        </div>
                    </div>
                </div>
            `;
        } else if (!isLiveConnected) {
            container.innerHTML = `
                <div style="background:#e3f2fd; border:2px solid #90caf9; border-radius:14px; padding:1.6rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1.2rem;">
                    <div style="display:flex; align-items:center; gap:1.2rem;">
                        <span style="font-size:2.8rem; color:#1565c0;"><i class="fas fa-user-shield"></i></span>
                        <div>
                            <div style="font-size:1.25rem; font-weight:800; color:#0d47a1; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                                IMD Live Data — Awaiting Account Verification
                                <span style="font-size:0.8rem; background:#1565c0; color:#fff; padding:3px 10px; border-radius:12px;">READY FOR ACTIVATION</span>
                            </div>
                            <p style="margin:0.3rem 0 0 0; color:#1565c0; font-size:0.94rem; max-width:850px; line-height:1.5;">
                                Your IMD API authentication service is operational. Once IMD approves and activates your account credentials, real-time cyclone trajectories, gale warning polygons, and cone of uncertainty will automatically populate without modifying code.
                            </p>
                        </div>
                    </div>

                    <div style="text-align:right;">
                        <span style="font-size:0.84rem; color:#555;">Server Check Time:</span>
                        <div style="font-weight:700; color:#2c3e50; font-size:0.96rem;">${serverTime}</div>
                        <span style="font-size:0.82rem; color:#1565c0; font-weight:700;"><i class="fas fa-check-circle"></i> Adapter Ready</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="background:#f1f8e9; border:2px solid #81c784; border-radius:14px; padding:1.6rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1.2rem;">
                    <div style="display:flex; align-items:center; gap:1.2rem;">
                        <span style="font-size:2.8rem; color:#2e7d32;"><i class="fas fa-shield-alt"></i></span>
                        <div>
                            <div style="font-size:1.25rem; font-weight:800; color:#1b5e20; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                                No Active Tropical Cyclone Currently Reported by IMD
                                <span style="font-size:0.8rem; background:#2e7d32; color:#fff; padding:3px 10px; border-radius:12px;">NORMAL STATUS</span>
                            </div>
                            <p style="margin:0.3rem 0 0 0; color:#33691e; font-size:0.94rem; max-width:850px; line-height:1.5;">
                                No active tropical cyclone or deep depression is currently detected by IMD across the Bay of Bengal or Arabian Sea.
                                Live GIS radar and atmospheric monitoring remain active. Official links below provide live feeds from IMD and ISRO MOSDAC.
                            </p>
                        </div>
                    </div>

                    <div style="text-align:right;">
                        <span style="font-size:0.84rem; color:#555;">Official IMD Check:</span>
                        <div style="font-weight:700; color:#2c3e50; font-size:0.96rem;">${serverTime}</div>
                        <span style="font-size:0.82rem; color:#2e7d32; font-weight:700;"><i class="fas fa-check-circle"></i> Monitoring Active</span>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Update Leaflet Map Layers with official IMD and MOSDAC data
     */
    function updateLeafletMapLayers(data) {
        if (!cycloneMap || !isMapInitialized) return;

        // Clear all dynamic overlays
        mapLayers.currentEye.clearLayers();
        mapLayers.observedTrack.clearLayers();
        mapLayers.forecastTrack.clearLayers();
        mapLayers.coneOfUncertainty.clearLayers();
        mapLayers.wind27kt.clearLayers();
        mapLayers.wind34kt.clearLayers();
        mapLayers.wind50kt.clearLayers();
        mapLayers.wind64kt.clearLayers();
        mapLayers.satelliteOverlay.clearLayers();

        let activeCount = 2; // Basemap + Guntur Reference City Marker

        const hasActive = data && data.has_active_cyclone;
        const cycloneName = (data && data.cyclone_name) || 'Cyclone';
        const observedPoints = (data && data.observed_track) || [];
        const forecastPoints = (data && data.forecast_track) || [];
        const bounds = [];

        // 1. Current Cyclone Eye Marker
        if (hasActive && data.current_position) {
            const pos = data.current_position;
            if (pos.lat && pos.lon) {
                const eyeLatLon = [pos.lat, pos.lon];
                bounds.push(eyeLatLon);

                const eyeIcon = L.divIcon({
                    className: 'cyclone-eye-animated-marker',
                    html: `
                        <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
                            <div style="position:absolute; width:100%; height:100%; border-radius:50%; background:rgba(211,47,47,0.35); animation:cyclonePulse 1.8s infinite ease-out;"></div>
                            <div style="width:24px; height:24px; border-radius:50%; background:#d32f2f; border:3px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:bold;">
                                🌀
                            </div>
                        </div>
                    `,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });

                const eyeMarker = L.marker(eyeLatLon, { icon: eyeIcon });
                const mswKmph = (data.intensity && data.intensity.mean_msw_kmph) || pos.mean_msw_kmph || '--';
                const mswKt = (data.intensity && data.intensity.msw_kt) || pos.msw_kt || '--';

                eyeMarker.bindPopup(`
                    <div style="font-family:sans-serif; min-width:200px; color:#2c3e50;">
                        <div style="background:#d32f2f; color:#fff; padding:6px 10px; border-radius:6px 6px 0 0; font-weight:bold; font-size:14px; margin:-9px -9px 8px -9px;">
                            🌀 ${cycloneName} (Current Center)
                        </div>
                        <table style="width:100%; font-size:12px; border-collapse:collapse;">
                            <tr><td style="padding:2px 0; color:#666;">Category:</td><td style="font-weight:bold; text-align:right;">${pos.category || 'Cyclonic Storm'}</td></tr>
                            <tr><td style="padding:2px 0; color:#666;">Max Sustained Wind:</td><td style="font-weight:bold; color:#e65100; text-align:right;">${mswKmph} km/h (${mswKt} kt)</td></tr>
                            <tr><td style="padding:2px 0; color:#666;">Coordinates:</td><td style="font-weight:bold; text-align:right;">${pos.lat.toFixed(2)}° N, ${pos.lon.toFixed(2)}° E</td></tr>
                            <tr><td style="padding:2px 0; color:#666;">Observation Time:</td><td style="font-weight:bold; text-align:right;">${pos.datetime || 'Recent'}</td></tr>
                            <tr><td style="padding:2px 0; color:#666;">Source:</td><td style="font-weight:bold; color:#1565c0; text-align:right;">India Meteorological Dept (IMD)</td></tr>
                        </table>
                    </div>
                `).openPopup();

                mapLayers.currentEye.addLayer(eyeMarker);
                activeCount++;
            }
        }

        // 2. Observed Track (Solid Line + Waypoint Markers)
        if (hasActive && observedPoints.length > 0) {
            const obsLatLons = [];
            observedPoints.forEach((pt, idx) => {
                if (pt.lat && pt.lon) {
                    const latlon = [pt.lat, pt.lon];
                    obsLatLons.push(latlon);
                    bounds.push(latlon);

                    const obsMarker = L.circleMarker(latlon, {
                        radius: 6,
                        fillColor: '#d32f2f',
                        color: '#ffffff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.95
                    });

                    obsMarker.bindPopup(`
                        <div style="font-family:sans-serif; font-size:12px; color:#2c3e50;">
                            <strong style="color:#d32f2f;">● Observed Position #${idx + 1}</strong>
                            <div style="margin-top:4px;"><b>Time:</b> ${pt.datetime || '--'}</div>
                            <div><b>Location:</b> ${pt.lat.toFixed(2)}° N, ${pt.lon.toFixed(2)}° E</div>
                            <div><b>Wind:</b> ${pt.mean_msw_kmph || '--'} km/h (${pt.msw_kt || '--'} kt)</div>
                            <div><b>Category:</b> ${pt.category || 'CYCLONE'}</div>
                            <div style="font-size:10px; color:#666; margin-top:2px;">Source: IMD Observed Feed</div>
                        </div>
                    `);
                    mapLayers.observedTrack.addLayer(obsMarker);
                }
            });

            if (obsLatLons.length > 1) {
                const obsPolyline = L.polyline(obsLatLons, {
                    color: '#d32f2f',
                    weight: 4,
                    opacity: 0.9,
                    lineJoin: 'round'
                });
                mapLayers.observedTrack.addLayer(obsPolyline);
            }
            activeCount++;
        }

        // 3. Forecast Track (Dashed Line + Distinct Markers)
        if (hasActive && forecastPoints.length > 0) {
            const fcLatLons = [];
            forecastPoints.forEach((pt, idx) => {
                if (pt.lat && pt.lon) {
                    const latlon = [pt.lat, pt.lon];
                    fcLatLons.push(latlon);
                    bounds.push(latlon);

                    const fcMarker = L.circleMarker(latlon, {
                        radius: 5,
                        fillColor: '#ffffff',
                        color: '#e65100',
                        weight: 2.5,
                        opacity: 1,
                        fillOpacity: 1
                    });

                    fcMarker.bindPopup(`
                        <div style="font-family:sans-serif; font-size:12px; color:#2c3e50;">
                            <strong style="color:#e65100;">— IMD Forecast Position #${idx + 1}</strong>
                            <div style="margin-top:4px;"><b>Projected Time:</b> ${pt.datetime || '--'}</div>
                            <div><b>Location:</b> ${pt.lat.toFixed(2)}° N, ${pt.lon.toFixed(2)}° E</div>
                            <div><b>Forecast Wind:</b> ${pt.mean_msw_kmph || '--'} km/h (${pt.msw_kt || '--'} kt)</div>
                            <div><b>Category:</b> ${pt.category || 'FORECAST'}</div>
                            <div style="font-size:10px; color:#e65100; font-weight:bold; margin-top:3px;">IMD Forecast Track &bull; Subject to Atmospheric Evolution</div>
                        </div>
                    `);
                    mapLayers.forecastTrack.addLayer(fcMarker);
                }
            });

            if (fcLatLons.length > 1) {
                const fcPolyline = L.polyline(fcLatLons, {
                    color: '#e65100',
                    weight: 3,
                    opacity: 0.85,
                    dashArray: '6, 6',
                    lineJoin: 'round'
                });
                mapLayers.forecastTrack.addLayer(fcPolyline);
            }
            activeCount++;
        }

        // 4. Cone of Uncertainty (COU) Polygon
        const cou = data && data.cone_of_uncertainty;
        if (hasActive && cou && cou.has_cone && cou.coordinates) {
            try {
                const couGeoJSON = {
                    type: cou.type || 'MultiPolygon',
                    coordinates: cou.coordinates
                };
                const couLayer = L.geoJSON(couGeoJSON, {
                    style: {
                        color: '#e65100',
                        weight: 2,
                        dashArray: '4, 6',
                        fillColor: '#ff9800',
                        fillOpacity: 0.22
                    },
                    onEachFeature: function (feature, layer) {
                        layer.bindPopup(`
                            <div style="font-family:sans-serif; font-size:12px; color:#2c3e50;">
                                <strong style="color:#e65100;"><i class="fas fa-draw-polygon"></i> IMD Cone of Uncertainty</strong>
                                <p style="margin:4px 0 0 0; font-size:11px; color:#555;">
                                    Represents the probable path of the cyclone center (60%–90% confidence envelope). The storm impacts can extend beyond the cone boundaries.
                                </p>
                                <div style="font-size:10px; color:#666; margin-top:4px;">Source: IMD Cone of Uncertainty API</div>
                            </div>
                        `);
                    }
                });
                mapLayers.coneOfUncertainty.addLayer(couLayer);
                activeCount++;
            } catch (couErr) {
                console.warn('Failed to parse COU GeoJSON:', couErr);
            }
        }

        // 5. Wind Warning MultiPolygons (27kt, 34kt, 50kt, 64kt)
        const windZones = (data && data.wind_warnings) || {};
        const windThresholds = [
            { key: '27kt', layer: mapLayers.wind27kt, color: '#fbc02d', fillColor: '#ffeb3b', opacity: 0.25, name: '27 kt (50 km/h) Gale Warning' },
            { key: '34kt', layer: mapLayers.wind34kt, color: '#f57c00', fillColor: '#ff9800', opacity: 0.30, name: '34 kt (62 km/h) Strong Gale' },
            { key: '50kt', layer: mapLayers.wind50kt, color: '#d32f2f', fillColor: '#f44336', opacity: 0.35, name: '50 kt (92 km/h) Storm Force' },
            { key: '64kt', layer: mapLayers.wind64kt, color: '#7b1fa2', fillColor: '#9c27b0', opacity: 0.40, name: '64 kt (118+ km/h) Hurricane Force' },
        ];

        windThresholds.forEach(thresh => {
            const zone = windZones[thresh.key];
            if (hasActive && zone && zone.available && zone.coordinates) {
                try {
                    const zoneGeoJSON = {
                        type: zone.type || 'MultiPolygon',
                        coordinates: zone.coordinates
                    };
                    const zoneLayer = L.geoJSON(zoneGeoJSON, {
                        style: {
                            color: thresh.color,
                            weight: 2,
                            fillColor: thresh.fillColor,
                            fillOpacity: thresh.opacity
                        },
                        onEachFeature: function (feature, layer) {
                            layer.bindPopup(`
                                <div style="font-family:sans-serif; font-size:12px; color:#2c3e50;">
                                    <strong style="color:${thresh.color};"><i class="fas fa-wind"></i> IMD ${thresh.name}</strong>
                                    <p style="margin:4px 0 0 0; font-size:11px; color:#555;">Official gale wind velocity threshold boundary.</p>
                                    <div style="font-size:10px; color:#666; margin-top:4px;">Source: IMD Cyclone Wind Warning API</div>
                                </div>
                            `);
                        }
                    });
                    thresh.layer.addLayer(zoneLayer);
                    activeCount++;
                } catch (wErr) {
                    console.warn(`Failed to render wind zone ${thresh.key}:`, wErr);
                }
            }
        });

        // 6. MOSDAC Satellite Overlay
        const satInfo = data && data.satellite_info;
        if (satInfo && satInfo.available && satInfo.imageUrl) {
            try {
                // INSAT Coverage Bounds across Indian subcontinent and Bay of Bengal
                const satBounds = [[0.0, 55.0], [38.0, 105.0]];
                const satImgLayer = L.imageOverlay(satInfo.imageUrl, satBounds, {
                    opacity: 0.65,
                    attribution: '&copy; ISRO / MOSDAC INSAT-3DR Imager'
                });
                mapLayers.satelliteOverlay.addLayer(satImgLayer);
                activeCount++;
            } catch (satErr) {
                console.warn('Satellite overlay notice:', satErr);
            }
        }

        // 7. Municipal Admin Cyclone Risk Zones & Markings
        if (mapLayers.municipalMarkings) {
            mapLayers.municipalMarkings.clearLayers();
            fetch('/api/markings?disaster=cyclones')
                .then(r => r.json())
                .then(mRes => {
                    if (mRes.status === 'success' && Array.isArray(mRes.markings) && mRes.markings.length > 0) {
                        const hexMap = { safe: '#16a34a', moderate: '#d97706', danger: '#dc2626', severe: '#7c3aed', green: '#16a34a', yellow: '#d97706', red: '#dc2626', purple: '#7c3aed' };
                        mRes.markings.forEach(m => {
                            const hex = hexMap[m.color] || hexMap[m.risk_level] || '#ea580c';
                            const geo = m.geojson_data;
                            let mLayer = null;

                            if (m.shape_type === 'circle' && geo.center && geo.radius) {
                                mLayer = L.circle(geo.center, { radius: geo.radius, color: hex, fillColor: hex, fillOpacity: 0.45, weight: 3 });
                            } else if (m.shape_type === 'marker' && geo) {
                                const latlng = geo.center || (geo.coordinates ? [geo.coordinates[1], geo.coordinates[0]] : null);
                                if (latlng) {
                                    mLayer = L.marker(latlng, {
                                        icon: L.divIcon({
                                            className: 'cyclone-muni-icon',
                                            html: `<div style="width:34px;height:34px;background:#fff;border:3px solid ${hex};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 3px 10px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">🌀</div>`,
                                            iconSize: [34, 34],
                                            iconAnchor: [17, 17]
                                        })
                                    });
                                }
                            } else if (geo && (geo.type || geo.coordinates)) {
                                mLayer = L.geoJSON(geo, { style: { color: hex, fillColor: hex, fillOpacity: 0.45, weight: 3 } });
                            }

                            if (mLayer) {
                                mLayer.bindPopup(`
                                    <div style="font-family:sans-serif; min-width:180px; color:#1e293b;">
                                        <div style="font-weight:bold; font-size:13px; color:#e65100;">🌀 ${m.title}</div>
                                        <div style="background:${hex}; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; display:inline-block; margin:5px 0;">
                                            ${(m.risk_level || 'warning').toUpperCase()} &bull; Municipal Cyclone Zone
                                        </div>
                                        ${m.description ? `<div style="font-size:12px; color:#334155; margin-bottom:4px;">${m.description}</div>` : ''}
                                        <div style="font-size:10px; color:#64748b;">Set by Municipal Emergency Ops</div>
                                    </div>
                                `);
                                mapLayers.municipalMarkings.addLayer(mLayer);
                            }
                        });
                        activeCount++;
                        if (layerBadge) layerBadge.innerHTML = `<i class="fas fa-layer-group"></i> ${activeCount} GIS Layers Active`;
                    }
                })
                .catch(e => console.warn('Could not load municipal cyclone markings:', e));
        }

        // Update Dynamic Active Layer Counter Badge
        const layerBadge = document.getElementById('cyclone-active-layers-badge');
        if (layerBadge) {
            layerBadge.innerHTML = `<i class="fas fa-layer-group"></i> ${activeCount} GIS Layers Active`;
        }

        // Fit map view to cyclone bounds if active points exist
        if (hasActive && bounds.length > 0) {
            bounds.push(GUNTUR_COORDS);
            cycloneMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 });
        }
    }

    /**
     * Render Suraksha Kavach Guntur Local Risk Analysis Panel
     */
    function renderGunturRiskPanel(data) {
        const panel = document.getElementById('cyclone-guntur-risk-panel');
        if (!panel) return;

        const risk = (data && data.guntur_risk_analysis) || {};
        const threatLevel = risk.threat_level || 'LOW';
        const threatBadge = risk.threat_badge || '🟢 Normal / Routine Watch';
        const distKm = risk.distance_to_eye_km;
        const closestKm = risk.closest_approach_km;
        const direction = risk.direction || 'East';
        const advisory = risk.advisory || 'Routine coastal monitoring is maintained in coordination with IMD and APSDMA.';
        const mandalReadiness = risk.mandal_readiness || {};

        let borderColor = '#81c784';
        let bgColor = '#f9fbe7';
        if (threatLevel === 'SEVERE') { borderColor = '#d32f2f'; bgColor = '#ffebee'; }
        else if (threatLevel === 'HIGH') { borderColor = '#f57c00'; bgColor = '#fff3e0'; }
        else if (threatLevel === 'MODERATE') { borderColor = '#fbc02d'; bgColor = '#fffde7'; }

        panel.innerHTML = `
            <div style="background:${bgColor}; border:2px solid ${borderColor}; border-radius:14px; padding:1.6rem; box-shadow:0 4px 16px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; border-bottom:1px solid rgba(0,0,0,0.08); padding-bottom:1rem;">
                    <div>
                        <div style="font-size:1.25rem; font-weight:800; color:#2c3e50; display:flex; align-items:center; gap:0.6rem;">
                            <i class="fas fa-calculator text-orange"></i> SURAKSHA KAVACH LOCAL RISK ANALYSIS — GUNTUR REGION
                        </div>
                        <small style="color:#666; font-size:0.86rem;">
                            Proximity & coastal threat calculations derived from official IMD feeds &bull; Municipal Emergency Response Unit
                        </small>
                    </div>
                    <span style="font-size:0.92rem; font-weight:800; padding:6px 16px; border-radius:20px; background:#ffffff; border:2px solid ${borderColor}; color:#2c3e50;">
                        ${threatBadge}
                    </span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1.2rem;">
                    <div style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #e0e0e0;">
                        <div style="font-size:0.8rem; color:#777; text-transform:uppercase; font-weight:700;">Distance to Storm Center</div>
                        <div style="font-size:1.3rem; font-weight:800; color:#1565c0; margin-top:3px;">
                            ${distKm !== null ? distKm + ' km ' + direction : 'No Active Storm'}
                        </div>
                        <small style="color:#666; font-size:0.82rem;">From Guntur City Center</small>
                    </div>

                    <div style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #e0e0e0;">
                        <div style="font-size:0.8rem; color:#777; text-transform:uppercase; font-weight:700;">Closest Forecast Approach</div>
                        <div style="font-size:1.3rem; font-weight:800; color:#e65100; margin-top:3px;">
                            ${closestKm !== null ? closestKm + ' km' : 'Normal Watch'}
                        </div>
                        <small style="color:#666; font-size:0.82rem;">Along IMD forecast path</small>
                    </div>

                    <div style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #e0e0e0;">
                        <div style="font-size:0.8rem; color:#777; text-transform:uppercase; font-weight:700;">Coastal Mandal Alert</div>
                        <div style="font-size:1.3rem; font-weight:800; color:#2e7d32; margin-top:3px;">
                            ${mandalReadiness.status || 'Normal Standby'}
                        </div>
                        <small style="color:#666; font-size:0.82rem;">Bapatla, Nizampatnam, Repalle</small>
                    </div>

                    <div style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #e0e0e0;">
                        <div style="font-size:0.8rem; color:#777; text-transform:uppercase; font-weight:700;">Shelter Pre-Positioning</div>
                        <div style="font-size:1.3rem; font-weight:800; color:#6a1b9a; margin-top:3px;">
                            ${mandalReadiness.shelter_status || 'Pre-positioned'}
                        </div>
                        <small style="color:#666; font-size:0.82rem;">NH-216 Cyclone Corridor</small>
                    </div>
                </div>

                <div style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #e0e0e0; font-size:0.92rem; color:#333; line-height:1.55;">
                    <strong style="color:#e65100;"><i class="fas fa-bullhorn"></i> Municipal Actionable Advisory:</strong>
                    <div style="margin-top:4px;">${advisory}</div>
                </div>
            </div>
        `;
    }

    /**
     * Render API Health & Source Status Table
     */
    function renderApiHealthTable(data) {
        const table = document.getElementById('cyclone-api-health-table');
        const serverBadge = document.getElementById('cyclone-server-time-badge');
        const obsBadge = document.getElementById('cyclone-obs-time-badge');
        if (!table) return;

        if (serverBadge && data && data.received_at) {
            serverBadge.innerHTML = `<i class="fas fa-server"></i> Server Sync: ${data.received_at}`;
        }
        if (obsBadge && data && data.observation_time) {
            obsBadge.innerHTML = `<i class="fas fa-satellite"></i> IMD Obs: ${data.observation_time}`;
        }

        const sources = (data && data.sources) || {};
        const trackStatus = sources.imd_track && sources.imd_track.status;
        const windStatus = sources.imd_wind && sources.imd_wind.status;
        const couStatus = sources.imd_cou && sources.imd_cou.status;
        const satStatus = sources.mosdac_satellite && sources.mosdac_satellite.status;

        function badgeHtml(status) {
            if (status === 'LIVE' || status === 'CONNECTED') {
                return '<span style="color:#2e7d32; font-weight:800;">● CONNECTED / LIVE</span>';
            }
            if (status === 'AWAITING_VERIFICATION') {
                return '<span style="color:#1565c0; font-weight:800;">● AWAITING VERIFICATION</span>';
            }
            if (status === 'AWAITING_CONFIG' || status === 'AWAITING_FEED') {
                return '<span style="color:#f57c00; font-weight:800;">● AWAITING VERIFIED FEED</span>';
            }
            return '<span style="color:#666; font-weight:800;">● CHECKED / STANDBY</span>';
        }

        table.innerHTML = `
            <div style="background:#fff; border:1px solid #eee; border-radius:8px; padding:0.8rem 1rem;">
                <div style="font-size:0.82rem; color:#777;">1. IMD Cyclone Track API</div>
                <div style="margin-top:2px;">${badgeHtml(trackStatus)}</div>
                <small style="font-size:0.78rem; color:#666;">Observed & Forecast Track Feeds</small>
            </div>
            <div style="background:#fff; border:1px solid #eee; border-radius:8px; padding:0.8rem 1rem;">
                <div style="font-size:0.82rem; color:#777;">2. IMD Wind Warning API</div>
                <div style="margin-top:2px;">${badgeHtml(windStatus)}</div>
                <small style="font-size:0.78rem; color:#666;">27 / 34 / 50 / 64 kt Gale Polygons</small>
            </div>
            <div style="background:#fff; border:1px solid #eee; border-radius:8px; padding:0.8rem 1rem;">
                <div style="font-size:0.82rem; color:#777;">3. IMD Cone of Uncertainty</div>
                <div style="margin-top:2px;">${badgeHtml(couStatus)}</div>
                <small style="font-size:0.78rem; color:#666;">Confidence Envelope Geometry</small>
            </div>
            <div style="background:#fff; border:1px solid #eee; border-radius:8px; padding:0.8rem 1rem;">
                <div style="font-size:0.82rem; color:#777;">4. ISRO MOSDAC Satellite</div>
                <div style="margin-top:2px;">${badgeHtml(satStatus)}</div>
                <small style="font-size:0.78rem; color:#666;">INSAT-3DR / 3DS Imager Channels</small>
            </div>
        `;
    }

    /**
     * Render Error State
     */
    function renderErrorState(err) {
        const container = document.getElementById('cyclone-info-card-container');
        if (container) {
            container.innerHTML = `
                <div style="background:#fff3e0; border:2px solid #ff9800; border-radius:14px; padding:1.4rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <span style="font-size:2rem; color:#e65100;"><i class="fas fa-exclamation-triangle"></i></span>
                        <div>
                            <strong style="color:#e65100; font-size:1.1rem;">Meteorological Data Network Notice</strong>
                            <p style="margin:0.2rem 0 0 0; color:#666; font-size:0.92rem;">
                                Official data connection is refreshing. Direct access to official portals remains available below.
                            </p>
                        </div>
                    </div>
                    <button onclick="window.renderCyclonePreparedness()" style="background:#e65100; color:#fff; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:700;">
                        Retry Now
                    </button>
                </div>
            `;
        }
    }

    /**
     * Auto-Refresh Timer Countdown
     */
    function startAutoRefreshTimer() {
        if (refreshTimerInterval) clearInterval(refreshTimerInterval);

        refreshTimerInterval = setInterval(() => {
            secondsUntilRefresh--;
            const mins = Math.floor(secondsUntilRefresh / 60);
            const secs = secondsUntilRefresh % 60;
            const timerEl = document.getElementById('refresh-countdown');
            if (timerEl) {
                timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }

            if (secondsUntilRefresh <= 0) {
                secondsUntilRefresh = AUTO_REFRESH_SECONDS;
                loadCycloneData();
            }
        }, 1000);
    }

    // Add pulsing CSS animation keyframes
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        @keyframes cyclonePulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.6); opacity: 0.1; }
            100% { transform: scale(0.95); opacity: 0.8; }
        }
    `;
    document.head.appendChild(styleEl);

})();

/**
 * Suraksha Kavach — Universal Location Risk Search & Multi-Hazard Assessment Widget
 * =================================================================================
 * Enables users to search ANY location worldwide / regionally, click on the map,
 * or drag the pin to instantly retrieve real-time:
 *   - Exact Disaster Risk Percentage (0% - 100%) with animated circular gauge
 *   - Hazard Rate Metrics (e.g., MSW wind km/h, flood inundation cm/hr, PGA %g, run-up m)
 *   - Environmental & Terrain Status (Elevation, Coastal proximity, Live Weather)
 *   - Actionable Step-by-Step Citizen Protection Measures
 *   - Emergency Helplines & Nearest Designated Shelters
 *   - Multi-Hazard Comparison Breakdown across all 7 disaster types
 *
 * Mounts automatically to elements with class `.location-risk-search-widget` or via
 * `window.initLocationRiskWidget(containerEl, options)`.
 */

(function () {
    if (typeof window === 'undefined') return;

    const DEFAULT_COORDS = { lat: 16.3067, lon: 80.4365, name: 'Guntur City Center, Andhra Pradesh' };
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
    const geocodeCache = new Map();

    const DISASTER_THEMES = {
        'cyclone': { icon: '🌀', name: 'Cyclone & Storm Surge', color: '#e65100', defaultPreset: '🌊 Bapatla Coast' },
        'floods': { icon: '🌧️', name: 'Floods & Urban Inundation', color: '#1565c0', defaultPreset: '🏙️ Vijayawada Krishna Basin' },
        'rainfall': { icon: '🌧️', name: 'Heavy Rainfall & Cloudbursts', color: '#0288d1', defaultPreset: '📍 Guntur City' },
        'winds': { icon: '💨', name: 'Severe Winds & Gale Squalls', color: '#00897b', defaultPreset: '⚓ Nizampatnam Port' },
        'landslides': { icon: '⛰️', name: 'Landslides & Slope Failures', color: '#6d4c41', defaultPreset: '⛰️ Mangalagiri Hills' },
        'earthquakes': { icon: '🏚️', name: 'Earthquakes & Seismic Safety', color: '#7b1fa2', defaultPreset: '📍 Guntur City' },
        'tsunami': { icon: '🌊', name: 'Tsunami & Coastal Waves', color: '#0097a7', defaultPreset: '🌊 Bapatla Coast' },
        'all': { icon: '🚨', name: 'Multi-Hazard Disaster Risk', color: '#d32f2f', defaultPreset: '📍 Guntur City' }
    };

    const PRESETS = [
        { label: '📍 Guntur City', lat: 16.3067, lon: 80.4365, name: 'Guntur Municipal Area, Andhra Pradesh' },
        { label: '🌊 Bapatla Coast', lat: 15.9042, lon: 80.4674, name: 'Bapatla Coastal Region, Andhra Pradesh' },
        { label: '🏙️ Vijayawada Krishna Basin', lat: 16.5062, lon: 80.6480, name: 'Vijayawada Krishna River Basin, AP' },
        { label: '⛰️ Mangalagiri Hills', lat: 16.4300, lon: 80.5600, name: 'Mangalagiri Hill Slopes, Guntur Dist' },
        { label: '⚓ Nizampatnam Port', lat: 15.9000, lon: 80.6700, name: 'Nizampatnam Fishing Harbor & Estuary' },
        { label: '🏛️ Amaravati Capital', lat: 16.5131, lon: 80.5165, name: 'Amaravati Capital City Region, AP' }
    ];

    /**
     * Search geocoding via Nominatim
     */
    async function geocodeLocation(query) {
        const clean = query.trim();
        if (!clean) return [];

        // Direct coordinates parsing: "16.3067, 80.4365"
        const coordMatch = clean.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lon = parseFloat(coordMatch[2]);
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                return [{
                    display_name: `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                    lat: lat.toString(),
                    lon: lon.toString(),
                    type: 'coordinate'
                }];
            }
        }

        if (geocodeCache.has(clean.toLowerCase())) {
            return geocodeCache.get(clean.toLowerCase());
        }

        try {
            const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(clean)}&addressdetails=1&limit=6`;
            const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            if (!resp.ok) throw new Error('Search request failed');
            const data = await resp.json();
            geocodeCache.set(clean.toLowerCase(), data);
            return data;
        } catch (e) {
            console.warn('Geocoding error:', e);
            return [];
        }
    }

    /**
     * Fetch risk evaluation payload from backend API
     */
    async function fetchRiskAssessment(lat, lon, disasterType, locationName) {
        try {
            const url = `/api/risk-assessment?lat=${lat}&lon=${lon}&disaster=${encodeURIComponent(disasterType)}&location=${encodeURIComponent(locationName || '')}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Risk assessment API failed');
            return await resp.json();
        } catch (e) {
            console.error('Failed to fetch risk assessment:', e);
            return null;
        }
    }

    /**
     * Create and initialize widget instance
     */
    function createWidgetInstance(container, options = {}) {
        const disasterType = options.disaster || container.dataset.disaster || 'all';
        const theme = DISASTER_THEMES[disasterType] || DISASTER_THEMES['all'];

        let currentLat = options.initialLat || DEFAULT_COORDS.lat;
        let currentLon = options.initialLon || DEFAULT_COORDS.lon;
        let currentLocationName = options.initialName || DEFAULT_COORDS.name;

        let map = null;
        let marker = null;
        let circle = null;
        let debounceTimer = null;

        container.innerHTML = `
            <div class="location-risk-widget" id="lr-widget-${Math.random().toString(36).substr(2, 6)}">
                <!-- Header -->
                <div class="lr-header">
                    <div class="lr-title-group">
                        <h3>
                            <span>${theme.icon}</span> Live Location Risk & Hazard Assessment Engine
                        </h3>
                        <p>Search any city, mandal, coastal area, or coordinates to calculate exact risk percentage, rate metrics, and safety directives.</p>
                    </div>
                    <span class="lr-badge-pill">
                        <i class="fas fa-crosshairs"></i> ${theme.name}
                    </span>
                </div>

                <!-- Search Input & Quick Pills -->
                <div class="lr-search-section">
                    <div class="lr-search-input-wrap">
                        <i class="fas fa-search lr-search-icon"></i>
                        <input type="text" class="lr-search-input" placeholder="🔍 Search any location, city, mandal, village, or 'lat, lng'..." autocomplete="off">
                        <button type="button" class="lr-gps-btn" title="Use current GPS location">
                            <i class="fas fa-location-arrow"></i> My GPS
                        </button>
                        <div class="lr-search-results-dropdown" style="display:none;"></div>
                    </div>

                    <div class="lr-quick-pills">
                        <span class="lr-pill-label">⚡ Quick Locations:</span>
                        ${PRESETS.map(p => `
                            <button type="button" class="lr-pill-btn" data-lat="${p.lat}" data-lon="${p.lon}" data-name="${p.name}">
                                ${p.label}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- 2-Column Body Grid -->
                <div class="lr-body-grid">
                    <!-- Left: Risk Gauge & Rate Metrics -->
                    <div class="lr-gauge-card">
                        <div>
                            <div class="lr-location-title-wrap">
                                <div class="lr-loc-name" id="lr-loc-name-display">
                                    <i class="fas fa-map-marker-alt" style="color:${theme.color};"></i>
                                    <span>${currentLocationName.split(',')[0]}</span>
                                </div>
                                <div class="lr-loc-coords" id="lr-loc-coords-display">
                                    📍 ${currentLat.toFixed(4)}°N, ${currentLon.toFixed(4)}°E &bull; Loading location terrain...
                                </div>
                            </div>

                            <!-- Circular Progress Gauge -->
                            <div class="lr-gauge-center">
                                <div class="lr-svg-gauge-wrap">
                                    <svg class="lr-svg-gauge" viewBox="0 0 140 140">
                                        <circle class="lr-gauge-bg-circle" cx="70" cy="70" r="60"></circle>
                                        <circle class="lr-gauge-fill-circle" id="lr-gauge-circle" cx="70" cy="70" r="60"></circle>
                                    </svg>
                                    <div class="lr-gauge-text">
                                        <div class="lr-gauge-num" id="lr-gauge-pct-num">0%</div>
                                        <div class="lr-gauge-sub">RISK RATE</div>
                                    </div>
                                </div>

                                <div style="text-align:center;">
                                    <div class="lr-tier-badge" id="lr-tier-badge-display">CALCULATING...</div>
                                    <div style="font-size:0.84rem; color:#64748b; margin-top:8px;" id="lr-weather-snippet">
                                        🌤️ Connecting to live meteorological feeds...
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Rate Metrics Grid -->
                        <div class="lr-rates-grid" id="lr-rates-grid-container">
                            <div class="lr-rate-box">
                                <div class="lr-rate-label" id="lr-rate1-label">Primary Hazard Rate</div>
                                <div class="lr-rate-val" id="lr-rate1-val">--</div>
                                <div class="lr-rate-sub" id="lr-rate1-sub">Calculating...</div>
                            </div>
                            <div class="lr-rate-box">
                                <div class="lr-rate-label" id="lr-rate2-label">Secondary Exposure</div>
                                <div class="lr-rate-val" id="lr-rate2-val">--</div>
                                <div class="lr-rate-sub" id="lr-rate2-sub">Assessing...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: Interactive Leaflet Map with Draggable Marker -->
                    <div class="lr-map-card">
                        <div class="lr-interactive-map" id="lr-map-${Math.random().toString(36).substr(2, 6)}"></div>
                        <div class="lr-map-hint">
                            <i class="fas fa-hand-pointer"></i> Click anywhere on the map or drag the pin to analyze that exact spot!
                        </div>
                    </div>
                </div>

                <!-- Bottom Intelligence & Protective Action Section -->
                <div class="lr-details-section">
                    <!-- Key Indicators & Terrain -->
                    <div class="lr-info-card">
                        <div class="lr-info-card-title">
                            <i class="fas fa-microchip" style="color:${theme.color};"></i>
                            Key Hazard Indicators & Terrain
                        </div>
                        <div class="lr-indicators-list" id="lr-indicators-container">
                            <div style="color:#64748b; font-size:0.88rem;">Evaluating environmental factors...</div>
                        </div>
                    </div>

                    <!-- Vulnerability & Safety Directives -->
                    <div class="lr-info-card">
                        <div class="lr-info-card-title">
                            <i class="fas fa-shield-alt" style="color:#059669;"></i>
                            Protective Actions & Helplines
                        </div>
                        <ul class="lr-action-list" id="lr-actions-container">
                            <li>Loading emergency guidelines for this location...</li>
                        </ul>
                        <div class="lr-contacts-wrap" id="lr-contacts-container"></div>
                    </div>

                    <!-- Multi-Disaster Comparison Bar Chart -->
                    <div class="lr-breakdown-card">
                        <div class="lr-info-card-title">
                            <i class="fas fa-chart-bar" style="color:#d32f2f;"></i>
                            Multi-Hazard Risk Comparison for this Location (All 7 Disasters)
                        </div>
                        <div class="lr-bars-grid" id="lr-bars-grid-container"></div>
                    </div>
                </div>
            </div>
        `;

        const mapEl = container.querySelector('.lr-interactive-map');
        const searchInput = container.querySelector('.lr-search-input');
        const searchDropdown = container.querySelector('.lr-search-results-dropdown');
        const gpsBtn = container.querySelector('.lr-gps-btn');
        const pillBtns = container.querySelectorAll('.lr-pill-btn');

        // Initialize Map
        if (typeof L !== 'undefined' && mapEl) {
            map = L.map(mapEl, {
                center: [currentLat, currentLon],
                zoom: 12,
                zoomControl: true,
                attributionControl: false
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
            }).addTo(map);

            const customIcon = L.divIcon({
                className: 'lr-map-pin-icon',
                html: `
                    <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
                        <div style="position:absolute; width:34px; height:34px; border-radius:50%; background:${theme.color}; opacity:0.3; animation:pinPulse 2s infinite ease-out;"></div>
                        <div style="width:24px; height:24px; border-radius:50%; background:${theme.color}; border:3px solid #ffffff; box-shadow:0 3px 10px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:800;">
                            📍
                        </div>
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            marker = L.marker([currentLat, currentLon], {
                draggable: true,
                icon: customIcon
            }).addTo(map);

            circle = L.circle([currentLat, currentLon], {
                radius: 3500,
                color: theme.color,
                weight: 1.5,
                fillColor: theme.color,
                fillOpacity: 0.12
            }).addTo(map);

            // Drag marker event
            marker.on('dragend', function (e) {
                const pos = marker.getLatLng();
                circle.setLatLng(pos);
                updateLocation(pos.lat, pos.lng, `Location Pin (${pos.lat.toFixed(4)}°N, ${pos.lng.toFixed(4)}°E)`);
            });

            // Click on map event
            map.on('click', function (e) {
                marker.setLatLng(e.latlng);
                circle.setLatLng(e.latlng);
                updateLocation(e.latlng.lat, e.latlng.lng, `Location Pin (${e.latlng.lat.toFixed(4)}°N, ${e.latlng.lng.toFixed(4)}°E)`);
            });
        }

        /**
         * Update location & trigger fresh assessment
         */
        async function updateLocation(lat, lon, name) {
            currentLat = parseFloat(lat);
            currentLon = parseFloat(lon);
            currentLocationName = name || `${currentLat.toFixed(4)}°N, ${currentLon.toFixed(4)}°E`;

            if (map && marker && circle) {
                const latlng = L.latLng(currentLat, currentLon);
                marker.setLatLng(latlng);
                circle.setLatLng(latlng);
                map.flyTo(latlng, Math.max(map.getZoom(), 12), { animate: true, duration: 0.8 });
            }

            // Update UI Location Labels
            const nameEl = container.querySelector('#lr-loc-name-display span');
            const coordsEl = container.querySelector('#lr-loc-coords-display');
            if (nameEl) nameEl.innerText = currentLocationName.split(',')[0];
            if (coordsEl) coordsEl.innerHTML = `📍 ${currentLat.toFixed(4)}°N, ${currentLon.toFixed(4)}°E &bull; Fetching live assessment...`;

            // Animate Gauge to Loading State
            const gaugeCircle = container.querySelector('#lr-gauge-circle');
            const pctNum = container.querySelector('#lr-gauge-pct-num');
            const tierBadge = container.querySelector('#lr-tier-badge-display');
            if (tierBadge) {
                tierBadge.innerText = 'CALCULATING...';
                tierBadge.style.background = '#94a3b8';
            }

            // Fetch Real-Time Data from API
            const result = await fetchRiskAssessment(currentLat, currentLon, disasterType, currentLocationName);
            if (!result || !result.assessment) return;

            renderAssessmentResult(result);
        }

        /**
         * Render assessment payload to the UI
         */
        function renderAssessmentResult(data) {
            const ass = data.assessment;
            const loc = data.location;
            const weather = data.live_weather || {};

            // 1. Update Coordinates & Elevation
            const coordsEl = container.querySelector('#lr-loc-coords-display');
            if (coordsEl) {
                coordsEl.innerHTML = `📍 ${loc.lat}°N, ${loc.lon}°E &bull; Elevation: <strong>${loc.elevation_m}m MSL</strong> &bull; Coast: <strong>${loc.coastal_distance_km} km</strong>`;
            }

            // 2. Animate Circular Progress Gauge
            const gaugeCircle = container.querySelector('#lr-gauge-circle');
            const pctNum = container.querySelector('#lr-gauge-pct-num');
            const tierBadge = container.querySelector('#lr-tier-badge-display');
            const weatherSnippet = container.querySelector('#lr-weather-snippet');

            const pct = ass.risk_percentage || 0;
            const color = ass.risk_color || '#e65100';

            // SVG circumference for r=60 is ~377
            const offset = 377 - (pct / 100.0) * 377;
            if (gaugeCircle) {
                gaugeCircle.style.stroke = color;
                gaugeCircle.style.strokeDashoffset = offset;
            }

            if (circle) {
                circle.setStyle({ color: color, fillColor: color });
            }

            // Animate number count-up
            if (pctNum) {
                animateNumber(pctNum, pct);
            }

            if (tierBadge) {
                tierBadge.innerText = ass.risk_level || 'EVALUATED';
                tierBadge.style.background = color;
            }

            if (weatherSnippet && weather.temperature_c !== undefined) {
                weatherSnippet.innerHTML = `${weather.icon || '🌤️'} ${weather.temperature_c}°C, ${weather.condition || ''} &bull; Wind: <strong>${weather.wind_kph} km/h</strong> &bull; Humidity: <strong>${weather.humidity}%</strong>`;
            }

            // 3. Update Rate Metrics
            const r1Label = container.querySelector('#lr-rate1-label');
            const r1Val = container.querySelector('#lr-rate1-val');
            const r1Sub = container.querySelector('#lr-rate1-sub');

            const r2Label = container.querySelector('#lr-rate2-label');
            const r2Val = container.querySelector('#lr-rate2-val');
            const r2Sub = container.querySelector('#lr-rate2-sub');

            if (ass.rate_metric) {
                if (r1Label) r1Label.innerText = ass.rate_metric.label || 'Primary Hazard Rate';
                if (r1Val) r1Val.innerText = ass.rate_metric.value || '--';
                if (r1Sub) r1Sub.innerText = ass.rate_metric.trend || 'Monitored';
            }
            if (ass.secondary_rate) {
                if (r2Label) r2Label.innerText = ass.secondary_rate.label || 'Secondary Factor';
                if (r2Val) r2Val.innerText = ass.secondary_rate.value || '--';
                if (r2Sub) r2Sub.innerText = 'Exposure Rating';
            }

            // 4. Update Key Indicators
            const indicatorsContainer = container.querySelector('#lr-indicators-container');
            if (indicatorsContainer && ass.key_indicators) {
                indicatorsContainer.innerHTML = ass.key_indicators.map(ind => `
                    <div class="lr-indicator-item">
                        <div class="lr-ind-name">${ind.name}</div>
                        <div class="lr-ind-val">${ind.value}</div>
                        <div class="lr-ind-status">${ind.status || ''}</div>
                    </div>
                `).join('');
            }

            // 5. Update Actions & Helplines
            const actionsContainer = container.querySelector('#lr-actions-container');
            if (actionsContainer && ass.protective_actions) {
                actionsContainer.innerHTML = ass.protective_actions.map(act => `
                    <li>${act}</li>
                `).join('');
            }

            const contactsContainer = container.querySelector('#lr-contacts-container');
            if (contactsContainer && ass.emergency_contacts) {
                contactsContainer.innerHTML = ass.emergency_contacts.map(c => `
                    <div class="lr-contact-pill">
                        <span><strong>📞 ${c.service}:</strong></span>
                        <a href="tel:${c.phone}">${c.phone}</a>
                    </div>
                `).join('');
            }

            // 6. Multi-Disaster Breakdown Bars
            const barsContainer = container.querySelector('#lr-bars-grid-container');
            if (barsContainer && ass.all_disaster_breakdown) {
                const disasterIcons = {
                    cyclone: '🌀',
                    floods: '🌧️',
                    rainfall: '🌧️',
                    winds: '💨',
                    landslides: '⛰️',
                    earthquakes: '🏚️',
                    tsunami: '🌊'
                };
                barsContainer.innerHTML = Object.entries(ass.all_disaster_breakdown).map(([k, val]) => {
                    let barCol = '#2e7d32';
                    if (val >= 80) barCol = '#d32f2f';
                    else if (val >= 60) barCol = '#e65100';
                    else if (val >= 40) barCol = '#f57c00';
                    else if (val >= 20) barCol = '#fbc02d';

                    return `
                        <div class="lr-bar-item">
                            <div class="lr-bar-label">${disasterIcons[k] || '⚠️'} ${k.toUpperCase()}</div>
                            <div class="lr-bar-track">
                                <div class="lr-bar-fill" style="width:${val}%; background:${barCol};"></div>
                            </div>
                            <div class="lr-bar-pct" style="color:${barCol};">${val}%</div>
                        </div>
                    `;
                }).join('');
            }
        }

        function animateNumber(element, target) {
            let start = 0;
            const duration = 600;
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const current = Math.floor(progress * target);
                element.innerText = `${current}%`;
                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    element.innerText = `${target}%`;
                }
            }
            requestAnimationFrame(update);
        }

        // Attach Search Listeners
        if (searchInput && searchDropdown) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.trim();
                clearTimeout(debounceTimer);
                if (q.length < 2) {
                    searchDropdown.style.display = 'none';
                    return;
                }
                debounceTimer = setTimeout(async () => {
                    const results = await geocodeLocation(q);
                    renderSearchResults(results);
                }, 300);
            });

            function renderSearchResults(results) {
                if (!results || results.length === 0) {
                    searchDropdown.innerHTML = `<div style="padding:1rem; color:#64748b; font-size:0.9rem;">No matching locations found. Try city or coordinates.</div>`;
                    searchDropdown.style.display = 'block';
                    return;
                }

                searchDropdown.innerHTML = results.map(r => `
                    <div class="lr-search-item" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.display_name}">
                        <i class="fas fa-map-marker-alt" style="color:#e65100; margin-top:3px;"></i>
                        <div>
                            <div class="lr-item-name">${r.display_name.split(',')[0]}</div>
                            <div class="lr-item-sub">${r.display_name}</div>
                        </div>
                    </div>
                `).join('');
                searchDropdown.style.display = 'block';

                searchDropdown.querySelectorAll('.lr-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const lat = item.dataset.lat;
                        const lon = item.dataset.lon;
                        const name = item.dataset.name;
                        searchInput.value = name.split(',')[0];
                        searchDropdown.style.display = 'none';
                        updateLocation(lat, lon, name);
                    });
                });
            }

            // Close search dropdown on click outside
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    searchDropdown.style.display = 'none';
                }
            });
        }

        // Attach Quick Pill Buttons
        pillBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const lat = btn.dataset.lat;
                const lon = btn.dataset.lon;
                const name = btn.dataset.name;
                if (searchInput) searchInput.value = name.split(',')[0];
                updateLocation(lat, lon, name);
            });
        });

        // Attach GPS Button
        if (gpsBtn) {
            gpsBtn.addEventListener('click', () => {
                if (navigator.geolocation) {
                    gpsBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Locating...`;
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            gpsBtn.innerHTML = `<i class="fas fa-location-arrow"></i> My GPS`;
                            const lat = pos.coords.latitude;
                            const lon = pos.coords.longitude;
                            if (searchInput) searchInput.value = `My Current Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
                            updateLocation(lat, lon, `My Current Location`);
                        },
                        (err) => {
                            gpsBtn.innerHTML = `<i class="fas fa-location-arrow"></i> My GPS`;
                            alert('Could not access current location. Please allow GPS permission in your browser.');
                        },
                        { timeout: 8000 }
                    );
                } else {
                    alert('Geolocation is not supported by your browser.');
                }
            });
        }

        // Initial Data Fetch
        updateLocation(currentLat, currentLon, currentLocationName);

        // Fix leaflet tile rendering on initial tab/container load
        if (map) {
            setTimeout(() => map.invalidateSize(), 300);
        }

        return { updateLocation, map };
    }

    // Export Global Initializer
    window.initLocationRiskWidget = function (selectorOrEl, options = {}) {
        const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
        if (!el) return null;
        return createWidgetInstance(el, options);
    };

    // Auto-mount on DOM Ready
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.location-risk-search-widget').forEach(el => {
            if (!el.dataset.initialized) {
                el.dataset.initialized = 'true';
                createWidgetInstance(el, { disaster: el.dataset.disaster || 'all' });
            }
        });
    });

    // Inject CSS Keyframes for pulse effect
    (function injectStyles() {
        if (document.getElementById('lr-widget-keyframes')) return;
        const style = document.createElement('style');
        style.id = 'lr-widget-keyframes';
        style.innerHTML = `
            @keyframes pinPulse {
                0% { transform: scale(0.6); opacity: 0.8; }
                100% { transform: scale(1.8); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    })();
})();

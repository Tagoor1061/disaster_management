/**
 * Landslide Early Warning Unit — Chart.js + Leaflet Runtime Component
 * ===================================================================
 * Renders the full landslide preparedness dashboard:
 *   - 5 status badges (districts at risk, rainfall thresholds exceeded,
 *     soil saturation alerts, next-year prediction, trend indicator)
 *   - Chart.js daily timeline: rainfall bars coloured by landslide risk +
 *     soil-moisture line + danger-threshold guide lines
 *   - Leaflet map: DEM hazard-zone polygons + rainfall hotspot overlays +
 *     seismic epicentre markers
 *   - AI explainability panel: hazard card, SHAP bars, LIME breakdown
 *   - Manual Refresh button + auto-refresh every 60 seconds
 *
 * Loaded by templates/disasters/landslides.html via the
 * #landslide-preparedness-widget placeholder div.
 */

(function () {
    const WIDGET_ID = 'landslide-preparedness-widget';
    const REFRESH_MS = 60000;

    function riskColor(risk) {
        const r = String(risk || '').toUpperCase();
        if (r === 'EXTREME') return '#d32f2f';
        if (r === 'HIGH') return '#ff9800';
        if (r === 'MODERATE') return '#fbc02d';
        return '#2e7d32';
    }

    window.renderLandslidePreparedness = function () {
        const container = document.getElementById(WIDGET_ID);
        if (!container) return;
        // Ignore overlapping ticks: a slow first prediction must never be
        // wiped and restarted by the next 60s auto-refresh interval.
        if (window.__landslideLoading) return;
        window.__landslideLoading = true;

        container.innerHTML = `
            <div style="background:#ffffff; border-radius:14px; padding:1.5rem; box-shadow:0 6px 20px rgba(0,0,0,0.08); margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; border-bottom:2px solid #efebe9; padding-bottom:0.8rem;">
                    <div>
                        <div style="font-size:1.3rem; font-weight:700; color:#4e342e; display:flex; align-items:center; gap:0.5rem;">
                            ⛰️ Landslide Early Warning Unit — IMD + USGS + NOAA/NCEI + DEM AI Prediction
                        </div>
                        <small style="color:#666;">IMD District/State Rainfall • Basin QPF • USGS Seismic Triggers • NOAA/NCEI Soil Moisture • DEM Slope Terrain • GradientBoosting Classifier AI</small>
                    </div>
                    <button id="landslide-refresh-btn" style="background:#5d4037; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:8px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-sync-alt"></i> Manual Refresh & Retrain
                    </button>
                </div>
                <div id="landslide-badges" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(165px, 1fr)); gap:0.9rem; margin-bottom:1.5rem;">
                    <div class="landslide-badge">Loading…</div>
                </div>

                <h4 style="margin:0 0 0.4rem 0; color:#2c3e50; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-chart-column" style="color:#5d4037;"></i>
                    Daily Rainfall & Landslide Risk — Last 30 Days
                </h4>
                <div style="background:#fafafa; border:1px solid #eee; border-radius:8px; padding:0.6rem 0.9rem; font-size:0.85rem; color:#555; margin-bottom:0.8rem; line-height:1.6;">
                    <b>How to read:</b> each <b>bar</b> is one day's rainfall.
                    Bar colour = landslide risk for that day:
                    <span style="color:#2e7d32; font-weight:700;">🟢 Low</span>,
                    <span style="color:#b58900; font-weight:700;">🟡 Moderate</span>,
                    <span style="color:#ef6c00; font-weight:700;">🟠 High</span>,
                    <span style="color:#d32f2f; font-weight:700;">🔴 Extreme</span>.
                    Dashed lines are danger levels — bars crossing them mean danger of slides.
                    The <span style="color:#6a1b9a; font-weight:700;">purple line</span> shows how soaked the soil is (right axis).
                </div>
                <div id="landslide-chart-wrap" style="position:relative; height:340px; width:100%; margin-bottom:1.5rem;">
                    <canvas id="landslide-chart-canvas"></canvas>
                </div>

                <h4 style="margin:0 0 0.8rem 0; color:#2c3e50; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-map-marked-alt" style="color:#5d4037;"></i>
                    Live Landslide Hazard Map — DEM Zones, Rainfall Hotspots & Seismic Epicentres
                </h4>
                <div id="landslide-map" style="height:400px; width:100%; border-radius:10px; overflow:hidden; border:1px solid #ddd;"></div>
                <div id="landslide-explain-box" style="margin-top:1.2rem;"></div>
            </div>
            <div style="background:#efebe9; border-radius:14px; padding:1.5rem; box-shadow:0 6px 20px rgba(0,0,0,0.08); margin-bottom:2rem;">
                <h4 style="margin:0 0 0.8rem; color:#4e342e; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-mountain" style="color:#5d4037;"></i> Landslide Preparedness Guide
                </h4>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem;">
                    <div style="background:#fff; border-radius:10px; padding:1rem;">
                        <strong style="color:#5d4037;">🚸 Evacuation Routes</strong>
                        <ul style="margin:0.5rem 0 0; padding-left:1.2rem; font-size:0.88rem; color:#444;">
                            <li>Move uphill along designated mandal roads to assembly points on high ground — never cross valley streams or gullies.</li>
                            <li>Avoid Kotappakonda ghat road and steep cut-slope stretches during red/heavy rainfall alerts.</li>
                            <li>Keep documents, medicines and a torch in a grab-bag; switch off mains power before leaving.</li>
                        </ul>
                    </div>
                    <div style="background:#fff; border-radius:10px; padding:1rem;">
                        <strong style="color:#5d4037;">🧱 Slope Stabilization Tips</strong>
                        <ul style="margin:0.5rem 0 0; padding-left:1.2rem; font-size:0.88rem; color:#444;">
                            <li>Plant deep-rooted vegetation (vetiver, bamboo) on bare slopes to bind the soil.</li>
                            <li>Build retaining walls / gabion structures at the toe of cut slopes; keep them weep-hole clear.</li>
                            <li>Redirect rooftop and road runoff away from slope faces — never let water pond near foundations.</li>
                            <li>Report new cracks, bulging walls or tilting poles to GMC immediately — early signs of slope movement.</li>
                        </ul>
                    </div>
                    <div style="background:#fff; border-radius:10px; padding:1rem;">
                        <strong style="color:#5d4037;">⚠️ Warning Signs of Imminent Slides</strong>
                        <ul style="margin:0.5rem 0 0; padding-left:1.2rem; font-size:0.88rem; color:#444;">
                            <li>Fresh cracks on hillsides or roads, doors/windows jamming suddenly.</li>
                            <li>Muddy or cloudy spring water, rumbling sounds from slopes, leaning trees/fences.</li>
                            <li>Rapid stream-level rise with turbid water after intense rain upstream.</li>
                        </ul>
                    </div>
                    <div style="background:#fff; border-radius:10px; padding:1rem;">
                        <strong style="color:#d32f2f;">☎️ Emergency Helplines</strong>
                        <ul style="margin:0.5rem 0 0; padding-left:1.2rem; font-size:0.88rem; color:#444;">
                            <li><b>NDMA:</b> 1078 &nbsp;•&nbsp; <b>SDMA (AP):</b> 1070</li>
                            <li><b>Police:</b> 100 &nbsp;•&nbsp; <b>Fire & Rescue:</b> 101</li>
                            <li><b>Ambulance:</b> 108 &nbsp;•&nbsp; <b>GMC Control Room:</b> 1800-103-4242</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        const refreshBtn = document.getElementById('landslide-refresh-btn');
        refreshBtn.addEventListener('click', async function () {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing & Retraining…';
            refreshBtn.disabled = true;
            try {
                await fetch('/api/disaster-data/landslide/refresh', { method: 'POST' });
            } catch (e) { /* keep rendering cached data */ }
            window.renderLandslidePreparedness();
        });

        // Fetch the two endpoints INDEPENDENTLY: the live-inputs endpoint is
        // fast (server-side cached), so badges + hazard map paint right away,
        // while the AI prediction (chart + explainability) fills in when its
        // slower first-time training completes.
        let pending = 2;
        const settle = () => { if (--pending <= 0) window.__landslideLoading = false; };
        let liveData = null, predData = null;
        // Each panel renders independently — one failing renderer must never
        // block the others (especially the chart).
        const safe = (fn) => { try { fn(); } catch (e) { console.error('Landslide render step failed:', e); } };
        const apply = () => {
            if (liveData && window.__landslideRenderBadges) safe(() => window.__landslideRenderBadges(predData, liveData));
            if (predData && window.__landslideRenderChart) safe(() => window.__landslideRenderChart(predData));
            if (liveData && window.__landslideRenderMap) safe(() => window.__landslideRenderMap(liveData));
            if (predData && window.__landslideRenderExplain) safe(() => window.__landslideRenderExplain(predData));
        };

        fetch('/api/disaster-data/landslide')
            .then(r => r.json())
            .then(d => {
                if (!d || d.status === 'error') throw new Error((d && d.message) || 'data unavailable');
                liveData = d;
                apply();
            })
            .catch(err => {
                console.error('Landslide live inputs failed:', err);
                const box = document.getElementById('landslide-badges');
                if (box) box.innerHTML =
                    '<div class="landslide-badge" style="color:#d32f2f;">⚠️ Failed to load landslide data. Will retry in 60s.</div>';
            })
            .finally(settle);

        fetch('/api/predict/landslide')
            .then(r => r.json())
            .then(d => {
                if (!d || d.error) throw new Error((d && d.error) || 'prediction unavailable');
                predData = d;
                apply();
            })
            .catch(err => {
                console.error('Landslide prediction failed:', err);
                const box = document.getElementById('landslide-explain-box');
                if (box) box.innerHTML =
                    '<div style="padding:1rem; background:#fff8e1; border-radius:10px; color:#b26a00; font-size:0.9rem;">' +
                    '⚠️ AI prediction is warming up (first training can take ~30s). It will appear automatically on the next refresh.</div>';
            })
            .finally(settle);
    };
})();

/* ------------------------------------------------------------------ *
 * Sub-renderers (attached inside the same IIFE scope)
 * ------------------------------------------------------------------ */
(function () {
    const WARNING_COLORS = {
        red: '#d32f2f', orange: '#ff9800', yellow: '#fbc02d', green: '#2e7d32'
    };

    window.__landslideRenderBadges = function (pred, live) {
        const box = document.getElementById('landslide-badges');
        if (!box) return;

        const s = live?.summary || {};
        const districtsAtRisk = s.districts_at_risk ?? '—';
        const rainExceeded = s.rainfall_threshold_exceeded ?? 0;
        const soilAlert = s.soil_saturation_alert;

        const badge = (bg, border, label, value, valueColor) => `
            <div style="background:${bg}; padding:0.85rem 1rem; border-radius:10px; border-left:4px solid ${border};">
                <span style="font-size:0.8rem; font-weight:700; color:${border}; display:block;">${label}</span>
                <strong style="font-size:1.05rem; color:${valueColor || border};">${value}</strong>
            </div>`;

        const trendUp = pred?.trend === 'increasing';
        const trendFlat = pred?.trend === 'stable';
        box.innerHTML = [
            badge('#efebe9', '#5d4037', '⛰️ Districts at Risk',
                `🔴 ${districtsAtRisk} of ${s.districts_reporting ?? '—'} districts
                 • ${s.high_slope_zones ?? 0} steep DEM zones`),
            badge('#e3f2fd', '#1565c0', '🌧️ Rainfall Thresholds Exceeded',
                `<span style="color:${WARNING_COLORS.red}">🔴 ${rainExceeded}</span> breaches ≥64.5 mm/day
                 • Peak ${s.peak_district_rainfall_mm ?? '—'} mm`),
            badge(soilAlert ? '#ffebee' : '#e8f5e9',
                soilAlert ? WARNING_COLORS.red : WARNING_COLORS.green,
                '💧 Soil Saturation Alerts',
                `${soilAlert ? '⚠️ ALERT' : '✅ Normal'} • ${s.soil_saturation_pct ?? '—'}% saturated
                 • API ${live?.soil?.antecedent_precip_index_mm ?? '—'} mm`,
                soilAlert ? WARNING_COLORS.red : WARNING_COLORS.green),
            badge('#e0f2f1', '#00897b', `⛰️ Next Year Prediction (${pred?.next_year ?? ''})`,
                `${pred?.predicted_high_events_next_year ?? '—'} high-hazard days • Risk ${pred?.current_risk ?? '—'}`, '#004d40'),
            badge('#f5f5f5', trendUp ? WARNING_COLORS.red : trendFlat ? '#757575' : WARNING_COLORS.green,
                '📈 Trend Indicator',
                trendUp ? `🔺 Increasing (${pred?.high_hazard_days_this_year ?? 0} days this yr)`
                    : trendFlat ? `➡️ Stable (${pred?.high_hazard_days_this_year ?? 0} days this yr)`
                        : `🔻 Decreasing (${pred?.high_hazard_days_this_year ?? 0} days this yr)`,
                trendUp ? WARNING_COLORS.red : trendFlat ? '#616161' : WARNING_COLORS.green),
        ].join('');
    };
})();

/* ------------------------------------------------------------------ *
 * Chart — citizen-friendly daily timeline
 * ------------------------------------------------------------------ */
(function () {
    function riskColor(risk) {
        const r = String(risk || '').toUpperCase();
        if (r === 'EXTREME') return '#d32f2f';
        if (r === 'HIGH') return '#ff9800';
        if (r === 'MODERATE') return '#fbc02d';
        return '#2e7d32';
    }

    function fmtDay(iso) {
        const d = new Date(String(iso) + 'T00:00:00');
        if (isNaN(d)) return String(iso);
        return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }

    window.__landslideRenderChart = function (pred) {
        const wrap = document.getElementById('landslide-chart-wrap');
        if (!wrap) return;

        if (typeof Chart === 'undefined') {
            wrap.innerHTML = '<div style="padding:2rem; text-align:center; color:#b26a00;">⚠️ Chart.js library failed to load.</div>';
            return;
        }

        // Recover the canvas even if a previous cycle removed/replaced it
        let canvas = document.getElementById('landslide-chart-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'landslide-chart-canvas';
            wrap.innerHTML = '';
            wrap.appendChild(canvas);
        }

        const history = pred?.recent_history || [];
        if (!history.length) {
            wrap.innerHTML = '<div style="padding:2rem; text-align:center; color:#888;">⚠️ No daily history available yet.</div>';
            return;
        }

        try {
            drawLandslideTimeline(canvas, history);
        } catch (e) {
            console.error('Landslide chart failed:', e);
            wrap.innerHTML = '<div style="padding:2rem; text-align:center; color:#d32f2f;">⚠️ Chart could not be rendered: ' + e.message + '</div>';
        }
    };

    function drawLandslideTimeline(canvas, history) {
        const labels = history.map(h => fmtDay(h.date));
        // mm/h stored -> show intuitive mm per day
        const rainMm = history.map(h => Math.round((h.rainfall_intensity_mm_h || 0) * 24 * 10) / 10);
        const barColors = history.map(h => riskColor(h.risk));
        const soilPct = history.map(h => Math.round((h.soil_moisture_frac || 0) * 100));

        if (window.__landslideChart) window.__landslideChart.destroy();
        window.__landslideChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Rainfall that day (mm)',
                        data: rainMm,
                        backgroundColor: barColors,
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'How soaked the soil is (%)',
                        data: soilPct,
                        borderColor: '#6a1b9a',
                        backgroundColor: 'rgba(106,27,154,0.08)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 2,
                        borderWidth: 2.5,
                        yAxisID: 'y1'
                    },
                    {
                        type: 'line',
                        label: '⚠️ Slide-watch level (64.5 mm)',
                        data: Array(labels.length).fill(64.5),
                        borderColor: '#ef6c00',
                        borderDash: [7, 4],
                        pointRadius: 0,
                        borderWidth: 1.5,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: '🚨 Slide-warning level (115.6 mm)',
                        data: Array(labels.length).fill(115.6),
                        borderColor: '#d32f2f',
                        borderDash: [7, 4],
                        pointRadius: 0,
                        borderWidth: 1.5,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 14, padding: 12 } },
                    tooltip: {
                        callbacks: {
                            label: c => {
                                const i = c.dataIndex;
                                if (c.dataset.yAxisID === 'y1') {
                                    return `💧 Soil: ${c.raw}% soaked`;
                                }
                                if (c.dataset.label.indexOf('watch') !== -1) {
                                    return '⚠️ Above this dashed line = slide WATCH';
                                }
                                if (c.dataset.label.indexOf('warning') !== -1) {
                                    return '🚨 Above this dashed line = slide WARNING';
                                }
                                const day = history[i];
                                return `🌧️ ${c.raw} mm rain → ${day?.risk || '—'} landslide risk`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Day' },
                        ticks: { maxTicksLimit: 15, maxRotation: 0 }
                    },
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        title: { display: true, text: 'Rainfall (mm)' }
                    },
                    y1: {
                        min: 0,
                        max: 100,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Soil soaked (%)' }
                    }
                }
            }
        });
    }
})();

(function () {
    function riskColor(risk) {
        const r = String(risk || '').toUpperCase();
        if (r === 'EXTREME') return '#b71c1c';
        if (r === 'HIGH') return '#e53935';
        if (r === 'MODERATE') return '#fb8c00';
        return '#1e88e5';
    }

    window.__landslideRenderMap = function (live) {
        const mapEl = document.getElementById('landslide-map');
        if (!mapEl || typeof L === 'undefined') return;

        if (window.__landslideLeafletMap) {
            window.__landslideLeafletMap.remove();
            window.__landslideLeafletMap = null;
        }
        const map = L.map(mapEl).setView([16.15, 80.25], 9);
        window.__landslideLeafletMap = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap | GMC Landslide Early Warning'
        }).addTo(map);

        if (typeof L.control.locationSearch === 'function') {
            L.control.locationSearch({
                position: 'topright',
                placeholder: '🔍 Search location in landslide map...'
            }).addTo(map);
        }

        // ---- Layer 1: DEM hazard-zone polygons ---------------------------------
        (live?.terrain?.zones || []).forEach(z => {
            if (!z.polygon) return;
            const c = riskColor(z.risk);
            L.polygon(z.polygon, {
                color: c, fillColor: c,
                fillOpacity: z.risk === 'LOW' ? 0.08 : 0.25,
                weight: 2, dashArray: z.stability === 'unstable' ? null : '6, 3'
            }).addTo(map).bindPopup(
                `<b>⛰️ ${z.name}</b><br/>` +
                `Slope: <b>${z.slope_deg}°</b> • Elevation: <b>${z.elevation_m} m</b><br/>` +
                `Hazard: <b>${z.risk}</b> (${z.stability || '—'})<br/>` +
                `<i>DEM terrain layer${live?.terrain?.source ? ' — ' + live.terrain.source : ''}</i>`);
        });

        // ---- Layer 2: basin QPF polygon + sub-basin markers ---------------------
        const basin = live?.imd_rainfall?.basin_qpf || {};
        if (basin.polygon) {
            L.polygon(basin.polygon, {
                color: '#1565c0', fillColor: '#42a5f5',
                fillOpacity: 0.10, weight: 2
            }).addTo(map).bindPopup(
                `<b>🏞️ ${basin.basin_name || 'River Basin'} QPF Overlay</b><br/>` +
                `${(basin.sub_basins || []).map(sb => `${sb.name}: <b>${sb.qpf_mm} mm</b> (${sb.risk})`).join('<br/>')}`);
        }

        // ---- Layer 3: rainfall hotspots (district heat circles) ------------------
        ((live?.imd_rainfall?.district_rainfall)?.districts || []).forEach(d => {
            if (d.lat == null || d.lon == null) return;
            const mm = d.rainfall_mm || 0;
            const c = mm >= 115.6 ? '#b71c1c' : mm >= 64.5 ? '#e53935' : mm >= 15.6 ? '#1e88e5' : '#90caf9';
            L.circle([d.lat, d.lon], {
                radius: 12000 + Math.min(mm * 100, 14000),
                color: c, fillColor: c, fillOpacity: 0.28, weight: 1.5
            }).addTo(map).bindPopup(
                `<b>🌧️ ${d.district} — Rainfall Hotspot</b><br/>Rainfall: <b>${mm} mm</b> (${d.category || '—'})<br/>` +
                `Departure: ${d.departure_percent > 0 ? '+' : ''}${d.departure_percent}% vs normal<br/>` +
                `${mm >= 115.6 ? '🚨 VERY HEAVY — slide warning threshold breached'
                    : mm >= 64.5 ? '⚠️ HEAVY — slide watch threshold breached'
                        : '✅ Below slide-watch threshold'}`);
        });

        // ---- Layer 4: seismic epicentres (USGS triggers) -------------------------
        (live?.seismic?.events || []).forEach(e => {
            if (e.lat == null || e.lon == null) return;
            const mag = parseFloat(e.mag) || 0;
            const c = mag >= 5 ? '#b71c1c' : mag >= 4 ? '#ff9800' : '#8e24aa';
            L.circleMarker([e.lat, e.lon], {
                radius: 5 + Math.min(mag * 1.6, 12),
                color: c, fillColor: c, fillOpacity: 0.65, weight: 2
            }).addTo(map).bindPopup(
                `<b>🌍 Seismic Trigger — M${mag}</b><br/>${e.place || 'Unknown location'}<br/>` +
                `Depth: ${e.depth_km ?? '—'} km • ${e.time || ''}<br/>` +
                `${mag >= 4 ? '⚠️ Counts toward seismic slope-failure trigger score'
                    : 'ℹ️ Below M4 trigger threshold'}`);
        });

        // Legend control
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div');
            div.style.cssText = 'background:#fff;padding:8px 10px;border-radius:8px;font-size:0.75rem;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
            div.innerHTML =
                '<b>Landslide Hazard Levels</b><br/>' +
                '<span style="color:#1e88e5">●</span> LOW (stable slopes)<15°<br/>' +
                '<span style="color:#fb8c00">●</span> MODERATE (15–30°)<br/>' +
                '<span style="color:#e53935">●</span> HIGH (30–40°)<br/>' +
                '<span style="color:#b71c1c">●</span> EXTREME (>40° / saturated)<br/>' +
                '<span style="color:#8e24aa">●</span> Seismic epicentre (USGS)';
            return div;
        };
        legend.addTo(map);
    };
})();

(function () {
    window.__landslideRenderExplain = function (pred) {
        const box = document.getElementById('landslide-explain-box');
        if (!box) return;
        const shap = pred?.explainability?.shap_feature_importance || {};
        const lime = pred?.explainability?.lime_local_explanation || [];
        const entries = Object.entries(shap);
        const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.0001);
        const proba = pred?.class_probabilities_pct || {};

        const shapRows = entries.length
            ? entries.map(([feat, val]) => `
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                    <span style="width:150px; font-size:0.8rem; color:#555;">${feat}</span>
                    <div style="flex:1; background:#eceff1; border-radius:4px; height:10px; overflow:hidden;">
                        <div style="width:${(Math.abs(val) / maxVal) * 100}%; height:100%; background:linear-gradient(90deg,#6d4c41,#e65100);"></div>
                    </div>
                    <span style="width:56px; text-align:right; font-size:0.75rem; color:#777;">${val}</span>
                </div>`).join('')
            : '<span style="font-size:0.85rem; color:#888;">⚠️ SHAP feature importance not available.</span>';

        let limeRows;
        if (Array.isArray(lime) && lime.length) {
            limeRows = lime.map(item => `
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:0.25rem 0.5rem; background:#f5f5f5; border-radius:4px; margin-bottom:0.3rem;">
                    <span>${item.feature}</span>
                    <strong style="color:${item.weight >= 0 ? '#2e7d32' : '#d32f2f'};">${item.weight >= 0 ? '+' : ''}${item.weight}</strong>
                </div>`).join('');
        } else if (lime && typeof lime === 'object') {
            limeRows = `<pre style="margin:0; font-size:0.78rem; background:#f5f5f5; padding:0.7rem; border-radius:6px; overflow-x:auto; white-space:pre-wrap;">${JSON.stringify(lime, null, 2)}</pre>`;
        } else {
            limeRows = '<span style="font-size:0.85rem; color:#888;">⚠️ LIME local explanation not available.</span>';
        }

        const probaRows = Object.entries(proba).map(([cls, pct]) => `
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:0.2rem 0.4rem; background:#fafafa; border-radius:4px; margin-bottom:0.25rem;">
                <span style="color:${riskColor(cls)}; font-weight:700;">${cls}</span>
                <span>${pct}%</span>
            </div>`).join('');

        box.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🧠 AI Landslide Hazard Assessment</h4>
                    <p style="margin:0.2rem 0;">Current Hazard:
                        <strong style="color:${pred?.current_risk_color || '#37474f'}; font-size:1.05rem;">${pred?.current_risk ?? '—'}</strong>
                        (${pred?.risk_confidence_pct ?? '—'}% confidence)</p>
                    <p style="margin:0.2rem 0;">Rule-based cross-check:
                        <strong style="color:${riskColor(pred?.rule_based_risk)}">${pred?.rule_based_risk ?? '—'}</strong></p>
                    <p style="margin:0.2rem 0;">Drivers: ${pred?.drivers?.peak_daily_rainfall_mm ?? '—'} mm/day peak rain •
                        ${pred?.drivers?.slope_deg ?? '—'}° mean slope •
                        ${(parseFloat(pred?.drivers?.soil_moisture_frac) * 100 || 0).toFixed(0)}% soil moisture •
                        seismic score ${pred?.drivers?.seismic_trigger_score ?? '—'}</p>
                    <p style="margin:0.2rem 0;">High-Hazard Days Next Year:
                        <strong>${pred?.predicted_high_events_next_year ?? '—'}</strong></p>
                    <div style="margin-top:0.5rem;">${probaRows}</div>
                    <p style="margin:0.4rem 0 0; font-size:0.82rem; color:#777;">
                        Model: ${pred?.classifier_kind ?? '—'} • Fallback: ${pred?.fallback_model_kind ?? 'n/a'} • Trained: ${pred?.trained_at ?? '—'}</p>
                </div>
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🔍 SHAP — Global Feature Influence</h4>
                    ${shapRows}
                </div>
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🔎 LIME — Latest Prediction Breakdown</h4>
                    ${limeRows}
                </div>
            </div>`;
    };
})();

/* ------------------------------------------------------------------ *
 * Bootstrap + auto-refresh (60s)
 * ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('landslide-preparedness-widget')) return;

    window.renderLandslidePreparedness();          // initial render
    setInterval(window.renderLandslidePreparedness, 60000); // auto-refresh every 60s
});
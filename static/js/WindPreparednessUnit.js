/**
 * Wind Preparedness Unit — Chart.js + Leaflet Runtime Component
 * =============================================================
 * Renders the full IMD wind preparedness dashboard:
 *   - 5 status badges (warnings, gust speeds, hazard zones, next-year
 *     prediction, trend)
 *   - Chart.js line chart: historical gusts + ARIMA/ML AI trajectory
 *   - Leaflet map: warning polygons color-coded by severity, station gust
 *     markers, dust-storm zones and squall paths
 *   - Manual Refresh button + auto-refresh every 60 seconds
 *
 * Loaded by templates/disasters/winds.html via the
 * #wind-preparedness-widget placeholder div.
 */

(function () {
    const WIDGET_ID = 'wind-preparedness-widget';
    const REFRESH_MS = 60000;

    function levelColor(level) {
        const l = String(level || '').toLowerCase();
        if (l.includes('red')) return '#FF0000';
        if (l.includes('orange')) return '#FFA500';
        if (l.includes('yellow')) return '#FFFF00';
        return '#7cfc00';
    }

    window.renderWindPreparedness = function () {
        const container = document.getElementById(WIDGET_ID);
        if (!container) return;

        container.innerHTML = `
            <div style="background:#ffffff; border-radius:14px; padding:1.5rem; box-shadow:0 6px 20px rgba(0,0,0,0.08); margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; border-bottom:2px solid #e0f2f1; padding-bottom:0.8rem;">
                    <div>
                        <div style="font-size:1.3rem; font-weight:700; color:#00695c; display:flex; align-items:center; gap:0.5rem;">
                            💨 Wind Preparedness Unit — IMD Analytics & AI Prediction
                        </div>
                        <small style="color:#666;">IMD District Warnings (codes 4/7/8/14/15/32) • Station Nowcast (Cat4–Cat18) • Classifier + ARIMA AI</small>
                    </div>
                    <button id="wind-refresh-btn" style="background:#00695c; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:8px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-sync-alt"></i> Manual Refresh & Retrain
                    </button>
                </div>
                <div id="wind-badges" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(165px, 1fr)); gap:0.9rem; margin-bottom:1.5rem;">
                    <div class="wind-badge">Loading…</div>
                </div>
                <div style="position:relative; height:340px; width:100%; margin-bottom:1.5rem;">
                    <canvas id="wind-chart-canvas"></canvas>
                </div>
                <h4 style="margin:0 0 0.8rem 0; color:#2c3e50; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-map-marked-alt" style="color:#00695c;"></i>
                    Live Wind Hazard Map — Warning Polygons, Station Gusts & Dust Storm Zones
                </h4>
                <div id="wind-map" style="height:400px; width:100%; border-radius:10px; overflow:hidden; border:1px solid #ddd;"></div>
                <div id="wind-explain-box" style="margin-top:1.2rem;"></div>
            </div>
        `;

        const refreshBtn = document.getElementById('wind-refresh-btn');
        refreshBtn.addEventListener('click', async function () {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing & Retraining…';
            refreshBtn.disabled = true;
            try {
                await fetch('/api/disaster-data/wind/refresh', { method: 'POST' });
            } catch (e) { /* keep rendering cached data */ }
            window.renderWindPreparedness();
        });

        Promise.all([
            fetch('/api/predict/wind').then(r => r.json()),
            fetch('/api/disaster-data/wind').then(r => r.json())
        ]).then(([pred, live]) => {
            if (window.__windRenderBadges) window.__windRenderBadges(pred, live);
            if (window.__windRenderChart) window.__windRenderChart(pred);
            if (window.__windRenderMap) window.__windRenderMap(live);
            if (window.__windRenderExplain) window.__windRenderExplain(pred);
        }).catch(err => {
            console.error('Wind preparedness load failed:', err);
            container.querySelector('#wind-badges').innerHTML =
                '<div class="wind-badge" style="color:#d32f2f;">⚠️ Failed to load wind data. Will retry in 60s.</div>';
        });
    };
})();

/* ------------------------------------------------------------------ *
 * Sub-renderers (attached inside the same IIFE scope)
 * ------------------------------------------------------------------ */
(function () {
    const WARNING_COLORS = {
        red: '#d32f2f', orange: '#ff9800', yellow: '#fbc02d', green: '#2e7d32'
    };

    function levelColor(level) {
        const l = String(level || '').toLowerCase();
        if (l.includes('red')) return WARNING_COLORS.red;
        if (l.includes('orange')) return WARNING_COLORS.orange;
        if (l.includes('yellow')) return WARNING_COLORS.yellow;
        return WARNING_COLORS.green;
    }

    window.__windRenderBadges = function (pred, live) {
        const box = document.getElementById('wind-badges');
        if (!box) return;

        const warnings = live?.district_warnings?.warnings || [];
        const s = live?.summary || {};
        // Prefer backend-computed summary counts; fall back to counting warnings
        const count = re => warnings.filter(w => new RegExp(re, 'i').test(w.warning_level || '')).length;
        const redCount = s.red_warnings ?? count('red');
        const orangeCount = s.orange_warnings ?? count('orange');
        const yellowCount = s.yellow_warnings ?? count('yellow');
        const greenCount = s.green_warnings ?? count('green|no warning');
        const nowcastList = live?.station_nowcast?.nowcast || live?.station_nowcast?.stations || [];
        const alerts = s.nowcast_alerts ?? nowcastList.filter(n => n.alert).length;
        const maxGust = s.max_gust_kmph ??
            Math.max(0, ...nowcastList.map(n => n.gust_kmph ?? n.gust_speed_kmph ?? 0));

        const badge = (bg, border, label, value, valueColor) => `
            <div style="background:${bg}; padding:0.85rem 1rem; border-radius:10px; border-left:4px solid ${border};">
                <span style="font-size:0.8rem; font-weight:700; color:${border}; display:block;">${label}</span>
                <strong style="font-size:1.05rem; color:${valueColor || border};">${value}</strong>
            </div>`;

        const trendUp = pred?.trend === 'increasing';
        box.innerHTML = [
            badge('#fff3e0', '#ff9800', '💨 District Warnings',
                `<span style="color:${WARNING_COLORS.red}">🔴 ${redCount}</span>
                 <span style="color:#ef6c00">🟠 ${orangeCount}</span>
                 <span style="color:#b5a000">🟡 ${yellowCount}</span>
                 <span style="color:${WARNING_COLORS.green}">🟢 ${greenCount}</span>`),
            badge('#fce4ec', '#d81b60', '💨 Station Nowcast Alerts',
                `${alerts} Active`),
            badge('#e3f2fd', '#1565c0', '💨 Max Gust (live)',
                `${maxGust} kmph`),
            badge('#e0f2f1', '#00897b', `💨 Next Year Prediction (${pred?.next_year ?? ''})`,
                `${pred?.predicted_severe_events_next_year ?? '—'} severe events • Peak gust ${pred?.peak_forecast_gust_kmph ?? '—'} kmph`, '#004d40'),
            badge('#f5f5f5', trendUp ? WARNING_COLORS.red : WARNING_COLORS.green, '📈 Trend Indicator',
                trendUp ? '🔺 Increasing' : '🔻 Decreasing',
                trendUp ? WARNING_COLORS.red : WARNING_COLORS.green),
        ].join('');
    };
})();

(function () {
    window.__windRenderChart = function (pred) {
        const canvas = document.getElementById('wind-chart-canvas');
        if (!canvas || typeof Chart === 'undefined') return;

        const hist = pred?.hourly_history || [];
        const fc = pred?.forecast_trajectory || [];
        if (!hist.length && !fc.length) {
            canvas.replaceWith(Object.assign(document.createElement('div'), {
                innerHTML: '<div style="padding:2rem; text-align:center; color:#888;">⚠️ No wind history or forecast data available.</div>'
            }));
            return;
        }

        const histLabels = hist.map(h => h.time);
        const histVals = hist.map(h => h.gust_kmph);
        const fcLabels = fc.map(f => f.time);
        const bridgeIdx = Math.max(histLabels.length - 1, 0);

        if (window.__windChart) window.__windChart.destroy();
        window.__windChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [...histLabels, ...fcLabels],
                datasets: [
                    {
                        label: 'Historical Gusts (kmph)',
                        data: [...histVals, ...Array(fcLabels.length).fill(null)],
                        borderColor: '#00695c',
                        backgroundColor: 'rgba(0,105,92,0.15)',
                        fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2
                    },
                    {
                        label: `AI Blended Forecast (${pred?.model_type || 'Classifier'} + ARIMA)`,
                        data: [...Array(bridgeIdx).fill(null), histVals[bridgeIdx],
                        ...fc.map(f => f.blended_gust_kmph)],
                        borderColor: '#e65100', borderDash: [6, 4],
                        fill: false, tension: 0.35, pointRadius: 3, borderWidth: 2.5
                    },
                    {
                        label: 'ML Classifier Trajectory',
                        data: [...Array(bridgeIdx).fill(null), histVals[bridgeIdx],
                        ...fc.map(f => f.ml_gust_kmph)],
                        borderColor: '#5e35b1', borderDash: [4, 4],
                        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.5
                    },
                    {
                        label: 'ARIMA Trajectory',
                        data: [...Array(bridgeIdx).fill(null), histVals[bridgeIdx],
                        ...fc.map(f => f.arima_gust_kmph)],
                        borderColor: '#8e24aa', borderDash: [2, 3],
                        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.5
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} kmph` } }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Gust Speed (kmph)' } },
                    x: { title: { display: true, text: 'Time' }, ticks: { maxTicksLimit: 16 } }
                }
            }
        });
    };
})();

(function () {
    function catColor(cat) {
        const c = String(cat || '').toLowerCase();
        if (c.includes('cat15') || c.includes('cat18')) return '#b71c1c';
        if (c.includes('cat14')) return '#e53935';
        if (c.includes('cat9')) return '#fb8c00';
        return '#1e88e5';
    }

    window.__windRenderMap = function (live) {
        const mapEl = document.getElementById('wind-map');
        if (!mapEl || typeof L === 'undefined') return;

        if (window.__windLeafletMap) {
            window.__windLeafletMap.remove();
            window.__windLeafletMap = null;
        }
        const map = L.map(mapEl).setView([16.10, 80.30], 8);
        window.__windLeafletMap = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap | IMD Wind Preparedness'
        }).addTo(map);

        if (typeof L.control.locationSearch === 'function') {
            L.control.locationSearch({
                position: 'topright',
                placeholder: '🔍 Search location in wind map...'
            }).addTo(map);
        }

        // ---- Layer 1: district warning polygons (Red/Orange/Yellow/Green) ----
        const warnings = live?.district_warnings?.warnings || [];
        warnings.forEach(w => {
            if (!w.polygon) return;
            L.polygon(w.polygon, {
                color: w.color || '#ff9800',
                fillColor: w.color || '#ff9800',
                fillOpacity: 0.22, weight: 2.5, dashArray: '6, 3'
            }).addTo(map).bindPopup(
                `<b>⚠️ ${w.warning_level || ''} — ${w.district}</b><br/>` +
                `${w.warning_label || ''}<br/>${w.message || ''}<br/>` +
                `<i>Valid: ${w.valid_from} → ${w.valid_to}</i>`);
        });

        // ---- Layer 2: station gust markers -----------------------------------
        const stationName = live?.station_nowcast?.station || 'Guntur';
        const nowcastList = live?.station_nowcast?.nowcast || live?.station_nowcast?.stations || [];
        nowcastList.forEach((n, i) => {
            const lat = n.lat ?? 16.3067 + i * 0.02;
            const lon = n.lon ?? 80.4365 - i * 0.02;
            const gust = n.gust_kmph ?? n.gust_speed_kmph ?? '—';
            const color = catColor(n.category);
            L.circleMarker([lat, lon], {
                radius: 7 + Math.min((Number(gust) || 0) / 12, 8),
                color: color, fillColor: color, fillOpacity: 0.75, weight: 2
            }).addTo(map).bindPopup(
                `<b>💨 ${n.station || stationName}</b><br/>Gust: <b>${gust} kmph</b><br/>` +
                `Category: ${n.category || '—'} (${n.category_label || n.category || ''})<br/>` +
                `${n.message || ''}`);
        });

        // ---- Layer 3: optional dust storm zones / squall paths ----------------
        (live?.dust_storm_zones || []).forEach(z => {
            if (!z.polygon) return;
            L.polygon(z.polygon, {
                color: '#bf8f30', fillColor: '#d4a017',
                fillOpacity: 0.25, weight: 2, dashArray: '3, 4'
            }).addTo(map).bindPopup(
                `<b>🌪️ Dust Storm Zone</b><br/>${z.message || ''}<br/>` +
                `<i>Valid: ${z.valid_from || ''} → ${z.valid_to || ''}</i>`);
        });

        (live?.squall_paths || []).forEach(p => {
            if (!p.path) return;
            L.polyline(p.path, {
                color: '#6a1b9a', weight: 3, dashArray: '10, 6'
            }).addTo(map).bindPopup(
                `<b>🌩️ Squall Path</b><br/>${p.message || ''}<br/>` +
                `<i>Valid: ${p.valid_from || ''} → ${p.valid_to || ''}</i>`);
        });

        // Legend control
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div');
            div.style.cssText = 'background:#fff;padding:8px 10px;border-radius:8px;font-size:0.75rem;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
            div.innerHTML =
                '<b>Wind Gust Categories</b><br/>' +
                '<span style="color:#1e88e5">●</span> Light (Cat4, &lt;40)<br/>' +
                '<span style="color:#fb8c00">●</span> Moderate (Cat9, 41–61)<br/>' +
                '<span style="color:#e53935">●</span> Severe (Cat14, 62–87)<br/>' +
                '<span style="color:#b71c1c">●</span> Very Severe / Dust Storm (Cat15/Cat18, &gt;87)';
            return div;
        };
        legend.addTo(map);
    };
})();

(function () {
    window.__windRenderExplain = function (pred) {
        const box = document.getElementById('wind-explain-box');
        if (!box) return;
        const shap = pred?.explainability?.shap_feature_importance || {};
        const lime = pred?.explainability?.lime_local_explanation || [];
        const entries = Object.entries(shap);
        const maxVal = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.0001);

        const shapRows = entries.length
            ? entries.map(([feat, val]) => `
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                    <span style="width:110px; font-size:0.8rem; color:#555;">${feat}</span>
                    <div style="flex:1; background:#eceff1; border-radius:4px; height:10px; overflow:hidden;">
                        <div style="width:${(Math.abs(val) / maxVal) * 100}%; height:100%; background:linear-gradient(90deg,#00897b,#e65100);"></div>
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

        box.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🧠 AI Wind Hazard Assessment</h4>
                    <p style="margin:0.2rem 0;">Current Hazard:
                        <strong style="color:${pred?.risk_color || '#37474f'}; font-size:1.05rem;">${pred?.current_hazard ?? '—'}</strong></p>
                    <p style="margin:0.2rem 0;">Peak Forecast:
                        <strong>${pred?.peak_forecast_hour ?? '—'}</strong> (${pred?.peak_forecast_gust_kmph ?? '—'} kmph)</p>
                    <p style="margin:0.2rem 0;">Severe Events Next Year:
                        <strong>${pred?.predicted_severe_events_next_year ?? '—'}</strong></p>
                    <p style="margin:0.2rem 0; font-size:0.82rem; color:#777;">
                        Model: ${pred?.model_type ?? '—'} • ARIMA AIC: ${pred?.arima?.aic ?? 'n/a'} • Trained: ${pred?.trained_at ?? '—'}</p>
                </div>
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🔍 SHAP — Feature Influence on Gust Forecast</h4>
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
    if (!document.getElementById('wind-preparedness-widget')) return;

    window.renderWindPreparedness();          // initial render
    setInterval(window.renderWindPreparedness, 60000); // auto-refresh every 60s
});

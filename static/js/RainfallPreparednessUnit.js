/**
 * Rainfall Preparedness Unit — Chart.js + Leaflet Runtime Component
 * ==================================================================
 * Renders the full IMD rainfall preparedness dashboard:
 *   - 7 status badges (district/state records, basin QPF, color-coded
 *     warnings, nowcast alerts, next-year AI prediction, trend)
 *   - Chart.js line chart: historical rainfall + LSTM/SARIMA AI trajectory
 *   - Leaflet map: rainfall heat circles, warning polygons, basin QPF overlay
 *   - Manual Refresh button + auto-refresh every 60 seconds
 *
 * Loaded by templates/disasters/rainfall.html via the
 * #rainfall-preparedness-widget placeholder div.
 */

(function () {
    const WIDGET_ID = 'rainfall-preparedness-widget';
    const REFRESH_MS = 60000;

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

    function rainColor(mm) {
        // IMD rainfall intensity zones
        if (mm >= 204.5) return '#b71c1c';   // extremely heavy
        if (mm >= 115.6) return '#e53935';   // very heavy
        if (mm >= 64.5) return '#fb8c00';    // heavy
        if (mm >= 15.6) return '#1e88e5';    // moderate
        return '#90caf9';                    // light
    }

    window.renderRainfallPreparedness = function () {
        const container = document.getElementById(WIDGET_ID);
        if (!container) return;

        container.innerHTML = `
            <div style="background:#ffffff; border-radius:14px; padding:1.5rem; box-shadow:0 6px 20px rgba(0,0,0,0.08); margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; border-bottom:2px solid #e1f5fe; padding-bottom:0.8rem;">
                    <div>
                        <div style="font-size:1.3rem; font-weight:700; color:#0277bd; display:flex; align-items:center; gap:0.5rem;">
                            🌧️ Rainfall Preparedness Unit — IMD Analytics & AI Prediction
                        </div>
                        <small style="color:#666;">IMD District/State Rainfall • Warnings • Station Nowcast • River Basin QPF • LSTM + SARIMA AI</small>
                    </div>
                    <button id="rainfall-refresh-btn" style="background:#0277bd; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:8px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-sync-alt"></i> Manual Refresh & Retrain
                    </button>
                </div>
                <div id="rainfall-badges" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(165px, 1fr)); gap:0.9rem; margin-bottom:1.5rem;">
                    <div class="rainfall-badge">Loading…</div>
                </div>
                <div style="position:relative; height:340px; width:100%; margin-bottom:1.5rem;">
                    <canvas id="rainfall-chart-canvas"></canvas>
                </div>
                <h4 style="margin:0 0 0.8rem 0; color:#2c3e50; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-map-marked-alt" style="color:#0277bd;"></i>
                    Live Rainfall Map — Heat Zones, Warning Polygons & Basin QPF Overlay
                </h4>
                <div id="rainfall-map" style="height:400px; width:100%; border-radius:10px; overflow:hidden; border:1px solid #ddd;"></div>
                <div id="rainfall-explain-box" style="margin-top:1.2rem;"></div>
            </div>
        `;

        const refreshBtn = document.getElementById('rainfall-refresh-btn');
        refreshBtn.addEventListener('click', async function () {
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing & Retraining…';
            refreshBtn.disabled = true;
            try {
                await fetch('/api/disaster-data/rainfall/refresh', { method: 'POST' });
            } catch (e) { /* keep rendering cached data */ }
            window.renderRainfallPreparedness();
        });

        Promise.all([
            fetch('/api/predict/rainfall').then(r => r.json()),
            fetch('/api/disaster-data/rainfall').then(r => r.json())
        ]).then(([pred, live]) => {
            if (window.__rainfallRenderBadges) window.__rainfallRenderBadges(pred, live);
            if (window.__rainfallRenderChart) window.__rainfallRenderChart(pred);
            if (window.__rainfallRenderMap) window.__rainfallRenderMap(live);
            if (window.__rainfallRenderExplain) window.__rainfallRenderExplain(pred);
        }).catch(err => {
            console.error('Rainfall preparedness load failed:', err);
            container.querySelector('#rainfall-badges').innerHTML =
                '<div class="rainfall-badge" style="color:#d32f2f;">⚠️ Failed to load rainfall data. Will retry in 60s.</div>';
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

    function rainColor(mm) {
        if (mm >= 204.5) return '#b71c1c';
        if (mm >= 115.6) return '#e53935';
        if (mm >= 64.5) return '#fb8c00';
        if (mm >= 15.6) return '#1e88e5';
        return '#90caf9';
    }

    window.__rainfallRenderBadges = function (pred, live) {
        const box = document.getElementById('rainfall-badges');
        if (!box) return;
        const s = live?.summary || {};
        const warnings = live?.district_warnings?.warnings || [];
        const count = re => warnings.filter(w => new RegExp(re, 'i').test(w.warning_level || '')).length;

        const badge = (bg, border, label, value, valueColor) => `
            <div style="background:${bg}; padding:0.85rem 1rem; border-radius:10px; border-left:4px solid ${border};">
                <span style="font-size:0.8rem; font-weight:700; color:${border}; display:block;">${label}</span>
                <strong style="font-size:1.05rem; color:${valueColor || border};">${value}</strong>
            </div>`;

        const trendUp = pred?.trend === 'increasing';
        box.innerHTML = [
            badge('#e1f5fe', '#0277bd', '🏷️ District-wise Rainfall Records',
                `${s.district_records ?? '—'} Districts`),
            badge('#e8f5e9', '#2e7d32', '🏷️ State-wise Rainfall Records',
                `${s.state_records ?? '—'} States`),
            badge('#ede7f6', '#5e35b1', '🏷️ River Basin Forecast',
                `${s.basin_sub_basins ?? '—'} Sub-Basins QPF`),
            badge('#fff3e0', '#ff9800', '🏷️ District Warnings',
                `<span style="color:${WARNING_COLORS.red}">🔴 ${count('red')}</span>
                 <span style="color:#ef6c00">🟠 ${count('orange')}</span>
                 <span style="color:#b5a000">🟡 ${count('yellow')}</span>
                 <span style="color:${WARNING_COLORS.green}">🟢 ${count('green|no warning')}</span>`),
            badge('#fce4ec', '#d81b60', '🏷️ Station Nowcast Alerts',
                `${s.nowcast_alerts ?? '—'} Active`),
            badge('#e0f2f1', '#00897b', `🏷️ Next Year Prediction (${pred?.next_year ?? ''})`,
                `${pred?.predicted_annual_rainfall_mm ?? '—'} mm • ${pred?.heavy_rainfall_events_predicted ?? '—'} heavy events`, '#004d40'),
            badge('#f5f5f5', trendUp ? WARNING_COLORS.red : WARNING_COLORS.green, '📈 Trend Indicator',
                trendUp ? `🔺 Increasing (+${pred?.change_percent ?? 0}%)` : `🔻 Decreasing (${pred?.change_percent ?? 0}%)`,
                trendUp ? WARNING_COLORS.red : WARNING_COLORS.green),
        ].join('');
    };
})();

(function () {
    function rainColor(mm) {
        if (mm >= 204.5) return '#b71c1c';
        if (mm >= 115.6) return '#e53935';
        if (mm >= 64.5) return '#fb8c00';
        if (mm >= 15.6) return '#1e88e5';
        return '#90caf9';
    }

    window.__rainfallRenderChart = function (pred) {
        const canvas = document.getElementById('rainfall-chart-canvas');
        if (!canvas || typeof Chart === 'undefined') return;

        const hist = pred?.monthly_history || [];
        const fc = pred?.forecast_trajectory || [];
        const histLabels = hist.map(m => m.date);
        const histVals = hist.map(m => m.rainfall_mm);
        const fcLabels = fc.map(f => f.date);
        const bridgeIdx = Math.max(histLabels.length - 1, 0);

        if (window.__rainfallChart) window.__rainfallChart.destroy();
        window.__rainfallChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [...histLabels, ...fcLabels],
                datasets: [
                    {
                        label: 'Historical Monthly Rainfall (mm)',
                        data: [...histVals, ...Array(fcLabels.length).fill(null)],
                        borderColor: '#0277bd',
                        backgroundColor: 'rgba(2,119,189,0.15)',
                        fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2
                    },
                    {
                        label: `AI Prediction (${pred?.model_type || 'LSTM'} + SARIMA)`,
                        data: [...Array(bridgeIdx).fill(null), histVals[bridgeIdx],
                        ...fc.map(f => f.blended_mm)],
                        borderColor: '#e65100', borderDash: [6, 4],
                        fill: false, tension: 0.35, pointRadius: 3, borderWidth: 2.5
                    },
                    {
                        label: 'SARIMA Seasonal Forecast',
                        data: [...Array(bridgeIdx).fill(null), histVals[bridgeIdx],
                        ...fc.map(f => f.sarima_mm)],
                        borderColor: '#8e24aa', borderDash: [2, 3],
                        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.5
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw} mm` } }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Rainfall (mm)' } },
                    x: { title: { display: true, text: 'Month' }, ticks: { maxTicksLimit: 16 } }
                }
            }
        });
    };
})();

(function () {
    function rainColor(mm) {
        if (mm >= 204.5) return '#b71c1c';
        if (mm >= 115.6) return '#e53935';
        if (mm >= 64.5) return '#fb8c00';
        if (mm >= 15.6) return '#1e88e5';
        return '#90caf9';
    }

    window.__rainfallRenderMap = function (live) {
        const mapEl = document.getElementById('rainfall-map');
        if (!mapEl || typeof L === 'undefined') return;

        if (window.__rainfallLeafletMap) {
            window.__rainfallLeafletMap.remove();
            window.__rainfallLeafletMap = null;
        }
        const map = L.map(mapEl).setView([16.10, 80.30], 8);
        window.__rainfallLeafletMap = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap | IMD Rainfall Preparedness'
        }).addTo(map);

        if (typeof L.control.locationSearch === 'function') {
            L.control.locationSearch({
                position: 'topright',
                placeholder: '🔍 Search location in rainfall map...'
            }).addTo(map);
        }

        // ---- Layer 1: rainfall heatmap circles (district intensity zones) ----
        const districts = live?.district_rainfall?.districts || [];
        districts.forEach(d => {
            if (d.lat == null || d.lon == null) return;
            L.circle([d.lat, d.lon], {
                radius: 14000 + Math.min((d.rainfall_mm || 0) * 120, 16000),
                color: rainColor(d.rainfall_mm || 0),
                fillColor: rainColor(d.rainfall_mm || 0),
                fillOpacity: 0.35, weight: 1.5
            }).addTo(map).bindPopup(
                `<b>🌧️ ${d.district}</b><br/>Rainfall: <b>${d.rainfall_mm} mm</b><br/>` +
                `Normal: ${d.normal_mm} mm (${d.departure_percent > 0 ? '+' : ''}${d.departure_percent}%)<br/>` +
                `Category: ${d.category}`);
        });

        // ---- Layer 2: district warning polygons (Red/Orange/Yellow/Green) ----
        const warnings = live?.district_warnings?.warnings || [];
        warnings.forEach(w => {
            if (!w.polygon) return;
            L.polygon(w.polygon, {
                color: w.color || '#ff9800',
                fillColor: w.color || '#ff9800',
                fillOpacity: 0.22, weight: 2.5, dashArray: '6, 3'
            }).addTo(map).bindPopup(
                `<b>⚠️ ${w.warning_level} — ${w.district}</b><br/>${w.message}<br/>` +
                `<i>Valid: ${w.valid_from} → ${w.valid_to}</i>`);
        });

        // ---- Layer 3: river basin QPF forecast overlay -----------------------
        const basin = live?.basin_qpf || {};
        if (basin.polygon) {
            L.polygon(basin.polygon, {
                color: '#5e35b1', fillColor: '#7e57c2',
                fillOpacity: 0.12, weight: 2
            }).addTo(map).bindPopup(
                `<b>🏞️ ${basin.basin_name || 'River Basin'} QPF</b><br/>` +
                `${(basin.sub_basins || []).map(sb => `${sb.name}: <b>${sb.qpf_mm} mm</b> (${sb.risk})`).join('<br/>')}`);
        }

        // Basin sub-basin markers with QPF values
        (basin.sub_basins || []).forEach((sb, i) => {
            const anchor = basin.polygon && basin.polygon.length
                ? basin.polygon[Math.min(i + 1, basin.polygon.length - 2)]
                : [16.2 + i * 0.15, 80.2];
            if (!anchor) return;
            L.marker(anchor).addTo(map).bindPopup(
                `<b>🏞️ ${sb.name}</b><br/>QPF (24h): <b>${sb.qpf_mm} mm</b><br/>Risk: ${sb.risk}`);
        });

        // ---- Layer 4: nowcast alert markers ----------------------------------
        const station = live?.station_nowcast?.station || 'Guntur';
        (live?.station_nowcast?.nowcast || []).forEach((n, i) => {
            if (!n.alert) return;
            L.marker([16.3067 + i * 0.02, 80.4365 - i * 0.02], {
                icon: L.divIcon({ className: '', html: '🚨', iconSize: [22, 22] })
            }).addTo(map).bindPopup(
                `<b>🚨 Nowcast Alert — ${station}</b><br/>+${i + 1}h: <b>${n.precipitation_mm} mm</b> (${n.intensity})<br/>${n.message || ''}`);
        });

        // Legend control
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div');
            div.style.cssText = 'background:#fff;padding:8px 10px;border-radius:8px;font-size:0.75rem;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
            div.innerHTML =
                '<b>Rainfall Intensity (mm)</b><br/>' +
                '<span style="color:#90caf9">●</span> Light (&lt;15.6)<br/>' +
                '<span style="color:#1e88e5">●</span> Moderate (15.6–64.4)<br/>' +
                '<span style="color:#fb8c00">●</span> Heavy (64.5–115.5)<br/>' +
                '<span style="color:#e53935">●</span> Very Heavy (115.6–204.4)<br/>' +
                '<span style="color:#b71c1c">●</span> Extremely Heavy (&gt;204.5)';
            return div;
        };
        legend.addTo(map);
    };
})();

(function () {
    window.__rainfallRenderExplain = function (pred) {
        const box = document.getElementById('rainfall-explain-box');
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
                        <div style="width:${(Math.abs(val) / maxVal) * 100}%; height:100%; background:linear-gradient(90deg,#0288d1,#e65100);"></div>
                    </div>
                    <span style="width:56px; text-align:right; font-size:0.75rem; color:#777;">${val}</span>
                </div>`).join('')
            : '<span style="font-size:0.85rem; color:#888;">SHAP module loading…</span>';

        const limeRows = lime.length
            ? lime.map(item => `
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:0.25rem 0.5rem; background:#f5f5f5; border-radius:4px; margin-bottom:0.3rem;">
                    <span>${item.feature}</span>
                    <strong style="color:${item.weight >= 0 ? '#2e7d32' : '#d32f2f'};">${item.weight >= 0 ? '+' : ''}${item.weight}</strong>
                </div>`).join('')
            : '<span style="font-size:0.85rem; color:#888;">LIME module loading…</span>';

        box.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1rem;">
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🧠 AI Heavy-Rainfall Risk Assessment</h4>
                    <p style="margin:0.2rem 0;">Risk Level:
                        <strong style="color:${pred?.risk_color}; font-size:1.05rem;">${pred?.risk_level ?? '—'}</strong></p>
                    <p style="margin:0.2rem 0;">Peak Forecast:
                        <strong>${pred?.peak_forecast_month ?? '—'}</strong> (${pred?.peak_forecast_mm ?? '—'} mm)</p>
                    <p style="margin:0.2rem 0;">Heavy Events Next Year:
                        <strong>${pred?.heavy_rainfall_events_predicted ?? '—'}</strong></p>
                    <p style="margin:0.2rem 0; font-size:0.82rem; color:#777;">
                        Model: ${pred?.model_type ?? '—'} • SARIMA AIC: ${pred?.sarima?.aic ?? 'n/a'} • Trained: ${pred?.trained_at ?? '—'}</p>
                </div>
                <div style="background:#fafafa; border:1px solid #eee; border-radius:10px; padding:1rem;">
                    <h4 style="margin:0 0 0.6rem; color:#37474f;">🔍 SHAP — Feature Influence on Forecast</h4>
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
    if (!document.getElementById('rainfall-preparedness-widget')) return;

    window.renderRainfallPreparedness();          // initial render
    setInterval(window.renderRainfallPreparedness, 60000); // auto-refresh every 60s
});

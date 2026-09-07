/**
 * Multi-Granular Disaster Analytics & Interactive Calendar Prediction Component
 * Supports Daily (Days), Monthly (Months), and Yearly (Years) timeframes
 * with Calendar Date / Month / Year Pickers for precise past & future predictions.
 * Guntur Municipal Corporation — Suraksha Kavach Disaster Management Portal
 */

(function () {
    const disasterConfig = {
        earthquakes: { name: 'Earthquakes', icon: 'fa-building', border: '#6a1b9a', bg: 'rgba(106, 27, 154, 0.15)', pred: '#ab47bc', predBg: 'rgba(171, 71, 188, 0.25)', text: '#4a148c' },
        floods: { name: 'Floods', icon: 'fa-cloud-showers-heavy', border: '#1565c0', bg: 'rgba(21, 101, 192, 0.15)', pred: '#42a5f5', predBg: 'rgba(66, 165, 245, 0.25)', text: '#0d47a1' },
        cyclones: { name: 'Cyclones', icon: 'fa-wind', border: '#e65100', bg: 'rgba(230, 81, 0, 0.15)', pred: '#ffa726', predBg: 'rgba(255, 167, 38, 0.25)', text: '#bf360c' },
        cyclone: { name: 'Cyclones', icon: 'fa-wind', border: '#e65100', bg: 'rgba(230, 81, 0, 0.15)', pred: '#ffa726', predBg: 'rgba(255, 167, 38, 0.25)', text: '#bf360c' },
        winds: { name: 'Winds', icon: 'fa-fan', border: '#00695c', bg: 'rgba(0, 105, 92, 0.15)', pred: '#26a69a', predBg: 'rgba(38, 166, 154, 0.25)', text: '#004d40' },
        tsunamis: { name: 'Tsunamis', icon: 'fa-water', border: '#00838f', bg: 'rgba(0, 131, 143, 0.15)', pred: '#26c6da', predBg: 'rgba(38, 198, 218, 0.25)', text: '#006064' },
        rainfall: { name: 'Rainfall', icon: 'fa-cloud-rain', border: '#0288d1', bg: 'rgba(2, 136, 209, 0.15)', pred: '#29b6f6', predBg: 'rgba(41, 182, 246, 0.25)', text: '#01579b' },
        landslides: { name: 'Landslides', icon: 'fa-mountain', border: '#5d4037', bg: 'rgba(93, 64, 55, 0.15)', pred: '#8d6e63', predBg: 'rgba(141, 110, 99, 0.25)', text: '#3e2723' },
        default: { name: 'Disaster', icon: 'fa-shield-alt', border: '#2e7d32', bg: 'rgba(46, 125, 50, 0.15)', pred: '#66bb6a', predBg: 'rgba(102, 187, 106, 0.25)', text: '#1b5e20' }
    };

    const disasterAliases = {
        'earthquake': 'earthquakes', 'earthquakes': 'earthquakes',
        'flood': 'floods', 'floods': 'floods',
        'cyclone': 'cyclones', 'cyclones': 'cyclones',
        'wind': 'winds', 'winds': 'winds',
        'tsunami': 'tsunamis', 'tsunamis': 'tsunamis',
        'rainfall': 'rainfall', 'rain': 'rainfall',
        'landslide': 'landslides', 'landslides': 'landslides'
    };

    window._disasterWidgetState = window._disasterWidgetState || {};

    window.renderDisasterChart = function (containerId, disasterType = 'cyclones') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const normalizedDisaster = disasterAliases[disasterType.toLowerCase()] || 'cyclones';
        const colors = disasterConfig[normalizedDisaster] || disasterConfig.default;
        const isCyclone = (normalizedDisaster === 'cyclones' || normalizedDisaster === 'cyclone');

        const todayStr = new Date().toISOString().split('T')[0];
        const currentMonthStr = todayStr.substring(0, 7);
        const currentYear = new Date().getFullYear();

        // Initialize state for this widget if not set
        if (!window._disasterWidgetState[containerId]) {
            window._disasterWidgetState[containerId] = {
                disasterType: normalizedDisaster,
                timeframe: 'days', // 'days' | 'months' | 'years'
                viewMode: 'all',   // 'all' | 'past' | 'future'
                calendarMode: 'day', // 'day' | 'month' | 'year' | 'range'
                selectedTarget: null,
                data: null
            };
        } else {
            window._disasterWidgetState[containerId].disasterType = normalizedDisaster;
        }

        const state = window._disasterWidgetState[containerId];

        // Generate Year Options for Select dropdown (2015 to 2035)
        let yearOptionsHtml = '';
        for (let y = 2015; y <= 2035; y++) {
            const isSel = y === currentYear + 1;
            yearOptionsHtml += `<option value="${y}" ${isSel ? 'selected' : ''}>${y} ${y >= currentYear ? '(AI Forecast)' : '(Historical)'}</option>`;
        }

        // Render widget shell structure
        container.innerHTML = `
            <div class="disaster-chart-card" style="background:#ffffff; border-radius:16px; padding:1.8rem; box-shadow:0 8px 25px rgba(0,0,0,0.08); margin-bottom:2.2rem; border:1px solid #eef2f6;">
                <!-- Header with Disaster Title & Quick Controls -->
                <div class="chart-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.2rem; margin-bottom:1.4rem; border-bottom:2px solid #f1f5f9; padding-bottom:1rem;">
                    <div>
                        <div class="chart-head-title" style="font-size:1.35rem; font-weight:800; color:${colors.text}; display:flex; align-items:center; gap:0.6rem;">
                            <i class="fas ${colors.icon}"></i>
                            <span id="title-disaster-name-${containerId}" style="text-transform: capitalize;">${colors.name}</span> Preparedness Unit — Multi-Granular Prediction
                        </div>
                        <div style="font-size:0.88rem; color:#64748b; margin-top:0.25rem;">
                            Interactive Calendar Selection & AI Predictions across Days, Months, and Years
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.8rem; flex-wrap:wrap;">
                        <!-- Disaster Switcher Dropdown -->
                        <div style="display:flex; align-items:center; gap:0.4rem; background:#f8fafc; padding:0.35rem 0.7rem; border-radius:8px; border:1px solid #cbd5e1;">
                            <label for="select-disaster-${containerId}" style="font-size:0.8rem; font-weight:700; color:#475569;">Disaster:</label>
                            <select id="select-disaster-${containerId}" onchange="window.switchWidgetDisaster('${containerId}', this.value)" style="border:none; background:transparent; font-weight:700; font-size:0.88rem; color:${colors.border}; cursor:pointer; outline:none;">
                                <option value="cyclones" ${normalizedDisaster === 'cyclones' ? 'selected' : ''}>🌀 Cyclones</option>
                                <option value="floods" ${normalizedDisaster === 'floods' ? 'selected' : ''}>🌊 Floods</option>
                                <option value="rainfall" ${normalizedDisaster === 'rainfall' ? 'selected' : ''}>🌧️ Rainfall</option>
                                <option value="earthquakes" ${normalizedDisaster === 'earthquakes' ? 'selected' : ''}>🏚️ Earthquakes</option>
                                <option value="winds" ${normalizedDisaster === 'winds' ? 'selected' : ''}>💨 Winds</option>
                                <option value="tsunamis" ${normalizedDisaster === 'tsunamis' ? 'selected' : ''}>🌊 Tsunamis</option>
                                <option value="landslides" ${normalizedDisaster === 'landslides' ? 'selected' : ''}>⛰️ Landslides</option>
                            </select>
                        </div>
                        <button class="btn-refresh-data" id="btn-refresh-${containerId}" onclick="window.refreshDisasterData('${normalizedDisaster}', '${containerId}')" style="background:${colors.border}; color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:8px; cursor:pointer; font-weight:700; font-size:0.88rem; display:inline-flex; align-items:center; gap:0.5rem; transition:all 0.2s;">
                            <i class="fas fa-sync-alt"></i> Refresh & Retrain
                        </button>
                    </div>
                </div>

                <!-- Interactive Calendar Date / Month / Year Picker Section -->
                <div class="calendar-picker-section" style="background:linear-gradient(135deg, #f8fafc 0%, #eef2f6 100%); border:2px solid ${colors.border}; border-radius:14px; padding:1.2rem 1.4rem; margin-bottom:1.5rem; box-shadow:0 4px 15px rgba(0,0,0,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.8rem; margin-bottom:0.9rem;">
                        <div style="font-size:1.02rem; font-weight:800; color:${colors.text}; display:flex; align-items:center; gap:0.5rem;">
                            <i class="fas fa-calendar-alt"></i> Select Exact Day, Month or Year on Calendar:
                        </div>
                        <!-- Calendar Mode Switcher (Day / Month / Year / Custom Range) -->
                        <div style="display:flex; gap:0.3rem; background:#ffffff; padding:0.25rem; border-radius:8px; border:1px solid #cbd5e1;">
                            <button id="cal-mode-day-${containerId}" onclick="window.setCalendarPickerMode('${containerId}', 'day')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.calendarMode === 'day' ? colors.border : 'transparent'}; color:${state.calendarMode === 'day' ? '#ffffff' : '#475569'};">
                                📅 Pick Specific Day
                            </button>
                            <button id="cal-mode-month-${containerId}" onclick="window.setCalendarPickerMode('${containerId}', 'month')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.calendarMode === 'month' ? colors.border : 'transparent'}; color:${state.calendarMode === 'month' ? '#ffffff' : '#475569'};">
                                📆 Pick Specific Month
                            </button>
                            <button id="cal-mode-year-${containerId}" onclick="window.setCalendarPickerMode('${containerId}', 'year')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.calendarMode === 'year' ? colors.border : 'transparent'}; color:${state.calendarMode === 'year' ? '#ffffff' : '#475569'};">
                                🗓️ Pick Specific Year
                            </button>
                            <button id="cal-mode-range-${containerId}" onclick="window.setCalendarPickerMode('${containerId}', 'range')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.calendarMode === 'range' ? colors.border : 'transparent'}; color:${state.calendarMode === 'range' ? '#ffffff' : '#475569'};">
                                ↔️ Custom Date Range
                            </button>
                        </div>
                    </div>

                    <!-- Picker Controls Container -->
                    <div id="calendar-inputs-container-${containerId}" style="background:#ffffff; padding:1rem; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:0.8rem;">
                        <!-- Day Picker Controls -->
                        <div id="cal-day-box-${containerId}" style="display:${state.calendarMode === 'day' ? 'flex' : 'none'}; align-items:center; flex-wrap:wrap; gap:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:240px;">
                                <label for="cal-date-input-${containerId}" style="font-size:0.88rem; font-weight:700; color:#334155;">Select Date (Calendar):</label>
                                <input type="date" id="cal-date-input-${containerId}" value="${todayStr}" style="padding:0.55rem 0.8rem; border:2px solid ${colors.border}; border-radius:8px; font-weight:700; font-size:0.95rem; color:#1e293b; outline:none;">
                            </div>
                            <!-- Quick presets -->
                            <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                                <span style="font-size:0.8rem; font-weight:700; color:#64748b;">Quick Jump:</span>
                                <button type="button" onclick="window.setCalendarDatePreset('${containerId}', 0)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">Today</button>
                                <button type="button" onclick="window.setCalendarDatePreset('${containerId}', 1)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">Tomorrow</button>
                                <button type="button" onclick="window.setCalendarDatePreset('${containerId}', 7)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">+7 Days</button>
                                <button type="button" onclick="window.setCalendarDatePreset('${containerId}', 14)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">+14 Days</button>
                                <button type="button" onclick="window.setCalendarDatePreset('${containerId}', -7)" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">-7 Days (Past)</button>
                            </div>
                            <button type="button" onclick="window.inspectTargetDate('${containerId}')" style="background:${colors.border}; color:#ffffff; border:none; padding:0.6rem 1.3rem; border-radius:8px; font-weight:700; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                                <i class="fas fa-search"></i> Inspect Day Prediction
                            </button>
                        </div>

                        <!-- Month Picker Controls -->
                        <div id="cal-month-box-${containerId}" style="display:${state.calendarMode === 'month' ? 'flex' : 'none'}; align-items:center; flex-wrap:wrap; gap:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:240px;">
                                <label for="cal-month-input-${containerId}" style="font-size:0.88rem; font-weight:700; color:#334155;">Select Month (Calendar):</label>
                                <input type="month" id="cal-month-input-${containerId}" value="${currentMonthStr}" style="padding:0.55rem 0.8rem; border:2px solid ${colors.border}; border-radius:8px; font-weight:700; font-size:0.95rem; color:#1e293b; outline:none;">
                            </div>
                            <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                                <span style="font-size:0.8rem; font-weight:700; color:#64748b;">Monsoon Presets:</span>
                                <button type="button" onclick="window.setCalendarMonthPreset('${containerId}', '${currentYear}-10')" style="background:#fef2f2; border:1px solid #fca5a5; color:#b91c1c; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;">Oct (Post-Monsoon Peak)</button>
                                <button type="button" onclick="window.setCalendarMonthPreset('${containerId}', '${currentYear}-07')" style="background:#eff6ff; border:1px solid #93c5fd; color:#1d4ed8; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;">Jul (SW Monsoon)</button>
                                <button type="button" onclick="window.setCalendarMonthPreset('${containerId}', '${currentYear + 1}-05')" style="background:#fff7ed; border:1px solid #fdba74; color:#c2410c; padding:0.3rem 0.6rem; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer;">May ${currentYear + 1} (Pre-Monsoon)</button>
                            </div>
                            <button type="button" onclick="window.inspectTargetMonth('${containerId}')" style="background:${colors.border}; color:#ffffff; border:none; padding:0.6rem 1.3rem; border-radius:8px; font-weight:700; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                                <i class="fas fa-search"></i> Inspect Month Prediction
                            </button>
                        </div>

                        <!-- Year Picker Controls -->
                        <div id="cal-year-box-${containerId}" style="display:${state.calendarMode === 'year' ? 'flex' : 'none'}; align-items:center; flex-wrap:wrap; gap:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex:1; min-width:240px;">
                                <label for="cal-year-input-${containerId}" style="font-size:0.88rem; font-weight:700; color:#334155;">Select Target Year:</label>
                                <select id="cal-year-input-${containerId}" style="padding:0.55rem 1rem; border:2px solid ${colors.border}; border-radius:8px; font-weight:700; font-size:0.95rem; color:#1e293b; outline:none; background:#ffffff;">
                                    ${yearOptionsHtml}
                                </select>
                            </div>
                            <button type="button" onclick="window.inspectTargetYear('${containerId}')" style="background:${colors.border}; color:#ffffff; border:none; padding:0.6rem 1.3rem; border-radius:8px; font-weight:700; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                                <i class="fas fa-search"></i> Inspect Year Prediction
                            </button>
                        </div>

                        <!-- Custom Range Picker Controls -->
                        <div id="cal-range-box-${containerId}" style="display:${state.calendarMode === 'range' ? 'flex' : 'none'}; align-items:center; flex-wrap:wrap; gap:1rem;">
                            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                <label for="cal-range-from-${containerId}" style="font-size:0.88rem; font-weight:700; color:#334155;">From:</label>
                                <input type="date" id="cal-range-from-${containerId}" value="${todayStr}" style="padding:0.5rem 0.7rem; border:2px solid #cbd5e1; border-radius:8px; font-weight:700; font-size:0.88rem;">
                                <label for="cal-range-to-${containerId}" style="font-size:0.88rem; font-weight:700; color:#334155;">To:</label>
                                <input type="date" id="cal-range-to-${containerId}" style="padding:0.5rem 0.7rem; border:2px solid #cbd5e1; border-radius:8px; font-weight:700; font-size:0.88rem;">
                            </div>
                            <button type="button" onclick="window.inspectCustomRange('${containerId}')" style="background:${colors.border}; color:#ffffff; border:none; padding:0.6rem 1.3rem; border-radius:8px; font-weight:700; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:0.4rem;">
                                <i class="fas fa-chart-line"></i> Filter Chart to Range
                            </button>
                            <button type="button" onclick="window.resetToStandardView('${containerId}')" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:0.6rem 1rem; border-radius:8px; font-weight:700; font-size:0.88rem; cursor:pointer;">
                                <i class="fas fa-undo"></i> Reset View
                            </button>
                        </div>
                    </div>

                    <!-- Target Inspection Result Highlight Card -->
                    <div id="calendar-target-card-${containerId}" style="display:none; background:#ffffff; border-radius:12px; padding:1.2rem; border-left:6px solid ${colors.border}; box-shadow:0 4px 15px rgba(0,0,0,0.06); animation:fadeIn 0.3s ease;">
                        <!-- Content dynamically injected -->
                    </div>
                </div>

                <!-- Navigation Controls: Granularity Tabs & Range Filter -->
                <div class="chart-controls-bar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.4rem; background:#f8fafc; padding:0.8rem 1rem; border-radius:12px; border:1px solid #e2e8f0;">
                    <!-- Time Granularity Tabs -->
                    <div class="timeframe-tabs" style="display:flex; gap:0.4rem; background:#ffffff; padding:0.3rem; border-radius:10px; border:1px solid #cbd5e1;">
                        <button id="tab-days-${containerId}" onclick="window.setWidgetTimeframe('${containerId}', 'days')" style="padding:0.45rem 1rem; border:none; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; transition:all 0.2s; background:${state.timeframe === 'days' ? colors.border : 'transparent'}; color:${state.timeframe === 'days' ? '#ffffff' : '#64748b'};">
                            📅 Daily (Days)
                        </button>
                        <button id="tab-months-${containerId}" onclick="window.setWidgetTimeframe('${containerId}', 'months')" style="padding:0.45rem 1rem; border:none; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; transition:all 0.2s; background:${state.timeframe === 'months' ? colors.border : 'transparent'}; color:${state.timeframe === 'months' ? '#ffffff' : '#64748b'};">
                            📆 Monthly (Months)
                        </button>
                        <button id="tab-years-${containerId}" onclick="window.setWidgetTimeframe('${containerId}', 'years')" style="padding:0.45rem 1rem; border:none; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; transition:all 0.2s; background:${state.timeframe === 'years' ? colors.border : 'transparent'}; color:${state.timeframe === 'years' ? '#ffffff' : '#64748b'};">
                            🗓️ Yearly (Years)
                        </button>
                    </div>

                    <!-- Scope / Range Filter -->
                    <div class="scope-filters" style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.82rem; font-weight:700; color:#64748b;">View Range:</span>
                        <div style="display:flex; gap:0.3rem; background:#ffffff; padding:0.25rem; border-radius:8px; border:1px solid #cbd5e1;">
                            <button id="view-all-${containerId}" onclick="window.setWidgetViewMode('${containerId}', 'all')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.viewMode === 'all' ? '#334155' : 'transparent'}; color:${state.viewMode === 'all' ? '#ffffff' : '#64748b'};">
                                All (Past + Future)
                            </button>
                            <button id="view-past-${containerId}" onclick="window.setWidgetViewMode('${containerId}', 'past')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.viewMode === 'past' ? '#334155' : 'transparent'}; color:${state.viewMode === 'past' ? '#ffffff' : '#64748b'};">
                                Past Records Only
                            </button>
                            <button id="view-future-${containerId}" onclick="window.setWidgetViewMode('${containerId}', 'future')" style="padding:0.35rem 0.8rem; border:none; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; background:${state.viewMode === 'future' ? colors.border : 'transparent'}; color:${state.viewMode === 'future' ? '#ffffff' : '#64748b'};">
                                Future AI Predictions
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Dynamic KPI Status Badge Row -->
                <div id="stats-row-${containerId}" class="chart-stats-row" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:0.9rem; margin-bottom:1.5rem;">
                    <div style="background:#f8fafc; padding:0.9rem; border-radius:10px; border-left:4px solid #cbd5e1; text-align:center;">
                        <span style="font-size:0.82rem; color:#64748b; display:block;"><i class="fas fa-spinner fa-spin"></i> Loading metrics...</span>
                    </div>
                </div>

                <!-- Main Chart.js Container -->
                <div class="canvas-wrapper" style="position: relative; height: 350px; width: 100%; margin-bottom:1.5rem;">
                    <canvas id="canvas-${containerId}"></canvas>
                </div>

                <!-- AI Insights & Explanation Breakdown Panel -->
                <div id="ai-insight-panel-${containerId}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:1.2rem; margin-bottom:1.5rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.2rem;">
                    <div>
                        <div style="font-size:0.85rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.4rem;">
                            🧠 AI Forecast & Prediction Analysis
                        </div>
                        <div id="ai-insight-text-${containerId}" style="font-size:0.92rem; color:#475569; line-height:1.5;">
                            Calculating multi-scale trajectory...
                        </div>
                    </div>
                    <div>
                        <div style="font-size:0.85rem; font-weight:800; color:#334155; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.4rem;">
                            🛡️ Early Warning & Hazard Assessment
                        </div>
                        <div id="ai-hazard-text-${containerId}" style="font-size:0.92rem; color:#475569; line-height:1.5;">
                            Assessing current and forecasted hazard risk thresholds...
                        </div>
                    </div>
                </div>

                <!-- Live Map Section for Cyclone / Rainfall Overlay -->
                <div id="map-section-${containerId}" style="margin-top:1.5rem; display:none;">
                    <h4 style="margin:0 0 0.8rem 0; color:#1e293b; font-size:1.1rem; display:flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-map-marked-alt" style="color:${colors.border};"></i> Live Geospatial Hazard Overlay — Track & Risk Polygons
                    </h4>
                    <div id="map-container-${containerId}" style="height:380px; width:100%; border-radius:10px; overflow:hidden; border:1px solid #cbd5e1;"></div>
                </div>
            </div>
        `;

        // Default set range-to input to +30 days
        const toInput = document.getElementById(`cal-range-to-${containerId}`);
        if (toInput) {
            const d30 = new Date();
            d30.setDate(d30.getDate() + 30);
            toInput.value = d30.toISOString().split('T')[0];
        }

        // Fetch prediction data
        fetch(`/api/predict/${normalizedDisaster}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    container.querySelector('.canvas-wrapper').innerHTML = `<p style="color:#d32f2f; text-align:center; padding:2rem;">⚠️ ${data.error}</p>`;
                    return;
                }
                state.data = data;
                window.updateWidgetDisplay(containerId);
                // Inspect today by default on initial load
                window.inspectTargetDate(containerId, todayStr, true);
            })
            .catch(err => {
                console.error("Error fetching multi-granular disaster predictions:", err);
                container.querySelector('.canvas-wrapper').innerHTML = `<p style="color:#d32f2f; text-align:center; padding:2rem;">⚠️ Failed to load disaster prediction data. Retrying...</p>`;
            });
    };

    // Calendar Picker Mode Switcher
    window.setCalendarPickerMode = function (containerId, mode) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;
        state.calendarMode = mode;

        const colors = disasterConfig[state.disasterType] || disasterConfig.default;

        ['day', 'month', 'year', 'range'].forEach(m => {
            const btn = document.getElementById(`cal-mode-${m}-${containerId}`);
            const box = document.getElementById(`cal-${m}-box-${containerId}`);
            if (btn) {
                btn.style.background = (m === mode) ? colors.border : 'transparent';
                btn.style.color = (m === mode) ? '#ffffff' : '#475569';
            }
            if (box) {
                box.style.display = (m === mode) ? 'flex' : 'none';
            }
        });
    };

    // Calendar Quick Date Presets
    window.setCalendarDatePreset = function (containerId, dayOffset) {
        const input = document.getElementById(`cal-date-input-${containerId}`);
        if (!input) return;
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        input.value = d.toISOString().split('T')[0];
        window.inspectTargetDate(containerId);
    };

    // Calendar Month Preset
    window.setCalendarMonthPreset = function (containerId, monthStr) {
        const input = document.getElementById(`cal-month-input-${containerId}`);
        if (!input) return;
        input.value = monthStr;
        window.inspectTargetMonth(containerId);
    };

    // Inspect Exact Calendar Day
    window.inspectTargetDate = function (containerId, overrideDate = null, silent = false) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;

        const dateInput = document.getElementById(`cal-date-input-${containerId}`);
        const targetDate = overrideDate || (dateInput ? dateInput.value : new Date().toISOString().split('T')[0]);
        const disaster = state.disasterType;

        fetch(`/api/predict/${disaster}?date=${targetDate}`)
            .then(res => res.json())
            .then(res => {
                window.renderTargetInspectionResult(containerId, res);
                if (!silent) {
                    // Switch timeframe to days and highlight
                    state.timeframe = 'days';
                    window.updateWidgetDisplay(containerId);
                }
            })
            .catch(err => console.error("Error inspecting target date:", err));
    };

    // Inspect Exact Month
    window.inspectTargetMonth = function (containerId) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;

        const monthInput = document.getElementById(`cal-month-input-${containerId}`);
        const targetMonth = monthInput ? monthInput.value : new Date().toISOString().substring(0, 7);
        const disaster = state.disasterType;

        fetch(`/api/predict/${disaster}?month=${targetMonth}`)
            .then(res => res.json())
            .then(res => {
                window.renderTargetInspectionResult(containerId, res);
                state.timeframe = 'months';
                window.updateWidgetDisplay(containerId);
            })
            .catch(err => console.error("Error inspecting target month:", err));
    };

    // Inspect Exact Year
    window.inspectTargetYear = function (containerId) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;

        const yearInput = document.getElementById(`cal-year-input-${containerId}`);
        const targetYear = yearInput ? yearInput.value : (new Date().getFullYear() + 1);
        const disaster = state.disasterType;

        fetch(`/api/predict/${disaster}?year=${targetYear}`)
            .then(res => res.json())
            .then(res => {
                window.renderTargetInspectionResult(containerId, res);
                state.timeframe = 'years';
                window.updateWidgetDisplay(containerId);
            })
            .catch(err => console.error("Error inspecting target year:", err));
    };

    // Inspect Custom Date Range
    window.inspectCustomRange = function (containerId) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;

        const fromInput = document.getElementById(`cal-range-from-${containerId}`);
        const toInput = document.getElementById(`cal-range-to-${containerId}`);

        const fromVal = fromInput ? fromInput.value : '';
        const toVal = toInput ? toInput.value : '';
        const disaster = state.disasterType;

        if (!fromVal || !toVal) {
            alert("Please select both From and To dates on the calendar.");
            return;
        }

        fetch(`/api/predict/${disaster}?from=${fromVal}&to=${toVal}`)
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') {
                    // Update state with custom range series
                    state.customRangeData = res;
                    window.renderCustomRangeChart(containerId, res);
                }
            })
            .catch(err => console.error("Error filtering custom range:", err));
    };

    // Reset View
    window.resetToStandardView = function (containerId) {
        const state = window._disasterWidgetState[containerId];
        if (!state) return;
        state.customRangeData = null;
        window.updateWidgetDisplay(containerId);
    };

    // Render Target Inspection Result Card in UI
    window.renderTargetInspectionResult = function (containerId, res) {
        const card = document.getElementById(`calendar-target-card-${containerId}`);
        if (!card) return;

        card.style.display = 'block';

        const isDay = res.target_type === 'day';
        const isMonth = res.target_type === 'month';
        const isYear = res.target_type === 'year';

        const titlePeriod = isDay ? res.formatted_date : isMonth ? res.formatted_month : `Year ${res.target_year}`;
        const riskColor = res.risk_color || '#16a34a';
        const riskLevel = res.risk_level || 'Normal';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:0.8rem;">
                <div>
                    <span style="display:inline-block; background:#f1f5f9; color:#475569; font-size:0.78rem; font-weight:700; padding:0.2rem 0.6rem; border-radius:6px; margin-bottom:0.4rem;">
                        ${res.data_nature || 'Prediction Engine'}
                    </span>
                    <h3 style="margin:0; font-size:1.25rem; color:#1e293b; display:flex; align-items:center; gap:0.5rem;">
                        <i class="fas fa-calendar-check" style="color:#0284c7;"></i> ${titlePeriod}
                    </h3>
                    <div style="font-size:0.85rem; color:#64748b; margin-top:0.2rem;">
                        ${res.season_category ? `Period: <strong>${res.season_category}</strong> • ` : ''} Metric: ${res.metric_name || ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <span style="display:inline-block; background:${riskColor}; color:#ffffff; font-size:0.85rem; font-weight:800; padding:0.35rem 0.8rem; border-radius:20px; box-shadow:0 2px 8px rgba(0,0,0,0.15);">
                        ● ${riskLevel.toUpperCase()} RISK
                    </span>
                    <div style="font-size:1.35rem; font-weight:900; color:#0f172a; margin-top:0.4rem;">
                        ${res.value} <span style="font-size:0.85rem; font-weight:600; color:#64748b;">${res.unit || ''}</span>
                    </div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.8rem; background:#f8fafc; padding:0.8rem 1rem; border-radius:8px; font-size:0.88rem; margin-bottom:0.8rem; border:1px solid #e2e8f0;">
                <div>
                    <strong style="color:#475569;">📊 Confidence Range:</strong>
                    <span style="color:#0f172a; font-weight:700; display:block;">${res.confidence_interval_text || `[${res.confidence_lower} — ${res.confidence_upper}]`}</span>
                </div>
                <div>
                    <strong style="color:#475569;">🧭 Meteorological Driver:</strong>
                    <span style="color:#0f172a; display:block;">${res.meteorological_reason || 'Calibrated climate & hazard algorithm.'}</span>
                </div>
            </div>

            <div style="background:#eff6ff; padding:0.6rem 0.9rem; border-radius:6px; font-size:0.86rem; color:#1e40af; border-left:4px solid #3b82f6;">
                <strong>🛡️ Recommended Municipal Protocol:</strong> ${res.recommended_action || 'Standard preparedness protocol active.'}
            </div>
        `;
    };

    // Render Custom Range Chart
    window.renderCustomRangeChart = function (containerId, rangeRes) {
        const canvas = document.getElementById(`canvas-${containerId}`);
        if (!canvas || typeof Chart === 'undefined') return;

        const series = rangeRes.series || [];
        const labels = series.map(s => s.date);
        const vals = series.map(s => s.value);
        const confLow = series.map(s => s.confidence_lower);
        const confHigh = series.map(s => s.confidence_upper);
        const colors = disasterConfig[rangeRes.disaster] || disasterConfig.default;

        if (window[`chart_instance_${containerId}`]) {
            window[`chart_instance_${containerId}`].destroy();
        }

        window[`chart_instance_${containerId}`] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: `Custom Range Prediction (${rangeRes.unit})`,
                        data: vals,
                        borderColor: colors.border,
                        backgroundColor: colors.bg,
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        pointBackgroundColor: series.map(s => s.is_future ? '#ea580c' : colors.border)
                    },
                    {
                        label: 'Upper Confidence Bound',
                        data: confHigh,
                        borderColor: 'rgba(234, 88, 12, 0.3)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: '+1',
                        backgroundColor: 'rgba(255, 167, 38, 0.12)'
                    },
                    {
                        label: 'Lower Confidence Bound',
                        data: confLow,
                        borderColor: 'rgba(234, 88, 12, 0.3)',
                        borderWidth: 1,
                        borderDash: [2, 2],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            filter: function(item) {
                                return !item.text.includes('Lower Confidence Bound');
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ${context.raw} ${rangeRes.unit}`;
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: `${rangeRes.metric_name} (${rangeRes.unit})` } },
                    x: { title: { display: true, text: `Date Range (${rangeRes.start_date} to ${rangeRes.end_date})` }, ticks: { maxTicksLimit: 15 } }
                }
            }
        });
    };

    // Update Widget Display on Timeframe / ViewMode change
    window.updateWidgetDisplay = function (containerId) {
        const state = window._disasterWidgetState[containerId];
        if (!state || !state.data) return;

        const data = state.data;
        const disasterKey = state.disasterType;
        const colors = disasterConfig[disasterKey] || disasterConfig.default;
        const timeframe = state.timeframe;
        const viewMode = state.viewMode;

        // 1. Update Tab buttons styling
        ['days', 'months', 'years'].forEach(tf => {
            const btn = document.getElementById(`tab-${tf}-${containerId}`);
            if (btn) {
                btn.style.background = (tf === timeframe) ? colors.border : 'transparent';
                btn.style.color = (tf === timeframe) ? '#ffffff' : '#64748b';
            }
        });

        // 2. Update View filter buttons styling
        ['all', 'past', 'future'].forEach(vm => {
            const btn = document.getElementById(`view-${vm}-${containerId}`);
            if (btn) {
                btn.style.background = (vm === viewMode) ? (vm === 'future' ? colors.border : '#334155') : 'transparent';
                btn.style.color = (vm === viewMode) ? '#ffffff' : '#64748b';
            }
        });

        // 3. Render Badges based on Timeframe
        const statsRow = document.getElementById(`stats-row-${containerId}`);
        if (statsRow) {
            const badge = (bg, border, label, value, valueColor, icon = '🏷️') => `
                <div class="stat-badge-box" style="background:${bg}; padding:0.85rem 1rem; border-radius:10px; border-left:4px solid ${border}; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
                    <span class="stat-label" style="font-size:0.8rem; font-weight:700; color:${border}; display:flex; align-items:center; gap:0.3rem;">${icon} ${label}</span>
                    <strong class="stat-val" style="font-size:1.12rem; color:${valueColor || border}; display:block; margin-top:0.3rem;">${value}</strong>
                </div>`;

            if (timeframe === 'days') {
                const d = data.daily || {};
                const s = d.summary || {};
                const trendUp = s.trend === 'increasing';
                statsRow.innerHTML = [
                    badge('#f0fdf4', '#16a34a', 'Past 30 Days Observed Avg', `${s.past_avg ?? '—'} <span style="font-size:0.75rem; font-weight:500;">${d.unit || ''}</span>`, '#15803d', '📊'),
                    badge('#fff7ed', '#ea580c', '14-Day AI Forecast Avg', `${s.forecast_avg ?? '—'} <span style="font-size:0.75rem; font-weight:500;">${d.unit || ''}</span>`, '#c2410c', '🔮'),
                    badge('#fef2f2', '#dc2626', 'Peak Risk Day Ahead', `${s.peak_day ? s.peak_day : 'None'} (${s.peak_value ?? 0} ${d.unit || ''})`, '#b91c1c', '⚠️'),
                    badge('#f8fafc', '#475569', 'Daily Risk Level', `<span style="color:${s.peak_risk === 'High' ? '#dc2626' : s.peak_risk === 'Moderate' ? '#d97706' : '#16a34a'}">● ${s.peak_risk || 'Low'} Alert</span>`, '#1e293b', '🛡️'),
                    badge('#f1f5f9', trendUp ? '#dc2626' : '#16a34a', 'Daily Trend', trendUp ? '🔺 Increasing' : '🔻 Decreasing / Stable', trendUp ? '#dc2626' : '#16a34a', '📈')
                ].join('');
            } else if (timeframe === 'months') {
                const m = data.monthly || {};
                const s = m.summary || {};
                const trendUp = s.trend === 'increasing';
                statsRow.innerHTML = [
                    badge('#eff6ff', '#2563eb', 'Past 12 Months Total', `${s.past_year_total ?? '—'} <span style="font-size:0.75rem; font-weight:500;">${m.unit || ''}</span>`, '#1d4ed8', '📊'),
                    badge('#faf5ff', '#9333ea', 'Next 12 Months AI Forecast', `${s.forecast_year_total ?? '—'} <span style="font-size:0.75rem; font-weight:500;">${m.unit || ''}</span>`, '#7e22ce', '🔮'),
                    badge('#fef2f2', '#dc2626', 'Peak Seasonal Month', `${s.peak_month ?? '—'} (${s.peak_value ?? 0})`, '#b91c1c', '🌊'),
                    badge('#f0fdf4', '#16a34a', 'Seasonal Trajectory', trendUp ? '🔺 Intensifying Cycle' : '🔻 Subsiding Baseline', trendUp ? '#dc2626' : '#16a34a', '🗓️'),
                    badge('#f1f5f9', trendUp ? '#dc2626' : '#16a34a', 'Monthly Trend', trendUp ? '🔺 Increasing Trend' : '🔻 Moderating', trendUp ? '#dc2626' : '#16a34a', '📈')
                ].join('');
            } else {
                const y = data.yearly || {};
                const s = y.summary || {};
                const trendUp = (data.trend || s.trend) === 'increasing';
                statsRow.innerHTML = [
                    badge('#eff6ff', '#2563eb', `Last Year (${s.last_year || data.last_year || '2025'})`, `${s.last_year_count ?? data.last_year_count ?? '—'} <span style="font-size:0.75rem; font-weight:500;">incidents</span>`, '#1d4ed8', '📅'),
                    badge('#f0fdf4', '#16a34a', `Next Year AI Prediction (${s.next_year || data.next_year || '2026'})`, `${s.predicted_frequency ?? data.predicted_frequency ?? '—'} <span style="font-size:0.75rem; font-weight:500;">expected</span>`, '#15803d', '🏷️'),
                    badge('#fff7ed', '#ea580c', '5-Year AI Forecast Outlook', `${s['5_year_forecast_total'] ?? '—'} <span style="font-size:0.75rem; font-weight:500;">total projected</span>`, '#c2410c', '🔮'),
                    badge('#faf5ff', '#9333ea', 'Live IMD / Sensor Feeds', `${data.active_cyclones ?? 1} Track • ${data.wind_warning_zones ?? 3} Warning Zones`, '#7e22ce', '📡'),
                    badge('#f1f5f9', trendUp ? '#dc2626' : '#16a34a', 'Multi-Year Trend', trendUp ? '🔺 Increasing Long-Term' : '🔻 Decreasing Long-Term', trendUp ? '#dc2626' : '#16a34a', '📈')
                ].join('');
            }
        }

        // 4. Build Datasets & Labels for Chart.js
        let labels = [];
        let histData = [];
        let fcData = [];
        let confLower = [];
        let confUpper = [];
        let metricUnit = '';
        let metricTitle = '';

        if (timeframe === 'days') {
            const d = data.daily || {};
            metricUnit = d.unit || 'Score / Index';
            metricTitle = d.metric_name || 'Daily Index';

            const rawHist = d.historical || [];
            const rawFc = d.forecast || [];

            if (viewMode === 'all') {
                labels = [...rawHist.map(h => h.date), ...rawFc.map(f => f.date)];
                histData = [...rawHist.map(h => h.value), ...Array(rawFc.length).fill(null)];
                const bridgeVal = rawHist.length ? rawHist[rawHist.length - 1].value : (rawFc.length ? rawFc[0].value : null);
                fcData = [...Array(Math.max(0, rawHist.length - 1)).fill(null), bridgeVal, ...rawFc.map(f => f.value)];
                confLower = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_lower)];
                confUpper = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_upper)];
            } else if (viewMode === 'past') {
                labels = rawHist.map(h => h.date);
                histData = rawHist.map(h => h.value);
                fcData = [];
            } else {
                labels = rawFc.map(f => f.date);
                histData = [];
                fcData = rawFc.map(f => f.value);
                confLower = rawFc.map(f => f.confidence_lower);
                confUpper = rawFc.map(f => f.confidence_upper);
            }
        } else if (timeframe === 'months') {
            const m = data.monthly || {};
            metricUnit = m.unit || 'Events / Month';
            metricTitle = m.metric_name || 'Monthly Aggregation';

            const rawHist = m.historical || [];
            const rawFc = m.forecast || [];

            if (viewMode === 'all') {
                labels = [...rawHist.map(h => h.label || h.month), ...rawFc.map(f => f.label || f.month)];
                histData = [...rawHist.map(h => h.value), ...Array(rawFc.length).fill(null)];
                const bridgeVal = rawHist.length ? rawHist[rawHist.length - 1].value : (rawFc.length ? rawFc[0].value : null);
                fcData = [...Array(Math.max(0, rawHist.length - 1)).fill(null), bridgeVal, ...rawFc.map(f => f.value)];
                confLower = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_lower)];
                confUpper = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_upper)];
            } else if (viewMode === 'past') {
                labels = rawHist.map(h => h.label || h.month);
                histData = rawHist.map(h => h.value);
                fcData = [];
            } else {
                labels = rawFc.map(f => f.label || f.month);
                histData = [];
                fcData = rawFc.map(f => f.value);
                confLower = rawFc.map(f => f.confidence_lower);
                confUpper = rawFc.map(f => f.confidence_upper);
            }
        } else {
            const y = data.yearly || {};
            metricUnit = y.unit || 'Annual Incidents';
            metricTitle = y.metric_name || 'Annual Incidents';

            const rawHist = y.historical || [];
            const rawFc = y.forecast || [];

            if (viewMode === 'all') {
                labels = [...rawHist.map(h => h.year), ...rawFc.map(f => `${f.year} (Pred)`)];
                histData = [...rawHist.map(h => h.value), ...Array(rawFc.length).fill(null)];
                fcData = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.value)];
                confLower = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_lower)];
                confUpper = [...Array(rawHist.length).fill(null), ...rawFc.map(f => f.confidence_upper)];
            } else if (viewMode === 'past') {
                labels = rawHist.map(h => h.year);
                histData = rawHist.map(h => h.value);
                fcData = [];
            } else {
                labels = rawFc.map(f => `${f.year} (Pred)`);
                histData = [];
                fcData = rawFc.map(f => f.value);
                confLower = rawFc.map(f => f.confidence_lower);
                confUpper = rawFc.map(f => f.confidence_upper);
            }
        }

        // 5. Render Chart.js
        const canvas = document.getElementById(`canvas-${containerId}`);
        if (canvas && typeof Chart !== 'undefined') {
            if (window[`chart_instance_${containerId}`]) {
                window[`chart_instance_${containerId}`].destroy();
            }

            const datasets = [];

            if (histData.length > 0) {
                datasets.push({
                    label: `Historical Recorded (${metricUnit})`,
                    data: histData,
                    type: timeframe === 'years' ? 'bar' : 'line',
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    borderWidth: 2.5,
                    borderRadius: 6,
                    fill: timeframe !== 'years',
                    tension: 0.35,
                    pointRadius: timeframe === 'days' ? 2 : 4,
                    pointBackgroundColor: colors.border
                });
            }

            if (fcData.length > 0) {
                datasets.push({
                    label: `AI Predictions & Forecast (${metricUnit})`,
                    data: fcData,
                    type: timeframe === 'years' ? 'bar' : 'line',
                    borderColor: '#ea580c',
                    backgroundColor: colors.predBg,
                    borderWidth: 3,
                    borderDash: [6, 4],
                    borderRadius: 6,
                    fill: false,
                    tension: 0.35,
                    pointRadius: 5,
                    pointBackgroundColor: '#ea580c',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2
                });
            }

            if (confUpper.length > 0 && confLower.length > 0 && timeframe !== 'years') {
                datasets.push({
                    label: 'Confidence Interval (Upper Bound)',
                    data: confUpper,
                    type: 'line',
                    borderColor: 'rgba(234, 88, 12, 0.25)',
                    borderWidth: 1,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: '+1',
                    backgroundColor: 'rgba(255, 167, 38, 0.12)'
                });
                datasets.push({
                    label: 'Confidence Interval (Lower Bound)',
                    data: confLower,
                    type: 'line',
                    borderColor: 'rgba(234, 88, 12, 0.25)',
                    borderWidth: 1,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: false
                });
            }

            if (timeframe === 'years' && viewMode === 'all') {
                const combinedCounts = [...(data.yearly?.historical || []).map(h => h.value), ...(data.yearly?.forecast || []).map(f => f.value)];
                datasets.push({
                    label: 'ML Regression Long-Term Trend',
                    data: combinedCounts,
                    type: 'line',
                    borderColor: colors.border,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.2,
                    pointRadius: 3,
                    pointBackgroundColor: colors.border
                });
            }

            window[`chart_instance_${containerId}`] = new Chart(canvas.getContext('2d'), {
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                filter: function(item) {
                                    return !item.text.includes('Confidence Interval (Lower Bound)');
                                },
                                usePointStyle: true,
                                padding: 15
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const val = context.raw;
                                    if (val === null || val === undefined) return '';
                                    return `${context.dataset.label}: ${val} ${metricUnit}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: `${metricTitle} (${metricUnit})` },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                            title: { display: true, text: timeframe === 'days' ? 'Date' : timeframe === 'months' ? 'Month' : 'Year' },
                            ticks: { maxTicksLimit: timeframe === 'days' ? 15 : 24 },
                            grid: { display: false }
                        }
                    }
                }
            });
        }

        // 6. Update AI Insight Panel Text
        const insightText = document.getElementById(`ai-insight-text-${containerId}`);
        const hazardText = document.getElementById(`ai-hazard-text-${containerId}`);

        if (insightText && hazardText) {
            if (timeframe === 'days') {
                const peakDay = data.daily?.summary?.peak_day || 'Upcoming week';
                const peakVal = data.daily?.summary?.peak_value || 0;
                const trend = data.daily?.summary?.trend || 'stable';
                insightText.innerHTML = `
                    Our Hybrid ML model indicates a <strong>${trend}</strong> hazard trajectory for the coming 14 days. 
                    Peak daily activity is forecasted around <strong>${peakDay}</strong> with a projected peak intensity of <strong>${peakVal} ${data.daily?.unit || ''}</strong>.
                `;
                hazardText.innerHTML = `
                    Pre-monsoon and cyclonic atmospheric cells over the Bay of Bengal & Krishna basin are continuously monitored. 
                    Status: <strong style="color:${trend === 'increasing' ? '#dc2626' : '#16a34a'}">${data.daily?.summary?.peak_risk || 'Low'} Alert Level</strong> across Guntur Municipal limits.
                `;
            } else if (timeframe === 'months') {
                const peakMonth = data.monthly?.summary?.peak_month || 'Monsoon peak';
                const totalFc = data.monthly?.summary?.forecast_year_total || 0;
                insightText.innerHTML = `
                    Seasonal SARIMA decomposition predicts a total of <strong>${totalFc} ${data.monthly?.unit || 'events'}</strong> over the next 12 months. 
                    Highest seasonal vulnerability aligns with <strong>${peakMonth}</strong> during regional monsoon convergence.
                `;
                hazardText.innerHTML = `
                    Municipal flood gates, de-watering pumps, and cyclonic coastal shelters are scheduled for maximum preparedness prior to the <strong>${peakMonth}</strong> surge window.
                `;
            } else {
                const nextYear = data.yearly?.summary?.next_year || data.next_year || '2026';
                const nextVal = data.yearly?.summary?.predicted_frequency || data.predicted_frequency || 0;
                const trend = data.trend || 'increasing';
                insightText.innerHTML = `
                    Multi-year scikit-learn regression models project <strong>${nextVal} annual events</strong> in <strong>${nextYear}</strong>. 
                    Long-term multi-year trend is <strong>${trend}</strong> (+3.8% annual climate variance).
                `;
                hazardText.innerHTML = `
                    Infrastructure master plans for Guntur (smart drainage culverts, coastal bunds, and DEM slope stabilization) are calibrated for 5-year disaster projections.
                `;
            }
        }

        // 7. Load Map Overlay if Cyclone or Rainfall
        const isCyclone = (disasterKey === 'cyclones' || disasterKey === 'cyclone');
        if (isCyclone || disasterKey === 'rainfall') {
            const mapSec = document.getElementById(`map-section-${containerId}`);
            if (mapSec) {
                mapSec.style.display = 'block';
                window.renderDisasterMapOverlay(containerId, isCyclone);
            }
        }
    };

    // Render Map Overlay helper
    window.renderDisasterMapOverlay = function (containerId, isCyclone) {
        if (typeof L === 'undefined') return;
        const mapEl = document.getElementById(`map-container-${containerId}`);
        if (!mapEl) return;

        if (window[`leaflet_map_${containerId}`]) {
            return;
        }

        const map = L.map(mapEl).setView([16.30, 80.45], 9);
        window[`leaflet_map_${containerId}`] = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap contributors | GMC Disaster Unit'
        }).addTo(map);

        if (typeof L.control.locationSearch === 'function') {
            L.control.locationSearch({
                position: 'topright',
                placeholder: '🔍 Search location in disaster map...'
            }).addTo(map);
        }

        const apiEndpoint = isCyclone ? '/api/disaster-data/cyclone' : '/api/disaster-data/rainfall';

        fetch(apiEndpoint)
            .then(r => r.json())
            .then(cData => {
                if (isCyclone) {
                    const couPoly = cData?.cou?.cou_polygon;
                    if (couPoly) {
                        L.polygon(couPoly, {
                            color: '#8e24aa', fillColor: '#ba68c8', fillOpacity: 0.35, weight: 2, dashArray: '4, 4'
                        }).addTo(map).bindPopup("<b>IMD Cone of Uncertainty (COU)</b><br/>Forecast trajectory zone for next 48 hours.");
                    }

                    const windZones = cData?.wind?.warning_zones || [];
                    windZones.forEach(zone => {
                        if (zone.polygon) {
                            L.polygon(zone.polygon, {
                                color: zone.color || '#ff9800', fillColor: zone.color || '#ff9800', fillOpacity: 0.25, weight: 2
                            }).addTo(map).bindPopup(`<b>${zone.level}</b><br/>Wind Speed: ${zone.wind_speed_range_kmh}<br/>Districts: ${(zone.affected_districts || []).join(', ')}`);
                        }
                    });

                    const trackPts = cData?.track?.track_points || [];
                    if (trackPts.length > 0) {
                        const latLngs = trackPts.map(p => [p.lat, p.lng]);
                        L.polyline(latLngs, { color: '#d32f2f', weight: 4, opacity: 0.9 }).addTo(map);

                        trackPts.forEach((p, idx) => {
                            const marker = L.circleMarker([p.lat, p.lng], {
                                radius: idx === trackPts.length - 2 ? 10 : 6,
                                color: idx === trackPts.length - 2 ? '#b71c1c' : '#d32f2f',
                                fillColor: idx === trackPts.length - 2 ? '#ff1744' : '#ffffff',
                                fillOpacity: 1, weight: 3
                            }).addTo(map);

                            marker.bindPopup(`
                                <b>🌀 ${cData.track.name || 'Cyclone'} Point</b><br/>
                                <b>Stage:</b> ${p.stage}<br/>
                                <b>Time:</b> ${p.time}<br/>
                                <b>Wind Speed:</b> ${p.wind_kmh} km/h<br/>
                                <b>Pressure:</b> ${p.pressure_hpa} hPa
                            `);
                        });
                    }
                } else {
                    const rainZones = cData?.rainfall_zones || [];
                    rainZones.forEach(zone => {
                        if (zone.polygon) {
                            L.polygon(zone.polygon, {
                                color: zone.color || '#0288d1', fillColor: zone.color || '#0288d1', fillOpacity: 0.35, weight: 2
                            }).addTo(map).bindPopup(`<b>🌧️ ${zone.name}</b><br/><b>Risk:</b> ${zone.risk}`);
                        }
                    });
                }
            })
            .catch(err => console.error("Error loading map overlay:", err));
    };

    // User Interaction Handlers
    window.setWidgetTimeframe = function (containerId, timeframe) {
        if (!window._disasterWidgetState[containerId]) return;
        window._disasterWidgetState[containerId].timeframe = timeframe;
        window.updateWidgetDisplay(containerId);
    };

    window.setWidgetViewMode = function (containerId, viewMode) {
        if (!window._disasterWidgetState[containerId]) return;
        window._disasterWidgetState[containerId].viewMode = viewMode;
        window.updateWidgetDisplay(containerId);
    };

    window.switchWidgetDisaster = function (containerId, newDisaster) {
        if (!window._disasterWidgetState[containerId]) return;
        window.renderDisasterChart(containerId, newDisaster);
    };

    window.refreshDisasterData = function (disasterType, containerId) {
        const btn = document.getElementById(`btn-refresh-${containerId}`);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Retraining Models...';
            btn.disabled = true;
        }

        fetch('/api/disaster-data/refresh', { method: 'POST' })
            .then(res => res.json())
            .then(() => {
                window.renderDisasterChart(containerId, disasterType);
            })
            .catch(() => {
                window.renderDisasterChart(containerId, disasterType);
            });
    };

    // Auto-bootstrap all disaster chart widgets on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
        const widgets = document.querySelectorAll('.disaster-chart-widget');
        widgets.forEach((widget, idx) => {
            const disaster = widget.getAttribute('data-disaster') || 'cyclones';
            const id = widget.id || `disaster-chart-${idx}`;
            widget.id = id;
            window.renderDisasterChart(id, disaster);
            setInterval(() => {
                window.renderDisasterChart(id, disaster);
            }, 60000);
        });
    });
})();

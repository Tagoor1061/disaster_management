(function () {
  // Leaflet Multi-Hazard Disaster GIS Layer + Live Location Marker + Universal Citizen/Admin Tools
  // Supports Floods, Cyclones, Tsunamis, Earthquakes, Winds, Rainfall, Landslides, and Landmark Services.

  const DISASTER_META = {
    floods: { name: 'Floods', icon: '🌧️', color: '#0284c7', defaultTitle: 'Flood Risk Inundation Zone', defaultAdvisory: 'Low-lying flood vulnerability area. Water level monitoring active.' },
    cyclones: { name: 'Cyclones', icon: '🌀', color: '#ea580c', defaultTitle: 'Cyclone & Storm Surge Warning Zone', defaultAdvisory: 'Severe coastal winds & storm surge danger. Relocate to elevated cyclone shelters.' },
    tsunamis: { name: 'Tsunamis', icon: '🌊', color: '#0891b2', defaultTitle: 'Tsunami Coastal Inundation Line', defaultAdvisory: 'Immediate coastal evacuation zone. Move inland beyond high-ground boundary.' },
    earthquakes: { name: 'Earthquakes', icon: '🏚️', color: '#9333ea', defaultTitle: 'Earthquake Fault / High Seismic Risk', defaultAdvisory: 'High seismic vulnerability zone. Inspect unreinforced buildings.' },
    winds: { name: 'Severe Winds', icon: '💨', color: '#0d9488', defaultTitle: 'Gale-Force Wind Hazard Zone', defaultAdvisory: 'Extreme wind gusts > 80 km/h. Danger of falling trees and powerlines.' },
    rainfall: { name: 'Rainfall', icon: '🌧️', color: '#2563eb', defaultTitle: 'Heavy Rainfall & Cloudburst Alert', defaultAdvisory: 'Intense precipitation warning. Avoid subways, underpasses, and drains.' },
    landslides: { name: 'Landslides', icon: '⛰️', color: '#b45309', defaultTitle: 'Landslide & Slope Instability Risk', defaultAdvisory: 'Unstable hillside slope. Debris flow hazard during heavy rains.' }
  };

  function normalizeDisasterType(raw) {
    if (!raw) return 'floods';
    const clean = String(raw).trim().toLowerCase();
    if (clean === 'all') return 'all';
    const map = {
      'cyclone': 'cyclones', 'cyclones': 'cyclones',
      'flood': 'floods', 'floods': 'floods',
      'tsunami': 'tsunamis', 'tsunamis': 'tsunamis',
      'earthquake': 'earthquakes', 'earthquakes': 'earthquakes',
      'wind': 'winds', 'winds': 'winds',
      'rainfall': 'rainfall', 'rain': 'rainfall', 'rainfalls': 'rainfall',
      'landslide': 'landslides', 'landslides': 'landslides'
    };
    if (map[clean]) return map[clean];
    if (clean.includes('cyclon')) return 'cyclones';
    if (clean.includes('tsunam')) return 'tsunamis';
    if (clean.includes('earthquak')) return 'earthquakes';
    if (clean.includes('wind')) return 'winds';
    if (clean.includes('rain')) return 'rainfall';
    if (clean.includes('landslid')) return 'landslides';
    if (clean.includes('flood')) return 'floods';
    return 'floods';
  }

  const HEX_COLORS = {
    safe: '#16a34a',
    moderate: '#d97706',
    danger: '#dc2626',
    severe: '#7c3aed',
    green: '#16a34a',
    yellow: '#d97706',
    red: '#dc2626',
    purple: '#7c3aed'
  };

  function getColorByDepth(depth) {
    if (depth >= 5) return '#dc2626';      // red (high depth/high risk)
    if (depth >= 2) return '#d97706';      // yellow/amber (moderate)
    return '#16a34a';                       // green (safer)
  }

  // Enhanced GeoJSON with realistic baseline flood risk zones around Guntur
  const DEMO_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": { "depth": 6.5, "name": "Penumarru Village - High Flood Risk", "riskLevel": "High Risk", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.410, 16.298], [80.428, 16.295], [80.438, 16.300], [80.442, 16.312],
              [80.435, 16.320], [80.420, 16.325], [80.405, 16.318], [80.410, 16.298]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "depth": 6.2, "name": "Narasaraopet Area - High Risk", "riskLevel": "High Risk", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.452, 16.305], [80.472, 16.302], [80.478, 16.310], [80.480, 16.325],
              [80.468, 16.335], [80.450, 16.330], [80.448, 16.315], [80.452, 16.305]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "depth": 3.0, "name": "Guntur City Center - Moderate", "riskLevel": "Moderate Risk", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.428, 16.330], [80.450, 16.328], [80.462, 16.338], [80.458, 16.352],
              [80.440, 16.358], [80.425, 16.355], [80.422, 16.340], [80.428, 16.330]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "depth": 2.8, "name": "Pedakakani Village - Moderate", "riskLevel": "Moderate Risk", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.390, 16.308], [80.408, 16.305], [80.415, 16.315], [80.420, 16.330],
              [80.405, 16.338], [80.388, 16.332], [80.385, 16.318], [80.390, 16.308]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "depth": 0.5, "name": "Divi Bazaar - Safe Zone", "riskLevel": "Safe Zone", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.405, 16.278], [80.425, 16.275], [80.435, 16.282], [80.438, 16.295],
              [80.420, 16.298], [80.408, 16.292], [80.405, 16.278]
            ]
          ]
        }
      },
      {
        "type": "Feature",
        "properties": { "depth": 0.3, "name": "Uppal Cheruvu Hills - Safe Zone", "riskLevel": "Safe Zone", "disaster": "floods" },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [80.458, 16.345], [80.475, 16.342], [80.485, 16.350], [80.488, 16.362],
              [80.475, 16.370], [80.460, 16.365], [80.455, 16.355], [80.458, 16.345]
            ]
          ]
        }
      }
    ]
  };

  const DEFAULT_LANDMARKS = [
    { name: "Guntur Medical College & Hospital", lat: 16.3100, lng: 80.4300, type: "hospital" },
    { name: "Municipal Corporation Command HQ", lat: 16.3090, lng: 80.4380, type: "admin" },
    { name: "Guntur Railway Junction", lat: 16.3050, lng: 80.4250, type: "transport" },
    { name: "Central Market Relief Unit", lat: 16.3120, lng: 80.4400, type: "market" },
    { name: "APSRTC Bus Station", lat: 16.3150, lng: 80.4320, type: "transport" },
    { name: "Emergency Response & Police HQ", lat: 16.3080, lng: 80.4320, type: "emergency" }
  ];

  function getLandmarkIcon(type) {
    const iconColors = {
      hospital: '#e53935',
      admin: '#1976d2',
      transport: '#00897b',
      market: '#f57f17',
      emergency: '#d32f2f'
    };
    const color = iconColors[type] || '#666';

    return L.divIcon({
      className: `landmark-icon landmark-${type}`,
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          font-size: 16px;
          color: white;
          font-weight: bold;
        ">
          ${type === 'hospital' ? '🏥' : type === 'admin' ? '🏛️' : type === 'transport' ? '🚌' : type === 'market' ? '🏪' : type === 'emergency' ? '🚨' : '📍'}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  function getDisasterDivIcon(disasterType, hexColor) {
    const meta = DISASTER_META[disasterType] || { icon: '⚠️', name: 'Hazard' };
    return L.divIcon({
      className: 'disaster-div-icon',
      html: `
        <div style="
          width: 36px;
          height: 36px;
          background: #ffffff;
          border: 3px solid ${hexColor};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
          font-size: 18px;
          cursor: pointer;
          transform: translate(-50%, -50%);
        ">
          ${meta.icon}
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20]
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.L) return;
    if (!document.getElementById('map')) return;

    const center = [16.3067, 80.4360];
    const selectMode = new URLSearchParams(window.location.search).get('select') === '1';
    
    // Read initial disaster filter from URL parameter if provided
    const urlDisasterParam = new URLSearchParams(window.location.search).get('disaster');
    let currentFilter = urlDisasterParam ? normalizeDisasterType(urlDisasterParam) : 'all';

    const map = L.map('map', {
      zoomControl: true,
      zoom: 13,
      minZoom: 10,
      maxZoom: 19
    }).setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors | Suraksha Kavach Multi-Hazard GIS'
    }).addTo(map);

    // Initialize Universal Location Search for GIS Map
    if (window.initLeafletSearch) {
      window.initLeafletSearch(map, {
        mountSelector: '#viewmap-search-container',
        placeholder: '🔍 Search any city, area, ward, shelter, street, landmark, or coordinates...'
      });
    }

    // Baseline Demo Flood Risk Layer
    const demoLayerGroup = L.featureGroup().addTo(map);
    function renderDemoLayer() {
      demoLayerGroup.clearLayers();
      if (currentFilter === 'all' || currentFilter === 'floods') {
        const demoGeo = L.geoJSON(DEMO_GEOJSON, {
          style: function (feature) {
            const depth = Number(feature.properties && feature.properties.depth);
            return {
              color: 'rgba(0,0,0,0.2)',
              weight: 1,
              fillOpacity: 0.45,
              fillColor: getColorByDepth(depth)
            };
          }
        });

        demoGeo.eachLayer(function (l) {
          if (l.feature && l.feature.properties) {
            const props = l.feature.properties;
            const depth = Number(props.depth);
            const name = props.name || 'Area';
            const riskLevel = props.riskLevel || 'Unknown';

            l.bindPopup(`
              <div style="font-family: sans-serif; max-width: 220px;">
                <div style="font-weight:bold; font-size:1.05em; color:#0f172a;">🌧️ ${name}</div>
                <div style="color: #64748b; font-size:0.85em; margin: 3px 0;">Estimated Water Depth: <b>${depth} m</b></div>
                <div style="background: ${getColorByDepth(depth)}; color: white; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 4px; font-size: 11px; font-weight:bold;">
                  ${riskLevel} • Flood Inundation
                </div>
              </div>
            `);

            l.on('mouseover', function() { this.setStyle({ weight: 2.5, fillOpacity: 0.7 }); });
            l.on('mouseout', function() { this.setStyle({ weight: 1, fillOpacity: 0.45 }); });
          }
        });
        demoGeo.addTo(demoLayerGroup);
      }
    }
    renderDemoLayer();

    // Feature Groups for Server & Draft Markings
    const savedGroup = L.featureGroup().addTo(map);
    const draftGroup = L.featureGroup().addTo(map);
    let serverMarkingsData = [];

    // Global delete marking helper
    window.deleteMarking = function (markingId) {
      if (!confirm('Are you sure you want to delete this disaster indicator?')) return;
      fetch(`/api/markings/${markingId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            loadServerMarkings();
          } else {
            alert(data.message || 'Error deleting marking');
          }
        })
        .catch(err => console.error('Delete error:', err));
    };

    // Render server markings based on current filter
    function renderServerMarkings() {
      savedGroup.clearLayers();

      const activeF = normalizeDisasterType(currentFilter);
      const filtered = (activeF === 'all')
        ? serverMarkingsData
        : serverMarkingsData.filter(m => normalizeDisasterType(m.disaster_type) === activeF);

      // Update Filter Tab Count Badges
      const countMap = { floods: 0, cyclones: 0, tsunamis: 0, earthquakes: 0, winds: 0, rainfall: 0, landslides: 0 };
      serverMarkingsData.forEach(m => {
        const t = normalizeDisasterType(m.disaster_type);
        if (countMap[t] !== undefined) countMap[t]++;
      });

      Object.keys(countMap).forEach(k => {
        const el = document.getElementById(`c-count-${k}`);
        if (el) el.textContent = countMap[k];
      });
      const allCountEl = document.getElementById('c-count-all');
      if (allCountEl) allCountEl.textContent = serverMarkingsData.length;

      filtered.forEach(function (m) {
        const dType = normalizeDisasterType(m.disaster_type);
        const dMeta = DISASTER_META[dType] || { name: 'Floods', icon: '🌧️', color: '#0284c7' };
        const hex = HEX_COLORS[m.color] || HEX_COLORS[m.risk_level] || '#16a34a';
        const geo = m.geojson_data;
        let layerItem = null;

        if (m.shape_type === 'circle' && geo.center && geo.radius) {
          layerItem = L.circle(geo.center, {
            radius: geo.radius,
            color: hex,
            fillColor: hex,
            fillOpacity: 0.45,
            weight: 3
          });
        } else if (m.shape_type === 'marker' && geo) {
          const latlng = geo.center || (geo.coordinates ? [geo.coordinates[1], geo.coordinates[0]] : null);
          if (latlng) {
            layerItem = L.marker(latlng, { icon: getDisasterDivIcon(dType, hex) });
          }
        } else if (geo && (geo.type || geo.coordinates)) {
          layerItem = L.geoJSON(geo, {
            style: {
              color: hex,
              fillColor: hex,
              fillOpacity: m.shape_type === 'pencil' ? 0.25 : 0.45,
              weight: m.shape_type === 'pencil' ? 5 : 3
            }
          });
        }

        if (layerItem) {
          const badgeBg = hex;
          const riskLabel = (m.risk_level || 'safe').toUpperCase();
          const popupHTML = `
            <div style="font-family: sans-serif; min-width: 200px;">
              <div style="font-weight:bold; font-size:1.1em; color:#0f172a; display:flex; align-items:center; gap:4px;">
                ${dMeta.icon} ${m.title}
              </div>
              <div style="background:${badgeBg}; color:white; padding:2px 8px; border-radius:4px; font-weight:bold; display:inline-block; margin:6px 0; font-size:11px;">
                ${riskLabel} • ${dMeta.name}
              </div>
              ${m.description ? `<div style="font-size:12px; color:#334155; margin-bottom:6px; line-height:1.4;">${m.description}</div>` : ''}
              <div style="font-size:11px; color:#64748b;">Shape: ${m.shape_type.toUpperCase()} | By: ${m.created_by || 'Admin'}</div>
              ${window.IS_ADMIN_USER ? `<button type="button" onclick="deleteMarking(${m.id})" style="background:#dc2626; color:white; border:none; padding:4px 10px; border-radius:5px; margin-top:8px; cursor:pointer; font-size:11px; font-weight:700;">🗑️ Delete Marking</button>` : ''}
            </div>
          `;
          layerItem.bindPopup(popupHTML);
          layerItem.addTo(savedGroup);
        }
      });
    }

    // Load server-persisted markings
    function loadServerMarkings() {
      fetch('/api/markings')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success' && Array.isArray(data.markings)) {
            serverMarkingsData = data.markings;
            renderServerMarkings();
          }
        })
        .catch(err => console.error('Error loading markings:', err));
    }

    loadServerMarkings();

    // Unified Disaster Category Switcher for Citizen Tabs & Admin Toolbar
    window.applyDisasterFilter = function(filterVal) {
      currentFilter = normalizeDisasterType(filterVal);

      // Sync Citizen filter tab active classes
      document.querySelectorAll('#citizen-disaster-filter-tabs .vm-filter-tab').forEach(t => {
        const tVal = normalizeDisasterType(t.getAttribute('data-filter'));
        if (tVal === currentFilter) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      // Update Filter Badge Text
      const filterBadge = document.getElementById('vm-active-filter-badge');
      if (filterBadge) {
        const dName = currentFilter === 'all' ? 'All Hazards' : (DISASTER_META[currentFilter]?.name || currentFilter);
        filterBadge.textContent = `Showing ${dName}`;
      }

      // If Admin mode is active, sync the admin drawing toolbar as well
      if (window.IS_ADMIN_USER) {
        window.currentDisaster = (currentFilter === 'all') ? 'floods' : currentFilter;

        document.querySelectorAll('#vm-disaster-btns .vm-disaster-btn').forEach(b => {
          const bVal = normalizeDisasterType(b.getAttribute('data-disaster'));
          if (bVal === window.currentDisaster) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });

        const titleInput = document.getElementById('vm-marker-title');
        const advInput = document.getElementById('vm-marker-advisory');
        if (DISASTER_META[window.currentDisaster]) {
          const meta = DISASTER_META[window.currentDisaster];
          if (titleInput) {
            titleInput.value = `${meta.name} Risk Zone (${(window.currentTool || 'MARKER').toUpperCase()})`;
          }
          if (advInput && !advInput.value) {
            advInput.value = meta.defaultAdvisory;
          }
        }
        if (typeof window.updateDrawingStatusMessage === 'function') {
          window.updateDrawingStatusMessage();
        }
      }

      renderDemoLayer();
      renderServerMarkings();
    };

    // Citizen Multi-Hazard Filter Tabs Click Handling
    document.querySelectorAll('#citizen-disaster-filter-tabs .vm-filter-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        window.applyDisasterFilter(this.getAttribute('data-filter'));
      });
    });

    // Apply initial filter if passed in URL
    if (urlDisasterParam) {
      setTimeout(() => window.applyDisasterFilter(urlDisasterParam), 50);
    }

    // Landmarks Layer
    const landmarksLayer = L.featureGroup().addTo(map);
    DEFAULT_LANDMARKS.forEach(function(landmark) {
      const marker = L.marker([landmark.lat, landmark.lng], {
        icon: getLandmarkIcon(landmark.type),
        title: landmark.name
      }).addTo(landmarksLayer);

      marker.bindPopup(`
        <div style="font-family: sans-serif;">
          <b>${landmark.name}</b><br/>
          <small style="color: #64748b;">Lat: ${landmark.lat.toFixed(4)}, Lng: ${landmark.lng.toFixed(4)}</small>
        </div>
      `);
    });

    // Select Mode for reporting issues
    if (selectMode) {
      let selectedMarker = null;

      map.on('click', function (event) {
        if (window.IS_ADMIN_USER && window.currentTool !== 'select' && window.currentTool) {
          // Skip select mode when drawing
        } else {
          const lat = event.latlng.lat.toFixed(6);
          const lng = event.latlng.lng.toFixed(6);

          if (selectedMarker) {
            selectedMarker.setLatLng(event.latlng);
          } else {
            selectedMarker = L.marker(event.latlng, {
              icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
              })
            }).addTo(map);
          }

          selectedMarker.bindPopup(`
            <b>Selected location</b><br/>
            ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}<br/>
            <button type="button" id="confirm-map-location" style="
              background: #0284c7;
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 5px;
              font-weight: 700;
            ">Use this location</button>
          `).openPopup();

          setTimeout(function () {
            const button = document.getElementById('confirm-map-location');
            if (!button) return;
            button.addEventListener('click', function () {
              window.location.href = `/dashboard?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`;
            });
          }, 0);
        }
      });
    }

    // Live user GPS location
    let userMarker = null;
    function setUserMarker(latlng) {
      const icon = L.divIcon({
        className: 'user-live-dot',
        html: `
          <div style="
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #0284c7;
            border: 3px solid #fff;
            box-shadow: 0 0 0 4px rgba(2,132,199,0.35);
            animation: pulseGps 2s infinite;
          "></div>
          <style>
            @keyframes pulseGps {
              0% { box-shadow: 0 0 0 4px rgba(2,132,199,0.35); }
              50% { box-shadow: 0 0 0 10px rgba(2,132,199,0.15); }
              100% { box-shadow: 0 0 0 4px rgba(2,132,199,0.35); }
            }
          </style>
        `,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      if (userMarker) {
        userMarker.setLatLng(latlng);
      } else {
        userMarker = L.marker(latlng, { title: 'Your live location', icon }).addTo(map);
      }
      userMarker.bindPopup(`
        <div style="font-family: sans-serif;">
          <b>Your Live Location</b><br/>
          <small style="color:#64748b;">Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}</small>
        </div>
      `);
    }

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        function (pos) {
          setUserMarker([pos.coords.latitude, pos.coords.longitude]);
        },
        function (error) {
          console.log('Geolocation unavailable:', error.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    // =========================================================================
    // ADMIN DRAWING & MULTI-HAZARD MARKING SYSTEM (ACTIVE FOR ADMINS ON VIEWMAP)
    // =========================================================================
    if (window.IS_ADMIN_USER) {
      window.currentDisaster = normalizeDisasterType(currentFilter === 'all' ? 'floods' : currentFilter);
      window.currentTool = 'marker';
      window.currentRisk = 'safe';
      window.currentColor = 'green';
      window.currentHex = '#16a34a';

      let unsavedMarkings = [];
      let isMouseDown = false;
      let activeLayer = null;
      let pencilPoints = [];
      let startLatLng = null;
      let polyPoints = [];
      let polyPreview = null;

      const statusEl = document.getElementById('drawing-status');

      window.updateDrawingStatusMessage = function() {
        if (!statusEl) return;
        const normD = normalizeDisasterType(window.currentDisaster);
        const dMeta = DISASTER_META[normD] || { name: 'Floods', icon: '🌧️' };
        let toolDesc = '';
        switch (window.currentTool) {
          case 'marker': toolDesc = '📍 <b>Marker Pin:</b> Click on map to place indicator pin.'; break;
          case 'pencil': toolDesc = '✏️ <b>Pencil Mode:</b> Click & drag cursor on map to draw freehand hazard line.'; break;
          case 'circle': toolDesc = '⭕ <b>Circle Mode:</b> Click & drag on map to expand danger circle.'; break;
          case 'rectangle': toolDesc = '⬛ <b>Rectangle Mode:</b> Click & drag on map to draw sector box.'; break;
          case 'polygon': toolDesc = '⬡ <b>Polygon Mode:</b> Click sequential points on map to build custom polygon. Double-click to finish.'; break;
          case 'eraser': toolDesc = '🧹 <b>Eraser Mode:</b> Click any drawn shape or marker to remove it.'; break;
        }

        statusEl.innerHTML = `${toolDesc} Hazard: <strong>${dMeta.icon} ${dMeta.name}</strong> | Risk: <strong style="color:${window.currentHex}">${window.currentRisk.toUpperCase()}</strong>. Unsaved shapes: <strong>${unsavedMarkings.length}</strong>.`;
      };

      // Disaster Selector Buttons in Admin Toolbar
      document.querySelectorAll('#vm-disaster-btns .vm-disaster-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const chosen = this.getAttribute('data-disaster');
          if (typeof window.applyDisasterFilter === 'function') {
            window.applyDisasterFilter(chosen);
          }
        });
      });

      // Tool Switch Buttons
      document.querySelectorAll('.tool-buttons .tool-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.tool-buttons .tool-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          window.currentTool = this.getAttribute('data-tool');

          if (polyPreview) {
            draftGroup.removeLayer(polyPreview);
            polyPreview = null;
          }
          polyPoints = [];

          const titleInput = document.getElementById('vm-marker-title');
          const normD = normalizeDisasterType(window.currentDisaster);
          if (titleInput && DISASTER_META[normD]) {
            titleInput.value = `${DISASTER_META[normD].name} Risk Zone (${window.currentTool.toUpperCase()})`;
          }

          window.updateDrawingStatusMessage();
        });
      });

      // Color / Risk Buttons
      document.querySelectorAll('.color-buttons .color-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          document.querySelectorAll('.color-buttons .color-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          window.currentRisk = this.getAttribute('data-risk');
          window.currentColor = this.getAttribute('data-color');
          window.currentHex = this.getAttribute('data-hex');
          window.updateDrawingStatusMessage();
        });
      });

      // Add Draft Marking Helper
      function addDraftItem(shapeType, geoData, layer) {
        const titleInput = document.getElementById('vm-marker-title');
        const advInput = document.getElementById('vm-marker-advisory');
        
        let dType = normalizeDisasterType(window.currentDisaster || currentFilter || 'floods');
        if (dType === 'all') {
          const t = (titleInput && titleInput.value) ? titleInput.value : '';
          dType = normalizeDisasterType(t, 'floods');
        }
        const dMeta = DISASTER_META[dType] || { name: 'Floods', icon: '🌧️' };

        const title = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : `${dMeta.name} Risk Zone`;
        const advisory = (advInput && advInput.value.trim()) ? advInput.value.trim() : dMeta.defaultAdvisory;

        const item = {
          disaster_type: dType,
          title: title,
          description: advisory,
          risk_level: window.currentRisk,
          color: window.currentColor,
          shape_type: shapeType,
          geojson_data: geoData,
          layer: layer
        };

        const badgeBg = window.currentHex;
        const riskLabel = window.currentRisk.toUpperCase();

        layer.bindPopup(`
          <div style="font-family: sans-serif; min-width: 180px;">
            <div style="font-weight:bold; font-size:1.1em; color:#0f172a; display:flex; align-items:center; gap:4px;">
              ${dMeta.icon} ${title} <span style="font-size:0.75em; color:#e65100;">[Draft]</span>
            </div>
            <div style="background:${badgeBg}; color:white; padding:2px 8px; border-radius:4px; font-weight:bold; display:inline-block; margin:5px 0; font-size:11px;">
              ${riskLabel} • ${dMeta.name}
            </div>
            ${advisory ? `<div style="font-size:12px; color:#334155; margin-bottom:6px; line-height:1.4;">${advisory}</div>` : ''}
            <div style="color:#e65100; font-size:11px; font-weight:600;">⚠️ Click "Save All Markings" to commit</div>
          </div>
        `);

        layer.on('click', function (e) {
          if (window.currentTool === 'eraser') {
            L.DomEvent.stopPropagation(e);
            draftGroup.removeLayer(layer);
            unsavedMarkings = unsavedMarkings.filter(m => m.layer !== layer);
            window.updateDrawingStatusMessage();
          }
        });

        unsavedMarkings.push(item);
        window.updateDrawingStatusMessage();
      }

      // Map Drawing Event Handlers
      map.on('mousedown', function (e) {
        if (window.currentTool === 'eraser' || window.currentTool === 'marker' || window.currentTool === 'polygon') return;
        isMouseDown = true;
        startLatLng = e.latlng;

        if (window.currentTool === 'pencil') {
          map.dragging.disable();
          pencilPoints = [e.latlng];
          activeLayer = L.polyline(pencilPoints, {
            color: window.currentHex,
            weight: 5,
            opacity: 0.85
          }).addTo(draftGroup);
        } else if (window.currentTool === 'circle') {
          map.dragging.disable();
          activeLayer = L.circle(startLatLng, {
            radius: 1,
            color: window.currentHex,
            fillColor: window.currentHex,
            fillOpacity: 0.45,
            weight: 2
          }).addTo(draftGroup);
        } else if (window.currentTool === 'rectangle') {
          map.dragging.disable();
          activeLayer = L.rectangle([startLatLng, startLatLng], {
            color: window.currentHex,
            fillColor: window.currentHex,
            fillOpacity: 0.45,
            weight: 2
          }).addTo(draftGroup);
        }
      });

      map.on('mousemove', function (e) {
        if (!isMouseDown) return;

        if (window.currentTool === 'pencil' && activeLayer) {
          pencilPoints.push(e.latlng);
          activeLayer.setLatLngs(pencilPoints);
        } else if (window.currentTool === 'circle' && activeLayer) {
          const radius = startLatLng.distanceTo(e.latlng);
          activeLayer.setRadius(radius);
        } else if (window.currentTool === 'rectangle' && activeLayer) {
          activeLayer.setBounds(L.latLngBounds(startLatLng, e.latlng));
        }
      });

      map.on('mouseup', function (e) {
        if (!isMouseDown) return;
        isMouseDown = false;
        map.dragging.enable();

        if (window.currentTool === 'pencil' && activeLayer) {
          if (pencilPoints.length > 1) {
            addDraftItem('pencil', activeLayer.toGeoJSON(), activeLayer);
          } else {
            draftGroup.removeLayer(activeLayer);
          }
        } else if (window.currentTool === 'circle' && activeLayer) {
          if (activeLayer.getRadius() > 5) {
            const geoData = {
              type: 'Circle',
              center: [startLatLng.lat, startLatLng.lng],
              radius: activeLayer.getRadius()
            };
            addDraftItem('circle', geoData, activeLayer);
          } else {
            draftGroup.removeLayer(activeLayer);
          }
        } else if (window.currentTool === 'rectangle' && activeLayer) {
          addDraftItem('rectangle', activeLayer.toGeoJSON(), activeLayer);
        }

        activeLayer = null;
      });

      // Map Click Handler for Marker & Polygon
      map.on('click', function (e) {
        if (window.currentTool === 'marker') {
          const dType = normalizeDisasterType(window.currentDisaster || currentFilter || 'floods');
          const finalType = dType === 'all' ? 'floods' : dType;
          const markerLayer = L.marker(e.latlng, {
            icon: getDisasterDivIcon(finalType, window.currentHex)
          }).addTo(draftGroup);

          const geoData = {
            type: 'Point',
            coordinates: [e.latlng.lng, e.latlng.lat],
            center: [e.latlng.lat, e.latlng.lng]
          };
          addDraftItem('marker', geoData, markerLayer);
        } else if (window.currentTool === 'polygon') {
          polyPoints.push(e.latlng);
          if (!polyPreview) {
            polyPreview = L.polygon(polyPoints, {
              color: window.currentHex,
              fillColor: window.currentHex,
              fillOpacity: 0.45,
              weight: 2
            }).addTo(draftGroup);
          } else {
            polyPreview.setLatLngs(polyPoints);
          }
        }
      });

      // Polygon Double Click Finish
      map.on('dblclick', function (e) {
        if (window.currentTool === 'polygon' && polyPoints.length >= 3 && polyPreview) {
          L.DomEvent.stopPropagation(e);
          addDraftItem('polygon', polyPreview.toGeoJSON(), polyPreview);
          polyPreview = null;
          polyPoints = [];
        }
      });

      // Erase saved layers on click when Eraser active
      savedGroup.on('layeradd', function (e) {
        const layer = e.layer;
        layer.on('click', function (ev) {
          if (window.currentTool === 'eraser') {
            L.DomEvent.stopPropagation(ev);
            const popupContent = layer.getPopup() ? layer.getPopup().getContent() : '';
            const match = typeof popupContent === 'string' && popupContent.match(/deleteMarking\((\d+)\)/);
            if (match && match[1]) {
              window.deleteMarking(match[1]);
            }
          }
        });
      });

      // Save All Markings Button
      const saveBtn = document.getElementById('save-markings-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          if (unsavedMarkings.length === 0) {
            alert('No draft markings to save! Use Marker, Circle, Pencil, Rectangle, or Polygon to draw first.');
            return;
          }

          const payload = unsavedMarkings.map(item => ({
            disaster_type: normalizeDisasterType(item.disaster_type),
            title: item.title,
            description: item.description,
            risk_level: item.risk_level,
            color: item.color,
            shape_type: item.shape_type,
            geojson_data: item.geojson_data
          }));

          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

          fetch('/api/markings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markings: payload })
          })
            .then(res => res.json())
            .then(data => {
              saveBtn.disabled = false;
              saveBtn.innerHTML = '💾 Save All Markings';
              if (data.status === 'success') {
                alert(`✅ Successfully saved ${payload.length} disaster marking(s) to database!`);
                draftGroup.clearLayers();
                unsavedMarkings = [];
                loadServerMarkings();
                window.updateDrawingStatusMessage();
              } else {
                alert(data.message || 'Error saving markings');
              }
            })
            .catch(err => {
              saveBtn.disabled = false;
              saveBtn.innerHTML = '💾 Save All Markings';
              console.error('Save error:', err);
            });
        });
      }

      // Clear Draft Button
      const clearDraftBtn = document.getElementById('clear-draft-btn');
      if (clearDraftBtn) {
        clearDraftBtn.addEventListener('click', function () {
          draftGroup.clearLayers();
          unsavedMarkings = [];
          if (polyPreview) polyPreview = null;
          polyPoints = [];
          window.updateDrawingStatusMessage();
        });
      }

      // Delete Filtered DB Markings Button
      const deleteDbBtn = document.getElementById('delete-all-db-btn');
      if (deleteDbBtn) {
        deleteDbBtn.addEventListener('click', function () {
          const targetDisaster = normalizeDisasterType(currentFilter);
          const targetName = targetDisaster === 'all' ? 'ALL natural disasters' : (DISASTER_META[targetDisaster]?.name || targetDisaster);
          if (!confirm(`🚨 Are you sure you want to delete all saved markings for ${targetName.toUpperCase()} from the database?`)) return;

          const url = targetDisaster === 'all' ? '/api/markings/clear' : `/api/markings/clear?disaster=${targetDisaster}`;
          fetch(url, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
              if (data.status === 'success') {
                alert(`✅ ${data.message}`);
                loadServerMarkings();
              } else {
                alert(data.message || 'Error clearing markings');
              }
            })
            .catch(err => console.error('Clear error:', err));
        });
      }

      window.updateDrawingStatusMessage();
    }

    // Keyboard Zoom Shortcuts
    document.addEventListener('keydown', function(e) {
      if (e.key === '+' || e.key === '=') {
        map.zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        map.zoomOut();
      }
    });
  });
})();

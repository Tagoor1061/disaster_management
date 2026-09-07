/**
 * Universal Leaflet Map Location Search Controller for Suraksha Kavach
 * Supports:
 * - Real-time worldwide / regional location geocoding via OpenStreetMap Nominatim
 * - Direct coordinate parsing (e.g., "16.3067, 80.4365")
 * - Autocomplete dropdown with categorization, address details, and pin jumping
 * - Integration with form pickers (updating lat/lng inputs & draggable markers)
 * - Standard Leaflet Control (L.Control.LocationSearch)
 */

(function () {
    if (typeof window === 'undefined') return;

    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
    const searchCache = new Map();

    /**
     * Perform geocode search via Nominatim with caching
     */
    async function searchLocations(query) {
        const cleanQuery = query.trim();
        if (!cleanQuery) return [];

        // Check if raw coordinates: "16.3067, 80.4365" or "16.3067 80.4365"
        const coordMatch = cleanQuery.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lon = parseFloat(coordMatch[2]);
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                return [{
                    display_name: `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                    lat: lat.toString(),
                    lon: lon.toString(),
                    type: 'coordinate',
                    address: { city: 'Direct Coordinate Input' }
                }];
            }
        }

        if (searchCache.has(cleanQuery.toLowerCase())) {
            return searchCache.get(cleanQuery.toLowerCase());
        }

        try {
            const url = `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(cleanQuery)}&addressdetails=1&limit=8`;
            const res = await fetch(url, {
                headers: { 'Accept-Language': 'en' }
            });
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            searchCache.set(cleanQuery.toLowerCase(), data);
            return data;
        } catch (err) {
            console.warn('Geocoding search error:', err);
            return [];
        }
    }

    /**
     * Create search control elements
     */
    function buildSearchBoxUI(options) {
        const { placeholder, onSelect, map, setLocationFn } = options;

        const container = document.createElement('div');
        container.className = 'leaflet-location-search-box';

        container.innerHTML = `
            <div class="search-input-wrap">
                <i class="fas fa-search search-icon"></i>
                <input type="text" class="map-search-input" placeholder="${placeholder || 'Search any location, city, area, landmark, or lat,lng...'}" autocomplete="off" spellcheck="false">
                <button type="button" class="map-search-clear-btn" title="Clear search" style="display:none;">&times;</button>
                <div class="map-search-spinner" style="display:none;"></div>
            </div>
            <div class="map-search-results" style="display:none;"></div>
        `;

        const input = container.querySelector('.map-search-input');
        const clearBtn = container.querySelector('.map-search-clear-btn');
        const spinner = container.querySelector('.map-search-spinner');
        const resultsBox = container.querySelector('.map-search-results');

        let debounceTimer = null;
        let activeResults = [];
        let selectedIndex = -1;
        let searchMarker = null;

        function showSpinner(show) {
            if (spinner) spinner.style.display = show ? 'block' : 'none';
        }

        function clearResults() {
            resultsBox.innerHTML = '';
            resultsBox.style.display = 'none';
            selectedIndex = -1;
        }

        function renderResults(results) {
            activeResults = results;
            resultsBox.innerHTML = '';
            selectedIndex = -1;

            if (!results || results.length === 0) {
                resultsBox.innerHTML = `
                    <div class="search-no-results">
                        <i class="fas fa-map-marker-alt"></i> No locations found. Try a different place name or coordinates.
                    </div>
                `;
                resultsBox.style.display = 'block';
                return;
            }

            results.forEach((item, index) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'search-result-item';
                itemEl.dataset.index = index;

                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);
                const isCoord = item.type === 'coordinate';

                let title = item.display_name.split(',')[0];
                let subtext = item.display_name.split(',').slice(1).join(',').trim();
                if (isCoord) {
                    title = item.display_name;
                    subtext = 'Direct Geodetic Coordinates';
                }

                itemEl.innerHTML = `
                    <div class="result-icon">
                        <i class="fas ${isCoord ? 'fa-crosshairs' : 'fa-map-marker-alt'}"></i>
                    </div>
                    <div class="result-details">
                        <div class="result-title">${title}</div>
                        <div class="result-subtext">${subtext || item.display_name}</div>
                        <div class="result-coords">📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
                    </div>
                `;

                itemEl.addEventListener('click', () => {
                    selectLocation(item);
                });

                resultsBox.appendChild(itemEl);
            });

            resultsBox.style.display = 'block';
        }

        function selectLocation(item) {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            const latlng = L.latLng(lat, lon);

            input.value = item.display_name.split(',')[0] || item.display_name;
            clearBtn.style.display = 'block';
            clearResults();

            if (map) {
                map.flyTo(latlng, Math.max(map.getZoom(), 16), {
                    animate: true,
                    duration: 1.2
                });
            }

            if (typeof onSelect === 'function') {
                onSelect({
                    lat,
                    lng: lon,
                    latlng,
                    displayName: item.display_name,
                    raw: item
                }, map);
            } else if (setLocationFn) {
                setLocationFn(latlng, item.display_name);
            } else {
                // Default behavior: add a highlight pin
                if (searchMarker && map) {
                    map.removeLayer(searchMarker);
                }
                if (map) {
                    searchMarker = L.marker(latlng).addTo(map)
                        .bindPopup(`<b>📍 ${item.display_name.split(',')[0]}</b><br><small style="color:#555;">${item.display_name}</small><br><strong style="color:#1976d2;">Coords: ${lat.toFixed(5)}, ${lon.toFixed(5)}</strong>`)
                        .openPopup();
                }
            }
        }

        async function doSearch(query) {
            if (!query.trim()) {
                clearResults();
                showSpinner(false);
                return;
            }
            showSpinner(true);
            const results = await searchLocations(query);
            showSpinner(false);
            renderResults(results);
        }

        input.addEventListener('input', () => {
            const q = input.value;
            clearBtn.style.display = q.length > 0 ? 'block' : 'none';
            clearTimeout(debounceTimer);
            if (q.trim().length < 2) {
                clearResults();
                showSpinner(false);
                return;
            }
            debounceTimer = setTimeout(() => {
                doSearch(q);
            }, 300);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            clearResults();
            input.focus();
        });

        // Keyboard navigation
        input.addEventListener('keydown', (e) => {
            const items = resultsBox.querySelectorAll('.search-result-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length === 0) return;
                selectedIndex = (selectedIndex + 1) % items.length;
                updateSelection(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length === 0) return;
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                updateSelection(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIndex >= 0 && activeResults[selectedIndex]) {
                    selectLocation(activeResults[selectedIndex]);
                } else if (activeResults.length > 0) {
                    selectLocation(activeResults[0]);
                } else if (input.value.trim().length >= 2) {
                    doSearch(input.value);
                }
            } else if (e.key === 'Escape') {
                clearResults();
            }
        });

        function updateSelection(items) {
            items.forEach((it, idx) => {
                if (idx === selectedIndex) {
                    it.classList.add('selected');
                    it.scrollIntoView({ block: 'nearest' });
                } else {
                    it.classList.remove('selected');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                clearResults();
            }
        });

        // Prevent map dragging / zooming when interacting with search
        if (typeof L !== 'undefined' && L.DomEvent) {
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
        }

        return { container, input, clearBtn, selectLocation, doSearch };
    }

    // Leaflet Custom Control
    if (typeof L !== 'undefined') {
        L.Control.LocationSearch = L.Control.extend({
            options: {
                position: 'topleft',
                placeholder: '🔍 Search location, city, area, or coords...',
                onSelect: null
            },
            onAdd: function (map) {
                const searchObj = buildSearchBoxUI({
                    placeholder: this.options.placeholder,
                    onSelect: this.options.onSelect,
                    map: map
                });
                return searchObj.container;
            }
        });

        L.control.locationSearch = function (options) {
            return new L.Control.LocationSearch(options);
        };
    }

    // Global helper function for embedded or direct search bar attachment
    window.initLeafletSearch = function (map, options = {}) {
        if (!map) return null;
        if (options.mountSelector) {
            const mountEl = typeof options.mountSelector === 'string' ? document.querySelector(options.mountSelector) : options.mountSelector;
            if (mountEl) {
                const searchUI = buildSearchBoxUI({ ...options, map });
                mountEl.appendChild(searchUI.container);
                return searchUI;
            }
        }
        // Otherwise attach as Leaflet control
        if (typeof L !== 'undefined' && L.control && L.control.locationSearch) {
            const control = L.control.locationSearch({
                position: options.position || 'topleft',
                placeholder: options.placeholder || '🔍 Search location, city, area, or coords...',
                onSelect: options.onSelect
            }).addTo(map);
            return control;
        }
        return null;
    };
})();

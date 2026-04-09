// --- VERY TOP OF app.js for file loading check ---
console.log("--- app.js LATEST (Improved Modal, Stats on Idle, Info Icons) - Timestamp: " + new Date().toLocaleTimeString() + " ---");

// Define descriptions for metrics. These constants (PATCH_AREA_ATTRIBUTE, etc.) are from config.js
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha). This indicates the overall size of the habitat.",
    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch that is buffered from edge effects (e.g., changes in light, wind, temperature), in hectares (ha). It represents the more stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of the spatial connectedness or compactness of cells within a patch. Values range from 0 to 1, where higher values indicate more contiguous, less fragmented patches, which is generally better for biodiversity.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area. A higher ratio often indicates a more elongated or irregular shape, leading to a greater proportion of edge habitat compared to core habitat.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): The shortest straight-line distance to the nearest neighboring forest patch, in meters. Lower values indicate greater spatial connectivity."
};

let metricPopup = null; // To keep track of the metric info popup

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired. Initializing application.");

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
    });

    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';

    let selectedPatchMapboxId = null;
    let currentMinArea = null;
    let currentMaxArea = null;

    map.on('load', () => {

    // Add digital elevation terrain — wrapped in try-catch so any style
    // conflict does not block the rest of map initialization
    try {
        if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14
            });
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 });
    } catch(terrainErr) {
        console.warn('Terrain setup skipped:', terrainErr.message);
    }
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    initializeTierFilters();
    initializeConnectorLayer();
    resolvePatchLayerId();
    initializeHoverPopups();
    initializeClickInfoPanel();
    initializeGeocoder();
    initializeBasemapToggle();
    initializeAreaFilterControls();

    // --- ZOOM WARNING LOGIC ---
    const warningBox = document.getElementById('zoom-warning');
    const PATCH_VISIBILITY_THRESHOLD = 11; // Matches your forest patch minzoom

    const checkZoomLevel = () => {
        const currentZoom = map.getZoom();
        if (currentZoom < PATCH_VISIBILITY_THRESHOLD) {
            warningBox.style.display = 'block';
        } else {
            warningBox.style.display = 'none';
        }
    };

    map.on('zoom', checkZoomLevel);
    checkZoomLevel(); // Run once on load
});

// Update the idle listener to hide the terminal loader
    // ── Debounce helper ───────────────────────────────────────────────────────
    function debounce(fn, ms) {
        let timer = null;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }
    const debouncedUpdateStats = debounce(updateSummaryStatistics, 500);

map.on('idle', () => {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        setTimeout(() => { loadingIndicator.style.display = 'none'; }, 1200);
    }
    debouncedUpdateStats();
});
    map.on('error', (e) => {
        console.error('Mapbox GL Error:', e);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<div class="spinner"></div>Error loading map. <br>Check console.';
            loadingIndicator.style.display = 'block';
        }
    });

    function initializeTierFilters() {
        console.log("DEBUG: initializeTierFilters() function EXECUTED (with color boxes).");
        const filterContainer = document.querySelector('#filter-section');
        if (!filterContainer) { console.error("Tier filter container (#filter-section) not found!"); return; }
        filterContainer.innerHTML = '<h3>Filter by category</h3>';

        ALL_TIERS.forEach(tierValueFromConfig => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';

            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box';
            colorBox.style.backgroundColor = TIER_COLORS[tierValueFromConfig] || '#ccc';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'tier-toggle';
            checkbox.value = tierValueFromConfig;
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                applyForestFilter();
            });

            label.appendChild(colorBox);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + tierValueFromConfig));
            filterContainer.appendChild(label);
        });
        applyForestFilter();
    }

    // ── Resolve actual connector layer ID ────────────────────────────────────
    // Studio sometimes renames layers after tileset replacement.
    // Search the style for any line layer whose ID contains 'connector' or 'Connector'.
    function resolveConnectorLayerId() {
        if (!CONNECTOR_LAYER_ID) return null;
        if (map.getLayer(CONNECTOR_LAYER_ID)) return CONNECTOR_LAYER_ID;
        const layers = map.getStyle().layers || [];
        const found = layers.find(l => l.type === 'line' && l.id.toLowerCase().includes('connector'));
        if (found) { console.log('Connector layer resolved to:', found.id); return found.id; }
        console.warn('No connector layer found. Searched for:', CONNECTOR_LAYER_ID);
        return null;
    }

    // Also resolve the patch layer name — it may differ from config after tileset replacement
    let resolvedPatchId = FOREST_PATCH_LAYER_ID;
    function resolvePatchLayerId() {
        if (map.getLayer(resolvedPatchId)) {
            resolvedPatchId = FOREST_PATCH_LAYER_ID;
            return;
        }
        const layers = map.getStyle().layers || [];
        // Search for a fill layer whose name contains common keywords
        const found = layers.find(l =>
            l.type === 'fill' && (
                l.id.toLowerCase().includes('forest') ||
                l.id.toLowerCase().includes('patch') ||
                l.id.toLowerCase().includes('klang') ||
                l.id.toLowerCase().includes('kuantan')
            )
        );
        if (found) {
            resolvedPatchId = found.id;
            console.log('Patch layer resolved to:', found.id, '(config said:', FOREST_PATCH_LAYER_ID + ')');
        } else {
            console.error('Could not resolve patch layer. Config:', FOREST_PATCH_LAYER_ID);
            console.log('Available layers:', layers.map(l => l.id + '(' + l.type + ')').join(', '));
        }
    }

    // ── Corridor colours — maximum contrast on any basemap ────────────────────
    const CONN_COLORS = { High: '#00fffb', Moderate: '#ff00ea', Low: '#ff0011' };
    let resolvedConnectorId = null;
    let corridorVisible     = false;
    let connAnimFrame       = null;
    let connAnimStep        = 0;
    let connLastTs          = 0;
    let connActiveFilters   = new Set(['High', 'Moderate', 'Low']);

    const dashSeq = [
        [0,4,3],[0.5,4,2.5],[1,4,2],[1.5,4,1.5],[2,4,1],[2.5,4,0.5],[3,4,0],
        [0,0.5,3,3.5],[0,1,3,3],[0,1.5,3,2.5],[0,2,3,2],[0,2.5,3,1.5],
        [0,3,3,1],[0,3.5,3,0.5],[0,4,3,0]
    ];

    function applyConnectorFilter() {
        if (!resolvedConnectorId || !map.getLayer(resolvedConnectorId)) return;
        const active = Array.from(connActiveFilters);
        if (active.length === 0) {
            map.setFilter(resolvedConnectorId, ['==', ['get', 'connectivity'], '__none__']);
        } else if (active.length === 3) {
            map.setFilter(resolvedConnectorId, null);
        } else {
            map.setFilter(resolvedConnectorId, ['match', ['get', 'connectivity'], active, true, false]);
        }
    }

    function updateLevelBtn(btn, level) {
        const on = connActiveFilters.has(level);
        btn.textContent = (on ? '\u2713 ' : '') + level;
        btn.classList.toggle('active', on);
    }

    function initializeConnectorLayer() {
        resolvedConnectorId = resolveConnectorLayerId();
        const toggleBtn  = document.getElementById('corridor-toggle-fab');
        const levelPanel = document.getElementById('conn-level-toggles');

        if (!resolvedConnectorId) {
            if (toggleBtn)  toggleBtn.style.display  = 'none';
            if (levelPanel) levelPanel.style.display = 'none';
            return;
        }

        // Hide on load — hide both the main layer and the Studio outline duplicate if present
        map.setLayoutProperty(resolvedConnectorId, 'visibility', 'none');
        const studioOutlineId = resolvedConnectorId.replace('Connectors', 'Connectors_outline')
                                                    .replace('connectors', 'connectors_outline');
        if (map.getLayer(studioOutlineId)) {
            map.setLayoutProperty(studioOutlineId, 'visibility', 'none');
            console.log('Studio outline layer found and hidden:', studioOutlineId);
        }

        // Add a white outline using a fresh registered source so GL v3 scoping cannot block it.
        try {
            const styleDef  = map.getStyle();
            const connLayer = styleDef.layers.find(l => l.id === resolvedConnectorId);
            const srcName   = connLayer && connLayer.source;
            const srcLayer  = connLayer && connLayer['source-layer'];
            const srcDef    = srcName && styleDef.sources[srcName];
            let tileUrl = null;
            if (srcDef) {
                if (srcDef.url)   tileUrl = srcDef.url;
                if (srcDef.tiles) tileUrl = srcDef.tiles;
            }
            if (tileUrl && srcLayer && !map.getSource('corridor-outline-src')) {
                // Build source spec with only the relevant key — passing both
                // url and tiles (even with one undefined) causes a GL validation error
                const srcSpec = { type: 'vector' };
                if (Array.isArray(tileUrl)) {
                    srcSpec.tiles = tileUrl;
                } else {
                    srcSpec.url = tileUrl;
                }
                map.addSource('corridor-outline-src', srcSpec);
                map.addLayer({
                    id: 'connector-outline', type: 'line',
                    source: 'corridor-outline-src', 'source-layer': srcLayer,
                    minzoom: 10,
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
                    paint:  { 'line-color': '#ffffff', 'line-width': 13, 'line-opacity': 1.0 }
                }, resolvedConnectorId);
                console.log('Corridor outline added via fresh source');
            } else {
                console.warn('Outline source info missing — srcLayer:', srcLayer, 'tileUrl:', tileUrl);
            }
        } catch(err) {
            console.warn('Corridor outline setup failed:', err.message);
        }

        // Main corridor line — neon colours, 7px, on top of white outline
        const lineColor = ['match', ['get', 'connectivity'],
            'High',     CONN_COLORS.High,
            'Moderate', CONN_COLORS.Moderate,
            'Low',      CONN_COLORS.Low,
            '#ffffff'];
        map.setPaintProperty(resolvedConnectorId, 'line-color', lineColor);
        map.setPaintProperty(resolvedConnectorId, 'line-width', 7);
        map.setPaintProperty(resolvedConnectorId, 'line-opacity', 1.0);
        map.setPaintProperty(resolvedConnectorId, 'line-blur', 0.8); // soft glow makes colours pop

        // Level toggle buttons
        ['High', 'Moderate', 'Low'].forEach(level => {
            const btn = document.getElementById('conn-filter-' + level.toLowerCase());
            if (!btn) return;
            connActiveFilters.add(level);
            updateLevelBtn(btn, level);
            btn.addEventListener('click', () => {
                if (connActiveFilters.has(level)) connActiveFilters.delete(level);
                else connActiveFilters.add(level);
                updateLevelBtn(btn, level);
                applyConnectorFilter();
            });
        });

        // Tier filter for corridors — show only corridors involving specific tiers
        // Only activates if connector features carry a Tier property
        const tierFilterPanel = document.getElementById('corridor-tier-filter');
        if (tierFilterPanel) {
            // Probe a rendered feature to see if Tier data is present
            setTimeout(() => {
                try {
                    const sample = map.queryRenderedFeatures({ layers: [resolvedConnectorId] });
                    if (sample.length > 0 && sample[0].properties && sample[0].properties[TIER_ATTRIBUTE]) {
                        tierFilterPanel.style.display = 'flex';
                    }
                } catch(e) {}
            }, 2000);

            document.querySelectorAll('.corr-tier-btn').forEach(btn => {
                btn.classList.add('active');
                btn.addEventListener('click', () => {
                    btn.classList.toggle('active');
                    applyCorridorTierFilter();
                });
            });
        }

        function applyCorridorTierFilter() {
            if (!resolvedConnectorId || !map.getLayer(resolvedConnectorId)) return;
            const activeTiers = Array.from(document.querySelectorAll('.corr-tier-btn.active'))
                .map(b => b.dataset.tier);
            const activeConn  = Array.from(connActiveFilters);
            const filters = [];
            if (activeTiers.length > 0 && activeTiers.length < 6) {
                filters.push(['match', ['get', TIER_ATTRIBUTE], activeTiers, true, false]);
            }
            if (activeConn.length === 0) {
                filters.push(['==', ['get', 'connectivity'], '__none__']);
            } else if (activeConn.length < 3) {
                filters.push(['match', ['get', 'connectivity'], activeConn, true, false]);
            }
            map.setFilter(resolvedConnectorId, filters.length ? ['all', ...filters] : null);
        }

        // Override applyConnectorFilter to also respect tier filter
        applyConnectorFilter = function() {
            applyCorridorTierFilter();
        };

        // Hover popup
        const connPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
        map.on('mousemove', resolvedConnectorId, (e) => {
            if (!e.features || !e.features.length) return;
            map.getCanvas().style.cursor = 'pointer';
            const f = e.features[0].properties;
            connPopup.setLngLat(e.lngLat)
                .setHTML('<strong>Potential movement corridor</strong><br>Gap: ' + f.gap_m + ' m | Connectivity: ' + f.connectivity)
                .addTo(map);
        });
        map.on('mouseleave', resolvedConnectorId, () => { map.getCanvas().style.cursor = ''; connPopup.remove(); });

        // Click
        map.on('click', resolvedConnectorId, (e) => {
            if (!e.features || !e.features.length) return;
            const f = e.features[0].properties;
            const el = document.getElementById('patch-info-content');
            if (el) {
                el.innerHTML = '<div style="padding:4px"><strong>Potential movement corridor</strong><br><br>' +
                    '<strong>Gap to nearest patch:</strong> ' + f.gap_m + ' m<br>' +
                    '<strong>Connectivity:</strong> ' + f.connectivity + '<br>' +
                    '<strong>Source patch area:</strong> ' + f.area_ha + ' ha<br>' +
                    '<strong>Mean composite flow:</strong> ' + f.mean_flow + '<br><br>' +
                    '<em>' + (f.crossing_note || '') + '</em></div>';
            }
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('collapsed')) document.getElementById('toggle-sidebar-btn').click();
        });

        // Main toggle
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                corridorVisible = !corridorVisible;
                map.setLayoutProperty(resolvedConnectorId, 'visibility', corridorVisible ? 'visible' : 'none');
                if (map.getLayer('connector-outline')) {
                    map.setLayoutProperty('connector-outline', 'visibility', corridorVisible ? 'visible' : 'none');
                }
                if (map.getLayer(studioOutlineId)) {
                    map.setLayoutProperty(studioOutlineId, 'visibility', corridorVisible ? 'visible' : 'none');
                }
                if (levelPanel) levelPanel.style.display = corridorVisible ? 'flex' : 'none';
                if (corridorVisible) {
                    toggleBtn.textContent = 'Hide corridors';
                    toggleBtn.classList.add('active');
                    // Show corridor count badge on first reveal
                    if (!toggleBtn.dataset.counted) {
                        try {
                            const allCorridors = map.queryRenderedFeatures({ layers: [resolvedConnectorId] });
                            if (allCorridors.length > 0) {
                                toggleBtn.textContent = 'Hide corridors (' + allCorridors.length.toLocaleString() + ')';
                            }
                        } catch(e) { /* queryRenderedFeatures may not work for imported layers */ }
                        toggleBtn.dataset.counted = '1';
                    }
                    connAnimStep = 0;
                    function animate(ts) {
                        if (ts - connLastTs > 60) {
                            connAnimStep = (connAnimStep + 1) % dashSeq.length;
                            if (map.getLayer(resolvedConnectorId)) {
                                map.setPaintProperty(resolvedConnectorId, 'line-dasharray', dashSeq[connAnimStep]);
                            }
                            connLastTs = ts;
                        }
                        connAnimFrame = requestAnimationFrame(animate);
                    }
                    connAnimFrame = requestAnimationFrame(animate);
                } else {
                    toggleBtn.textContent = 'Show corridors';
                    toggleBtn.classList.remove('active');
                    if (connAnimFrame) { cancelAnimationFrame(connAnimFrame); connAnimFrame = null; }
                }
            });
        }
    }

    function initializeHoverPopups() {
        console.log("DEBUG: initializeHoverPopups() function EXECUTED.");
        const hoverPopup = new mapboxgl.Popup({
            closeButton: false, closeOnClick: false, className: 'custom-hover-popup'
        });

        map.on('mousemove', resolvedPatchId, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const p         = e.features[0].properties;
                const tierName  = p[TIER_ATTRIBUTE] || 'Forest patch';
                const conn      = p[CONNECTIVITY_ATTRIBUTE];
                const connColor = (typeof CONNECTIVITY_COLORS !== 'undefined' && CONNECTIVITY_COLORS[conn])
                    ? CONNECTIVITY_COLORS[conn] : null;
                const connText  = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';
                const connBadge = connColor
                    ? `<br><span style="display:inline-block;margin-top:3px;padding:1px 7px;border-radius:3px;background:${connColor};color:${connText};font-size:0.85em;font-weight:bold">${conn}</span>`
                    : '';
                hoverPopup.setLngLat(e.lngLat)
                    .setHTML('<strong>' + tierName + '</strong>' + connBadge + '<br><span style="font-size:0.82em;opacity:0.75">Click for details</span>')
                    .addTo(map);
            }
        });

        map.on('mouseleave', resolvedPatchId, () => {
            map.getCanvas().style.cursor = '';
            hoverPopup.remove();
        });
    }

    function initializeClickInfoPanel() {
        console.log("DEBUG: initializeClickInfoPanel() function EXECUTED.");
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
        // Use layer-specific click — works in Mapbox GL JS v3 with imported styles.
        // queryRenderedFeatures with layers[] does NOT work for imported style layers in v3.
        map.on('click', resolvedPatchId, (e) => {
            if (e.features && e.features.length > 0) {
                displayPatchInfo(e.features[0].properties);
                // Fly to patch at a comfortable zoom
                map.flyTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), 14), duration: 600 });
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    document.getElementById('toggle-sidebar-btn').click();
                }
                // Scroll sidebar to patch details panel
                const infoPanel = document.getElementById('info-panel-section');
                if (infoPanel && sidebar && !sidebar.classList.contains('collapsed')) {
                    setTimeout(() => infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }
            }
        });
    }

    function initializeGeocoder() {
        console.log("DEBUG GEOCODER: initializeGeocoder() function EXECUTED.");
        const geocoderContainer = document.getElementById('search-geocoder-container');
        if (!geocoderContainer) { console.error("DEBUG GEOCODER: Geocoder container NOT FOUND!"); return; }
        if (typeof MapboxGeocoder === 'undefined') {
            console.error("CRITICAL DEBUG GEOCODER: MapboxGeocoder class is UNDEFINED."); return;
        }
        try {
            const geocoder = new MapboxGeocoder({
                accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, marker: { color: '#FF6347' },
                placeholder: 'Search in Kuantan',
                bbox: [103.0, 3.5, 103.7, 4.2], 
                proximity: { longitude: INITIAL_CENTER[0], latitude: INITIAL_CENTER[1] },
                countries: 'MY', types: 'country,region,postcode,district,place,locality,neighborhood,address,poi', limit: 7
            });
            geocoderContainer.innerHTML = '';
            geocoderContainer.appendChild(geocoder.onAdd(map));
            geocoder.on('error', (e) => { console.error("DEBUG GEOCODER: Error:", e.error ? e.error.message : e); });
        } catch (error) { console.error("CRITICAL GEOCODER INIT ERROR:", error); }
    }
    
    function initializeBasemapToggle() {
        console.log("DEBUG: initializeBasemapToggle() function EXECUTED.");
        const basemapToggle = document.getElementById('basemap-toggle');
        const filterSection = document.getElementById('filter-section');
        const areaFilterControls = document.getElementById('area-filter-controls');
        const statsSection = document.getElementById('stats-section');

        if (!basemapToggle) { console.error("Basemap toggle not found!"); return; }
        basemapToggle.addEventListener('change', (e) => {
            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            loadingIndicator.style.display = 'block';
            const {lng, lat} = map.getCenter(); const zoom = map.getZoom();
            const bearing = map.getBearing(); const pitch = map.getPitch();
            map.setStyle(newStyleUrl);
            map.once('style.load', () => {
                loadingIndicator.style.display = 'none';
                map.setCenter([lng, lat]); map.setZoom(zoom); map.setBearing(bearing); map.setPitch(pitch);
                try {
                    if (!map.getSource('mapbox-dem')) {
                        map.addSource('mapbox-dem', {
                            type: 'raster-dem',
                            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                            tileSize: 512,
                            maxzoom: 14
                        });
                    }
                    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 });
                } catch(terrainErr) {
                    console.warn('Terrain restore skipped:', terrainErr.message);
                }
                
                const patchInfoContent = document.getElementById('patch-info-content');
                if (newStyleUrl === MAP_STYLE_CUSTOM) {
                    if(filterSection) filterSection.style.display = 'block';
                    if(areaFilterControls) areaFilterControls.style.display = 'block';
                    if(statsSection) statsSection.style.display = 'block'; 
                    if(patchInfoContent) patchInfoContent.innerHTML = 'Select a patch on the map to see details.';
                    setTimeout(() => {
                        if (map.getLayer(resolvedPatchId)) { 
                           applyForestFilter(); 
                           initializeHoverPopups(); 
                           initializeClickInfoPanel();
                        } else { console.warn("Forest patch layer not found after style switch immediately."); }
                    }, 250);
                } else if (newStyleUrl === MAP_STYLE_SATELLITE) {
                    if(filterSection) filterSection.style.display = 'none';
                    if(areaFilterControls) areaFilterControls.style.display = 'none';
                    if(statsSection) statsSection.style.display = 'none';
                    if(patchInfoContent) patchInfoContent.innerHTML = 'Forest data not available on satellite view.';
                }
            });
        });
    }

    function initializeAreaFilterControls() {
        console.log("DEBUG: initializeAreaFilterControls() function EXECUTED (Number Inputs version).");
        const minAreaInput = document.getElementById('min-area-input');
        const maxAreaInput = document.getElementById('max-area-input');
        const applyAreaBtn = document.getElementById('apply-area-filter-btn');
        const resetAreaBtn = document.getElementById('reset-area-filter-btn');
        const areaFilterError = document.getElementById('area-filter-error');
        if (!minAreaInput || !maxAreaInput || !applyAreaBtn || !resetAreaBtn || !areaFilterError) {
            console.error("Area filter control or error elements not found!"); return;
        }
        applyAreaBtn.addEventListener('click', () => {
            areaFilterError.style.display = 'none'; areaFilterError.textContent = '';
            const minValStr = minAreaInput.value; const maxValStr = maxAreaInput.value;
            currentMinArea = (minValStr === '' || isNaN(parseFloat(minValStr)) || parseFloat(minValStr) < 0) ? null : parseFloat(minValStr);
            currentMaxArea = (maxValStr === '' || isNaN(parseFloat(maxValStr)) || parseFloat(maxValStr) < 0) ? null : parseFloat(maxValStr);
            minAreaInput.value = currentMinArea === null ? '' : currentMinArea;
            maxAreaInput.value = currentMaxArea === null ? '' : currentMaxArea;
            if (currentMinArea !== null && currentMaxArea !== null && currentMaxArea < currentMinArea) {
                areaFilterError.textContent = "Max Area cannot be less than Min Area.";
                areaFilterError.style.display = 'block'; return;
            }
            console.log(`DEBUG: Apply Area Filter. Min: ${currentMinArea}, Max: ${currentMaxArea}`);
            applyForestFilter();
        });
        resetAreaBtn.addEventListener('click', () => {
            minAreaInput.value = ''; maxAreaInput.value = '';
            currentMinArea = null; currentMaxArea = null;
            areaFilterError.style.display = 'none'; areaFilterError.textContent = '';
            console.log("DEBUG: Reset Area Filter.");
            applyForestFilter();
        });
        [minAreaInput, maxAreaInput].forEach(input => {
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyAreaBtn.click(); });
            input.addEventListener('input', () => { areaFilterError.style.display = 'none'; areaFilterError.textContent = ''; });
        });
     }

    function applyForestFilter() {
        console.log("DEBUG: applyForestFilter() EXECUTED.");
        if (!map.isStyleLoaded() || !map.getLayer(resolvedPatchId)) {
            console.warn("DEBUG: applyForestFilter - Style or layer not ready. Retrying or exiting.");
            if (!map.isStyleLoaded()) setTimeout(applyForestFilter, 300);
            return;
        }
        
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const allFilters = [];
        
        // 1. TIER FILTER (Using the robust 'match' expression)
        if (checkedTiers.length === 0) {
            allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH_POSSIBLE']);
        } else if (checkedTiers.length < ALL_TIERS.length) {
            allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }
        
        // 2. AREA FILTER (Reading the exact numeric property without forced conversions)
        if (currentMinArea !== null && !isNaN(currentMinArea)) {
            allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        }
        if (currentMaxArea !== null && !isNaN(currentMaxArea)) {
            allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        }
        
        // 3. COMBINE AND APPLY
        let combinedFilterExpression = null;
        if (allFilters.length > 0) {
            combinedFilterExpression = ['all', ...allFilters];
        }
        
        try {
            // Apply the filter to the map
            map.setFilter(resolvedPatchId, combinedFilterExpression);
            
            // Debounced stats update so rapid filter changes don't thrash
            if (typeof debouncedUpdateStats === 'function') {
                debouncedUpdateStats();
            }
        } catch (error) { 
            console.error(`DEBUG: Error applying combined filter:`, error); 
        }
    }

    function updateSummaryStatistics() {
        console.log("DEBUG: updateSummaryStatistics() EXECUTED (with tier breakdown and ENN).");
        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        const ennEl = document.getElementById('visible-patches-enn');
        const breakdownEl = document.getElementById('tier-stats-breakdown');
        
        if (!countEl || !areaEl || !breakdownEl) { console.error("Stats elements not found!"); return; }
        
        if (!map.isStyleLoaded() || !map.getLayer(resolvedPatchId)) {
             countEl.textContent = '-'; 
             areaEl.textContent = '- ha'; 
             if (ennEl) ennEl.textContent = '- m';
             breakdownEl.innerHTML = ''; 
             return;
        }
        
        let features = [];
        try {
            features = map.queryRenderedFeatures({ layers: [resolvedPatchId] });
        } catch(err) {
            // queryRenderedFeatures may fail in Mapbox GL v3 with imported styles
        }
        countEl.textContent = features.length.toLocaleString();
        
        let overallTotalArea = 0; 
        let overallTotalEnn = 0;
        let validEnnCount = 0;
        const tierStats = {};
        
        const currentlyCheckedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        currentlyCheckedTiers.forEach(tier => { tierStats[tier] = { count: 0, area: 0 }; });
        
        features.forEach(feature => {
            const area = feature.properties[PATCH_AREA_ATTRIBUTE];
            const enn = feature.properties[ENN_ATTRIBUTE];
            
            if (area !== undefined && !isNaN(parseFloat(area))) overallTotalArea += parseFloat(area);
            if (enn !== undefined && !isNaN(parseFloat(enn))) {
                overallTotalEnn += parseFloat(enn);
                validEnnCount++;
            }
            
            const tier = feature.properties[TIER_ATTRIBUTE];
            if (tier && tierStats.hasOwnProperty(tier)) {
                tierStats[tier].count++;
                if (area !== undefined && !isNaN(parseFloat(area))) tierStats[tier].area += parseFloat(area);
            }
        });
        
        areaEl.textContent = overallTotalArea.toFixed(2).toLocaleString() + ' ha';
        
        if (ennEl) {
            if (validEnnCount > 0) {
                const avgEnn = overallTotalEnn / validEnnCount;
                ennEl.textContent = avgEnn.toFixed(2).toLocaleString() + ' m';
            } else {
                ennEl.textContent = '- m';
            }
        }

        let breakdownHtml = '<h5 style="margin:0 0 5px;font-size:0.9em;color:inherit">Breakdown by visible category:</h5>';
        if (features.length > 0 || currentlyCheckedTiers.length > 0) {
            currentlyCheckedTiers.forEach(tier => {
                if (tierStats[tier]) {
                    breakdownHtml += `<p><strong>${formatPropertyName(tier)}:</strong> ${tierStats[tier].count.toLocaleString()} patches, ${tierStats[tier].area.toFixed(2).toLocaleString()} ha</p>`;
                }
            });
            if (features.length === 0 && currentlyCheckedTiers.length > 0) {
                breakdownHtml += '<p style="color:#888;font-style:italic">No patches match the current filters. Try adjusting the area filter or re-enabling categories.</p>';
            }
        } else if (features.length === 0 && currentlyCheckedTiers.length === 0) {
            breakdownHtml += '<p style="color:#888;font-style:italic">No categories selected. Use the checkboxes above to show patches.</p>';
        } else {
            breakdownHtml += '<p>No patches visible with current filters.</p>';
        }
        breakdownEl.innerHTML = breakdownHtml;
        console.log(`DEBUG: Stats updated - Overall: ${features.length} patches, ${overallTotalArea.toFixed(2)} ha.`);
    }

    function displayPatchInfo(properties) {
        const el = document.getElementById('patch-info-content');
        if (!el) return;
        if (!properties) { el.innerHTML = 'No data for this patch.'; return; }

        const tier = properties[TIER_ATTRIBUTE];
        const conn = properties[CONNECTIVITY_ATTRIBUTE];
        const area = properties[PATCH_AREA_ATTRIBUTE];
        const core = properties[CORE_AREA_ATTRIBUTE];
        const enn  = properties[ENN_ATTRIBUTE];
        const flow = properties[MEAN_FLOW_ATTRIBUTE];
        const id   = properties[PATCH_ID_ATTRIBUTE];

        const tierDesc = {
            'Tier 1 (Core Habitat)': 'One of the more structurally important forest patches in this landscape. Large enough to support a high level of biodiversity, with substantial interior area protected from edge effects.',
            'Tier 2 (Major Stepping Stones)': 'A high-quality patch that could function as a key hub or stepping stone in a potential movement network. Important for regional habitat connectivity.',
            'Tier 3 (Connected Fragments)': 'A moderately connected forest fragment that could play a bridging role between larger patches in the landscape.',
            'Tier 4 (Vulnerable Edge Fragments)': 'A patch with significant edge exposure relative to its size. Functionally important but vulnerable to further habitat loss or degradation.',
            'Tier 5 (Isolated Fragments)': 'A small, isolated forest fragment with limited connectivity potential to the surrounding landscape.',
            'Tier 6 (Isolated Micro Patches)': 'A highly isolated micro-patch or remnant forest fragment. Generally too small and disconnected to support resident populations, but may provide temporary shelter.'
        };
        const connDesc = {
            'High':    'This patch has high connectivity potential. The surrounding landscape presents less barriers to movement to neighbouring patches, suitable for a corridor.',
            'Moderate':'This patch has moderate connectivity potential. A corridor to neighbouring patches is possible but depends on the routes available through the landscape.',
            'Low':     'This patch has low connectivity potential. The surrounding landscape presents significant resistance to movement between patches, even with a corridor in place.',
            'Barrier': 'This patch is surrounded by an impermeable barrier zone such as dense urban development. Movement to neighbouring patches is effectively impossible, even with a corridor in place',
            'No Data': 'Connectivity data is not available for this patch.'
        };
        const metricInfo = {
            area:   'The total area of the forest patch in hectares. Larger patches can support more species and are more resilient to edge disturbance.',
            core:   'The area of the patch that is sufficiently far from the edge to be buffered from external disturbance such as wind, light changes, and human activity. Core area is the most ecologically stable part of the patch.',
            contig: 'A measure of how compact and internally connected the patch is, ranging from 0 to 1. Higher values indicate a more solid, contiguous patch shape, which makes it easier for animals to move within the patch.',
            para:   'The ratio of the patch perimeter to its area. A higher ratio means the patch has a more irregular or elongated shape, with a greater proportion of edge habitat relative to interior.',
            enn:    'The straight-line distance to the nearest adjacent forest patch, in metres. Lower values indicate the patch is closer to other forest and more likely to be reached by dispersing animals.',
            flow:   'The mean composite current flow value across all resistance scenarios and spatial scales, on a 0 to 300 scale. Higher values indicate the patch carries more movement current and is more central to the regional connectivity network.'
        };

        const ennNum = typeof enn === 'number' ? enn : parseFloat(enn);
        let ennMsg = 'Distance data not available.';
        if (!isNaN(ennNum)) {
            if      (ennNum <= 30)   ennMsg = 'Directly adjacent to another forest area.';
            else if (ennNum <= 800)  ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away, within typical dispersal range for arboreal animals.';
            else if (ennNum <= 2000) ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away, beyond typical single-generation dispersal distance for most arboreal animals.';
            else                     ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away. This patch is functionally isolated at the landscape scale.';
        }

        const tc = (TIER_COLORS && TIER_COLORS[tier]) ? TIER_COLORS[tier] : '#555';
        const cc = (CONNECTIVITY_COLORS && CONNECTIVITY_COLORS[conn]) ? CONNECTIVITY_COLORS[conn] : '#888';
        const ct = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';

        function infoBtn(key) {
            return '<button class="metric-info-btn" data-info="' + key + '" title="What does this mean?" style="background:none;border:1px solid #aaa;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;margin-left:4px;padding:0;line-height:14px;color:#666;vertical-align:middle">i</button>';
        }

        let h = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">';
        h += '<div style="background:' + tc + ';color:#fff;padding:5px 9px;border-radius:3px;font-weight:700;margin-bottom:8px;font-size:0.82em">' + (tier || 'Unknown') + '</div>';
        h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (tierDesc[tier] || '') + '</p>';
        if (conn && conn !== 'No Data') {
            h += '<div style="margin-bottom:4px;font-size:0.87em"><strong>Connectivity:</strong> <span style="background:' + cc + ';color:' + ct + ';padding:1px 7px;border-radius:3px;font-weight:700">' + conn + '</span></div>';
            h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (connDesc[conn] || '') + '</p>';
        }
        h += '<div style="font-size:0.87em;margin-bottom:10px"><strong>Nearest patch:</strong> ' + ennMsg + '</div>';
        h += '<details><summary style="cursor:pointer;font-weight:700;font-size:0.87em;color:inherit">Show technical details</summary>';
        h += '<ul style="margin:6px 0;padding-left:0;font-size:0.84em;line-height:1.8;color:inherit;list-style:none">';
        if (id !== undefined)
            h += '<li><strong>Patch ID:</strong> ' + id + '</li>';
        if (typeof area === 'number')
            h += '<li><strong>Total area:</strong> ' + area.toFixed(2) + ' ha' + infoBtn('area') + '</li>';
        if (typeof core === 'number')
            h += '<li><strong>Core area:</strong> ' + core.toFixed(2) + ' ha' + infoBtn('core') + '</li>';
        if (typeof properties[CONTIGUITY_INDEX_ATTRIBUTE] === 'number')
            h += '<li><strong>Contiguity index:</strong> ' + properties[CONTIGUITY_INDEX_ATTRIBUTE].toFixed(3) + infoBtn('contig') + '</li>';
        if (typeof properties[PERIMETER_AREA_RATIO_ATTRIBUTE] === 'number')
            h += '<li><strong>Perimeter-area ratio:</strong> ' + properties[PERIMETER_AREA_RATIO_ATTRIBUTE].toFixed(5) + infoBtn('para') + '</li>';
        if (!isNaN(ennNum))
            h += '<li><strong>ENN distance:</strong> ' + Math.round(ennNum) + ' m' + infoBtn('enn') + '</li>';
        if (flow !== undefined && flow !== null)
            h += '<li><strong>Mean composite flow:</strong> ' + (typeof flow === 'number' ? flow.toFixed(2) : flow) + infoBtn('flow') + '</li>';
        h += '</ul>';
        h += '<div id="metric-inline-popup" style="display:none;margin-top:8px;background:#f0f4ff;border:1px solid #c0cfe8;border-radius:4px;padding:8px 10px;font-size:0.83em;line-height:1.5;color:#212529"></div>';
        h += '</details></div>';
        el.innerHTML = h;

        // Smooth fade-in
        el.style.opacity = '0';
        requestAnimationFrame(() => {
            el.style.transition = 'opacity 0.2s ease';
            el.style.opacity = '1';
        });

        el.querySelectorAll('.metric-info-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var popup = el.querySelector('#metric-inline-popup');
                var key   = btn.getAttribute('data-info');
                if (popup.style.display === 'block' && popup.dataset.key === key) {
                    popup.style.display = 'none';
                } else {
                    popup.textContent   = metricInfo[key] || '';
                    popup.dataset.key   = key;
                    popup.style.display = 'block';
                }
            });
        });
    }

    function showMetricInfoPopup(metricKey, iconElement) {
        if (metricPopup) { metricPopup.remove(); metricPopup = null; }
        const desc = METRIC_DESCRIPTIONS[metricKey];
        if (!desc) return;
        metricPopup = document.createElement('div');
        metricPopup.id = 'metric-info-popup';
        metricPopup.innerHTML = '<p style="margin:0 0 8px;font-size:0.85em;color:#212529">' + desc + '</p><button class="close-metric-popup-btn" style="padding:4px 10px;cursor:pointer;color:#212529">Close</button>';
        document.body.appendChild(metricPopup);
        const r = iconElement.getBoundingClientRect();
        metricPopup.style.cssText = 'position:fixed;top:' + (r.bottom+5) + 'px;left:' + r.left + 'px;z-index:1060;background:#ffffff;color:#212529;border:1px solid #ccc;padding:12px;max-width:260px;border-radius:4px;font-family:-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
        metricPopup.querySelector('.close-metric-popup-btn').addEventListener('click', () => { metricPopup.remove(); metricPopup = null; });
    }

    document.addEventListener('click', (e) => {
        if (metricPopup && !metricPopup.contains(e.target) && !e.target.classList.contains('metric-info-icon')) {
            metricPopup.remove(); metricPopup = null;
        }
    });

    function formatPropertyName(name) {
        if (name === TIER_ATTRIBUTE) return 'Category';
        if (name === PATCH_AREA_ATTRIBUTE) return 'Patch Area';
        if (name === CORE_AREA_ATTRIBUTE) return 'Core Area';
        if (name === CONNECTIVITY_ATTRIBUTE) return 'Connectivity Potential';
        if (name === MEAN_FLOW_ATTRIBUTE) return 'Mean Composite Flow';
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    console.log("DEBUG: Attempting to call initializeAboutModal...");
    initializeAboutModal();
    initializeHowToModal();
    console.log("DEBUG: Attempting to call initializeDarkModeToggle...");
    initializeDarkModeToggle();

    function initializeAboutModal() {
        console.log("DEBUG: initializeAboutModal() function EXECUTED.");
        const aboutBtn = document.getElementById('about-btn');
        const aboutModal = document.getElementById('about-modal');
        if (!aboutModal) { console.error("About modal (#about-modal) NOT FOUND"); if(aboutBtn) aboutBtn.disabled = true; return; }
        const closeModalBtn = aboutModal.querySelector('.close-modal-btn');
        if (!aboutBtn) console.error("DEBUG: About button (#about-btn) NOT FOUND");
        if (!closeModalBtn && aboutModal) console.error("DEBUG: Close modal button (.close-modal-btn) NOT FOUND inside #about-modal");
        if (!aboutBtn || !closeModalBtn) { if(aboutBtn) aboutBtn.disabled = true; return; }
        console.log("DEBUG: All About Modal elements found.");

        function openModal() {
            aboutModal.style.display = 'block';
            requestAnimationFrame(() => { document.body.classList.add('modal-open'); });
        }
        function closeModal() {
            document.body.classList.remove('modal-open');
            aboutModal.addEventListener('transitionend', function handler() {
                if (!document.body.classList.contains('modal-open')) aboutModal.style.display = 'none';
                aboutModal.removeEventListener('transitionend', handler);
            }, { once: true }); 
             setTimeout(() => { 
                if (!document.body.classList.contains('modal-open')) aboutModal.style.display = 'none';
            }, 300); 
        }
        aboutBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (event) => { if (event.target == aboutModal) closeModal(); });
        window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('modal-open')) closeModal(); });
    }

    function initializeHowToModal() {
        const btn      = document.getElementById('howto-btn');
        const modal    = document.getElementById('howto-modal');
        const closeBtn = document.getElementById('close-howto-btn');
        if (!btn || !modal || !closeBtn) return;
        btn.addEventListener('click', () => {
            modal.style.cssText = 'display:flex !important;position:fixed;z-index:1001;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.6);align-items:center;justify-content:center';
        });
        function closeHowTo() { modal.style.display = 'none'; }
        closeBtn.addEventListener('click', closeHowTo);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeHowTo(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHowTo(); });
    }

    function initializeDarkModeToggle() {
        console.log("DEBUG: initializeDarkModeToggle() function EXECUTED.");
        const toggleButton = document.getElementById('dark-mode-toggle'); 
        if (!toggleButton) { console.error("CRITICAL DEBUG: Dark mode toggle button ('dark-mode-toggle') NOT FOUND!"); return; }
        console.log("DEBUG: Dark mode toggle button FOUND:", toggleButton);
        if (localStorage.getItem('darkMode') === 'enabled') {
            document.body.classList.add('dark-mode');
            toggleButton.textContent = '☀️'; toggleButton.setAttribute('aria-label', 'Switch to light mode');
        } else {
            toggleButton.textContent = '🌙'; toggleButton.setAttribute('aria-label', 'Switch to dark mode');
        }
        toggleButton.addEventListener('click', () => {
            console.log("DEBUG: Dark mode toggle CLICKED!");
            document.body.classList.toggle('dark-mode');
            console.log("Body classes after toggle:", document.body.className);
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('darkMode', 'enabled');
                toggleButton.textContent = '☀️'; toggleButton.setAttribute('aria-label', 'Switch to light mode');
            } else {
                localStorage.setItem('darkMode', 'disabled');
                toggleButton.textContent = '🌙'; toggleButton.setAttribute('aria-label', 'Switch to dark mode');
            }
        });
    }

    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const appContainer = document.getElementById('app-container');
    if (toggleSidebarBtn && sidebar && appContainer) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            appContainer.classList.toggle('sidebar-collapsed');
            setTimeout(() => { map.resize(); }, 250);
            toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
            toggleSidebarBtn.setAttribute('aria-label', sidebar.classList.contains('collapsed') ? 'Open sidebar' : 'Close sidebar');
            toggleSidebarBtn.setAttribute('aria-expanded', String(!sidebar.classList.contains('collapsed')));
        });
    } else {
        console.error("Sidebar toggle elements not found: #toggle-sidebar-btn, #sidebar, or #app-container.");
    }

    // ── Shareable URL hash ────────────────────────────────────────────────────
    // Encodes zoom/lat/lng into the URL so a link opens the map at the same view.
    function updateUrlHash() {
        const c    = map.getCenter();
        const hash = map.getZoom().toFixed(2) + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5);
        history.replaceState(null, '', '#' + hash);
    }

    function applyUrlHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;
        const parts = hash.split('/');
        if (parts.length >= 3) {
            const zoom = parseFloat(parts[0]);
            const lat  = parseFloat(parts[1]);
            const lng  = parseFloat(parts[2]);
            if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) {
                map.jumpTo({ center: [lng, lat], zoom });
            }
        }
    }

    map.on('load', applyUrlHash);
    map.on('moveend', updateUrlHash);

    // Copy link button
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            updateUrlHash();
            navigator.clipboard.writeText(window.location.href).then(() => {
                const orig = copyLinkBtn.textContent;
                copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => { copyLinkBtn.textContent = orig; }, 2000);
            }).catch(() => {
                // Fallback for browsers that block clipboard
                prompt('Copy this link:', window.location.href);
            });
        });
    }

    // ── First-visit onboarding ────────────────────────────────────────────────
    function initializeOnboarding() {
        if (localStorage.getItem('hasVisited') === '1') return;
        const overlay = document.getElementById('onboarding-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        document.getElementById('onboarding-dismiss').addEventListener('click', () => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => { overlay.style.display = 'none'; }, 300);
            localStorage.setItem('hasVisited', '1');
        });
    }
    initializeOnboarding();
}); // End DOMContentLoaded

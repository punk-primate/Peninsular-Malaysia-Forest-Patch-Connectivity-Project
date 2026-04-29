// --- VERY TOP OF app.js for file loading check ---
console.log("--- app.js LATEST (Improved Modal, Stats on Idle, Info Icons) - Timestamp: " + new Date().toLocaleTimeString() + " ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch buffered from edge effects, in hectares (ha).",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: Spatial connectedness of cells within a patch, 0–1.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of patch perimeter to area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Shortest straight-line distance to the nearest patch, in meters."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired. Initializing application.");

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
    });

    // Expose map instance for additive features
    window._mapInstance = map;

    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';

    let selectedPatchMapboxId = null;
    let currentMinArea = null;
    let currentMaxArea = null;

    map.on('load', () => {
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

        const warningBox = document.getElementById('zoom-warning');
        const PATCH_VISIBILITY_THRESHOLD = 11;
        const checkZoomLevel = () => {
            warningBox.style.display = map.getZoom() < PATCH_VISIBILITY_THRESHOLD ? 'block' : 'none';
        };
        map.on('zoom', checkZoomLevel);
        checkZoomLevel();
    });

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
        const filterContainer = document.querySelector('#filter-section');
        if (!filterContainer) { console.error("Tier filter container not found!"); return; }
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
            checkbox.addEventListener('change', applyForestFilter);
            label.appendChild(colorBox);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + ((typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[tierValueFromConfig]) || tierValueFromConfig)));
            filterContainer.appendChild(label);
        });
        applyForestFilter();
    }

    function resolveConnectorLayerId() {
        if (!CONNECTOR_LAYER_ID) return null;
        if (map.getLayer(CONNECTOR_LAYER_ID)) return CONNECTOR_LAYER_ID;
        const layers = map.getStyle().layers || [];
        const found = layers.find(l => l.type === 'line' && l.id.toLowerCase().includes('connector'));
        if (found) { console.log('Connector layer resolved to:', found.id); return found.id; }
        console.warn('No connector layer found. Searched for:', CONNECTOR_LAYER_ID);
        return null;
    }

    let resolvedPatchId = FOREST_PATCH_LAYER_ID;
    function resolvePatchLayerId() {
        if (map.getLayer(resolvedPatchId)) { resolvedPatchId = FOREST_PATCH_LAYER_ID; return; }
        const layers = map.getStyle().layers || [];
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
        }
    }

    const CONN_COLORS = { High: '#00ffff', Moderate: '#ffff00', Low: '#ff3300' };
    let resolvedConnectorId = null;
    let corridorVisible     = false;
    let connAnimFrame       = null;
    let connActiveFilters   = new Set(['High', 'Moderate', 'Low']);

    function applyConnectorFilter() {
        const active = Array.from(connActiveFilters);
        const filterExpr = active.length === 0
            ? ['==', ['get', 'connectivity'], '__none__']
            : active.length === 3
                ? null
                : ['match', ['get', 'connectivity'], active, true, false];
        ['connector-glow', 'connector-solid'].forEach(id => {
            if (map.getLayer(id)) map.setFilter(id, filterExpr);
        });
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

        map.getStyle().layers.forEach(layer => {
            if (layer.id.toLowerCase().includes('connector'))
                try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch(e) {}
        });

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
                const srcSpec = { type: 'vector' };
                if (Array.isArray(tileUrl)) { srcSpec.tiles = tileUrl; } else { srcSpec.url = tileUrl; }
                map.addSource('corridor-outline-src', srcSpec);
                const corrColorExpr = ['match', ['get', 'connectivity'],
                    'High', '#00ffff', 'Moderate', '#ffff00', 'Low', '#ff3300', '#ffffff'];

                map.addLayer({
                    id: 'connector-glow', type: 'line',
                    source: 'corridor-outline-src', 'source-layer': srcLayer,
                    minzoom: 10, slot: 'top',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
                    paint: {
                        'line-color': corrColorExpr,
                        'line-width': 28, 'line-blur': 14,
                        'line-opacity': 0.9, 'line-emissive-strength': 1
                    }
                });
                map.addLayer({
                    id: 'connector-solid', type: 'line',
                    source: 'corridor-outline-src', 'source-layer': srcLayer,
                    minzoom: 10, slot: 'top',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
                    paint: {
                        'line-color': corrColorExpr,
                        'line-width': 10, 'line-blur': 0,
                        'line-opacity': 1.0, 'line-emissive-strength': 1
                    }
                });
                ['connector-glow', 'connector-solid'].forEach(id => {
                    if (map.getLayer(id)) {
                        map.moveLayer(id);
                        map.setLayoutProperty(id, 'visibility', 'none');
                    }
                });
            }
        } catch(err) {
            console.warn('Corridor outline setup failed:', err.message);
        }

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

        const tierFilterPanel = document.getElementById('corridor-tier-filter');
        if (tierFilterPanel) {
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
                btn.addEventListener('click', () => { btn.classList.toggle('active'); applyCorridorTierFilter(); });
            });
        }

        function applyCorridorTierFilter() {
            const activeTiers = Array.from(document.querySelectorAll('.corr-tier-btn.active')).map(b => b.dataset.tier);
            const activeConn  = Array.from(connActiveFilters);
            const filters = [];
            if (activeTiers.length > 0 && activeTiers.length < 6)
                filters.push(['match', ['get', TIER_ATTRIBUTE], activeTiers, true, false]);
            if (activeConn.length === 0)
                filters.push(['==', ['get', 'connectivity'], '__none__']);
            else if (activeConn.length < 3)
                filters.push(['match', ['get', 'connectivity'], activeConn, true, false]);
            const filterExpr = filters.length ? ['all', ...filters] : null;
            ['connector-glow', 'connector-solid'].forEach(id => {
                if (map.getLayer(id)) map.setFilter(id, filterExpr);
            });
        }

        applyConnectorFilter = function() { applyCorridorTierFilter(); };

        const connPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
        const connInteractId = map.getLayer('connector-solid') ? 'connector-solid' : resolvedConnectorId;
        map.on('mousemove', connInteractId, (e) => {
            if (!e.features || !e.features.length) return;
            map.getCanvas().style.cursor = 'pointer';
            const f = e.features[0].properties;
            connPopup.setLngLat(e.lngLat)
                .setHTML('<strong>Potential movement corridor</strong><br>Gap: ' + f.gap_m + ' m | Connectivity: ' + f.connectivity)
                .addTo(map);
        });
        map.on('mouseleave', connInteractId, () => { map.getCanvas().style.cursor = ''; connPopup.remove(); });

        map.on('click', connInteractId, (e) => {
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

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                corridorVisible = !corridorVisible;
                const vis = corridorVisible ? 'visible' : 'none';
                ['connector-glow', 'connector-solid'].forEach(id => {
                    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
                });
                if (levelPanel) levelPanel.style.display = corridorVisible ? 'flex' : 'none';
                if (corridorVisible) {
                    toggleBtn.textContent = 'Hide corridors';
                    toggleBtn.classList.add('active');
                    if (!toggleBtn.dataset.counted) {
                        try {
                            const allCorridors = map.queryRenderedFeatures({ layers: [resolvedConnectorId] });
                            if (allCorridors.length > 0)
                                toggleBtn.textContent = 'Hide corridors (' + allCorridors.length.toLocaleString() + ')';
                        } catch(e) {}
                        toggleBtn.dataset.counted = '1';
                    }
                    if (connAnimFrame) { cancelAnimationFrame(connAnimFrame); connAnimFrame = null; }
                    function animate(ts) {
                        const glowOpacity = 0.5 + 0.5 * Math.sin(ts / 400);
                        if (map.getLayer('connector-glow'))
                            map.setPaintProperty('connector-glow', 'line-opacity', glowOpacity);
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
        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
        map.on('mousemove', resolvedPatchId, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const p         = e.features[0].properties;
                const tierName  = (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[p[TIER_ATTRIBUTE]]) || p[TIER_ATTRIBUTE] || 'Forest patch';
                const conn      = p[CONNECTIVITY_ATTRIBUTE];
                const connColor = (typeof CONNECTIVITY_COLORS !== 'undefined' && CONNECTIVITY_COLORS[conn]) ? CONNECTIVITY_COLORS[conn] : null;
                const connText  = (conn === 'High' || conn === 'Moderate') ? '#1a1a1a' : '#fff';
                const connBadge = connColor
                    ? `<br><span style="display:inline-block;margin-top:3px;padding:1px 7px;border-radius:3px;background:${connColor};color:${connText};font-size:0.85em;font-weight:bold">${conn}</span>`
                    : '';
                hoverPopup.setLngLat(e.lngLat)
                    .setHTML('<strong>' + tierName + '</strong>' + connBadge + '<br><span style="font-size:0.82em;opacity:0.75">Click for details</span>')
                    .addTo(map);
            }
        });
        map.on('mouseleave', resolvedPatchId, () => { map.getCanvas().style.cursor = ''; hoverPopup.remove(); });
    }

    function initializeClickInfoPanel() {
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
        map.on('click', resolvedPatchId, (e) => {
            if (e.features && e.features.length > 0) {
                displayPatchInfo(e.features[0].properties);
                map.flyTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), 14), duration: 600 });
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed'))
                    document.getElementById('toggle-sidebar-btn').click();
                const infoPanel = document.getElementById('info-panel-section');
                if (infoPanel && sidebar && !sidebar.classList.contains('collapsed'))
                    setTimeout(() => infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }
        });
    }

    function initializeGeocoder() {
        const container = document.getElementById('search-geocoder-container');
        if (!container) return;

        container.innerHTML = `
            <div id="nominatim-search" style="position:relative;margin-bottom:8px">
                <input id="nominatim-input" type="text" placeholder="Search for a place..."
                    autocomplete="off"
                    style="width:100%;padding:7px 30px 7px 9px;border:1px solid #ced4da;border-radius:4px;
                           box-sizing:border-box;font-size:0.87em;color:#212529;background:white;
                           font-family:inherit;transition:border-color 0.15s;outline:none"
                    onfocus="this.style.borderColor='#2a8234'"
                    onblur="this.style.borderColor='#ced4da'" />
                <span id="nominatim-clear"
                    style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);
                           cursor:pointer;color:#aaa;font-size:14px;line-height:1;user-select:none">&#215;</span>
                <div id="nominatim-results"
                    style="display:none;position:absolute;top:100%;left:0;right:0;z-index:1000;
                           background:white;border:1px solid #ced4da;border-top:none;border-radius:0 0 4px 4px;
                           max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
                </div>
            </div>`;

        const input   = document.getElementById('nominatim-input');
        const results = document.getElementById('nominatim-results');
        const clear   = document.getElementById('nominatim-clear');
        let debounceTimer = null;
        let lastQuery     = '';

        function applyDarkMode() {
            const dark = document.body.classList.contains('dark-mode');
            input.style.background    = dark ? '#1e3020' : 'white';
            input.style.color         = dark ? '#dcedc8' : '#212529';
            input.style.borderColor   = dark ? '#2c3a2c' : '#ced4da';
            results.style.background  = dark ? '#1e3020' : 'white';
            results.style.borderColor = dark ? '#2c3a2c' : '#ced4da';
        }
        applyDarkMode();
        const dmBtn = document.getElementById('dark-mode-toggle');
        if (dmBtn) dmBtn.addEventListener('click', () => setTimeout(applyDarkMode, 50));

        function showResults(items) {
            results.innerHTML = '';
            if (!items.length) {
                results.innerHTML = '<div style="padding:8px 10px;font-size:0.85em;color:#888">No results found</div>';
                results.style.display = 'block';
                return;
            }
            items.forEach(item => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:8px 10px;font-size:0.85em;cursor:pointer;border-bottom:1px solid #f0f0f0;line-height:1.4';
                div.textContent = item.display_name;
                div.addEventListener('mouseenter', () => div.style.background = '#f0f7f0');
                div.addEventListener('mouseleave', () => div.style.background = '');
                div.addEventListener('click', () => {
                    input.value = item.display_name.split(',')[0];
                    results.style.display = 'none';
                    clear.style.display = 'inline';
                    const lat = parseFloat(item.lat);
                    const lng = parseFloat(item.lon);
                    map.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 });
                    if (window._nominatimMarker) window._nominatimMarker.remove();
                    window._nominatimMarker = new mapboxgl.Marker({ color: '#2a8234' }).setLngLat([lng, lat]).addTo(map);
                });
                results.appendChild(div);
            });
            results.style.display = 'block';
        }

        function search(q) {
            if (q.length < 3) { results.style.display = 'none'; return; }
            if (q === lastQuery) return;
            lastQuery = q;
            const bbox = INITIAL_CENTER[0] > 103 ? '102.8,3.4,103.8,4.3' : '100.8,2.6,102.2,3.6';
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=7&countrycodes=my&viewbox=${bbox}&bounded=0&addressdetails=0`;
            fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'myforestconnect.online' } })
                .then(r => r.json())
                .then(data => { if (input.value.trim() === q) showResults(data); })
                .catch(() => { results.style.display = 'none'; });
        }

        input.addEventListener('input', () => {
            const q = input.value.trim();
            clear.style.display = q ? 'inline' : 'none';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => search(q), 350);
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { results.style.display = 'none'; input.blur(); } });
        clear.addEventListener('click', () => {
            input.value = ''; clear.style.display = 'none'; results.style.display = 'none';
            if (window._nominatimMarker) { window._nominatimMarker.remove(); window._nominatimMarker = null; }
        });
        document.addEventListener('click', (e) => { if (!container.contains(e.target)) results.style.display = 'none'; });
    }

    function initializeBasemapToggle() {
        const basemapToggle    = document.getElementById('basemap-toggle');
        const filterSection    = document.getElementById('filter-section');
        const areaFilterControls = document.getElementById('area-filter-controls');
        const statsSection     = document.getElementById('stats-section');
        if (!basemapToggle) return;
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
                        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
                    }
                    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 });
                } catch(terrainErr) { console.warn('Terrain restore skipped:', terrainErr.message); }
                const patchInfoContent = document.getElementById('patch-info-content');
                if (newStyleUrl === MAP_STYLE_CUSTOM) {
                    if(filterSection) filterSection.style.display = 'block';
                    if(areaFilterControls) areaFilterControls.style.display = 'block';
                    if(statsSection) statsSection.style.display = 'block';
                    if(patchInfoContent) patchInfoContent.innerHTML = 'Select a patch on the map to see details.';
                    resolvedConnectorId = null;
                    corridorVisible = false;
                    if (connAnimFrame) { cancelAnimationFrame(connAnimFrame); connAnimFrame = null; }
                    const levelPanel = document.getElementById('conn-level-toggles');
                    if (levelPanel) levelPanel.style.display = 'none';
                    const oldBtn = document.getElementById('corridor-toggle-fab');
                    if (oldBtn) {
                        const newBtn = oldBtn.cloneNode(true);
                        newBtn.textContent = 'Show corridors';
                        newBtn.classList.remove('active');
                        delete newBtn.dataset.counted;
                        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
                    }
                    ['conn-filter-high','conn-filter-moderate','conn-filter-low'].forEach(id => {
                        const old = document.getElementById(id);
                        if (old) old.parentNode.replaceChild(old.cloneNode(true), old);
                    });
                    setTimeout(() => {
                        resolvePatchLayerId();
                        if (map.getLayer(resolvedPatchId)) { applyForestFilter(); initializeHoverPopups(); initializeClickInfoPanel(); }
                        initializeConnectorLayer();
                    }, 800);
                } else {
                    if(filterSection) filterSection.style.display = 'none';
                    if(areaFilterControls) areaFilterControls.style.display = 'none';
                    if(statsSection) statsSection.style.display = 'none';
                    if(patchInfoContent) patchInfoContent.innerHTML = 'Forest data not available on satellite view.';
                }
            });
        });
    }

    function initializeAreaFilterControls() {
        const minAreaInput  = document.getElementById('min-area-input');
        const maxAreaInput  = document.getElementById('max-area-input');
        const applyAreaBtn  = document.getElementById('apply-area-filter-btn');
        const resetAreaBtn  = document.getElementById('reset-area-filter-btn');
        const areaFilterError = document.getElementById('area-filter-error');
        if (!minAreaInput || !maxAreaInput || !applyAreaBtn || !resetAreaBtn || !areaFilterError) return;
        applyAreaBtn.addEventListener('click', () => {
            areaFilterError.style.display = 'none'; areaFilterError.textContent = '';
            currentMinArea = (minAreaInput.value === '' || isNaN(parseFloat(minAreaInput.value)) || parseFloat(minAreaInput.value) < 0) ? null : parseFloat(minAreaInput.value);
            currentMaxArea = (maxAreaInput.value === '' || isNaN(parseFloat(maxAreaInput.value)) || parseFloat(maxAreaInput.value) < 0) ? null : parseFloat(maxAreaInput.value);
            minAreaInput.value = currentMinArea === null ? '' : currentMinArea;
            maxAreaInput.value = currentMaxArea === null ? '' : currentMaxArea;
            if (currentMinArea !== null && currentMaxArea !== null && currentMaxArea < currentMinArea) {
                areaFilterError.textContent = "Max Area cannot be less than Min Area.";
                areaFilterError.style.display = 'block'; return;
            }
            applyForestFilter();
        });
        resetAreaBtn.addEventListener('click', () => {
            minAreaInput.value = ''; maxAreaInput.value = '';
            currentMinArea = null; currentMaxArea = null;
            areaFilterError.style.display = 'none'; areaFilterError.textContent = '';
            applyForestFilter();
        });
        [minAreaInput, maxAreaInput].forEach(inp => {
            inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyAreaBtn.click(); });
            inp.addEventListener('input', () => { areaFilterError.style.display = 'none'; areaFilterError.textContent = ''; });
        });
    }

    function applyForestFilter() {
        if (!map.isStyleLoaded() || !map.getLayer(resolvedPatchId)) {
            if (!map.isStyleLoaded()) setTimeout(applyForestFilter, 300);
            return;
        }
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const allFilters = [];
        if (checkedTiers.length === 0) {
            allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH_POSSIBLE']);
        } else if (checkedTiers.length < ALL_TIERS.length) {
            allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }
        if (currentMinArea !== null && !isNaN(currentMinArea)) allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        if (currentMaxArea !== null && !isNaN(currentMaxArea)) allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        try {
            map.setFilter(resolvedPatchId, allFilters.length ? ['all', ...allFilters] : null);
            if (typeof debouncedUpdateStats === 'function') debouncedUpdateStats();
        } catch (error) { console.error('Error applying filter:', error); }
    }

    function updateSummaryStatistics() {
        const countEl    = document.getElementById('visible-patches-count');
        const areaEl     = document.getElementById('visible-patches-area');
        const ennEl      = document.getElementById('visible-patches-enn');
        const breakdownEl = document.getElementById('tier-stats-breakdown');
        if (!countEl || !areaEl || !breakdownEl) return;
        if (!map.isStyleLoaded() || !map.getLayer(resolvedPatchId)) {
            countEl.textContent = '-'; areaEl.textContent = '- ha';
            if (ennEl) ennEl.textContent = '- m'; breakdownEl.innerHTML = ''; return;
        }
        let features = [];
        try { features = map.queryRenderedFeatures({ layers: [resolvedPatchId] }); } catch(err) {}
        countEl.textContent = features.length.toLocaleString();

        let totalArea = 0, totalEnn = 0, validEnn = 0;
        const tierStats = {};
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        checkedTiers.forEach(t => { tierStats[t] = { count: 0, area: 0 }; });

        features.forEach(f => {
            const area = parseFloat(f.properties[PATCH_AREA_ATTRIBUTE]);
            const enn  = parseFloat(f.properties[ENN_ATTRIBUTE]);
            if (!isNaN(area)) totalArea += area;
            if (!isNaN(enn))  { totalEnn += enn; validEnn++; }
            const tier = f.properties[TIER_ATTRIBUTE];
            if (tier && tierStats[tier]) { tierStats[tier].count++; if (!isNaN(area)) tierStats[tier].area += area; }
        });

        areaEl.textContent = totalArea.toFixed(2).toLocaleString() + ' ha';
        if (ennEl) ennEl.textContent = validEnn > 0 ? (totalEnn / validEnn).toFixed(2).toLocaleString() + ' m' : '- m';

        let html = '<h5 style="margin:0 0 5px;font-size:0.9em;color:inherit">Breakdown by visible category:</h5>';
        if (features.length === 0 && checkedTiers.length === 0) {
            html += '<p style="color:#888;font-style:italic">No categories selected.</p>';
        } else {
            checkedTiers.forEach(tier => {
                if (tierStats[tier]) {
                    const tierLabel = (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[tier]) || tier;
                    html += `<p><strong>${tierLabel}:</strong> ${tierStats[tier].count.toLocaleString()} patches, ${tierStats[tier].area.toFixed(2).toLocaleString()} ha</p>`;
                }
            });
            if (features.length === 0 && checkedTiers.length > 0)
                html += '<p style="color:#888;font-style:italic">No patches match current filters.</p>';
        }
        breakdownEl.innerHTML = html;
    }

    function displayPatchInfo(properties) {
        const el = document.getElementById('patch-info-content');
        if (!el) return;
        if (!properties) { el.innerHTML = 'No data for this patch.'; return; }

        // Expose last clicked patch properties for report card feature
        window._lastPatchProps = properties;

        const tier = properties[TIER_ATTRIBUTE];
        const conn = properties[CONNECTIVITY_ATTRIBUTE];
        const area = properties[PATCH_AREA_ATTRIBUTE];
        const core = properties[CORE_AREA_ATTRIBUTE];
        const enn  = properties[ENN_ATTRIBUTE];
        const flow = properties[MEAN_FLOW_ATTRIBUTE];
        const id   = properties[PATCH_ID_ATTRIBUTE];

        const tierDesc = {
            'Tier 1 (Primary forest)': 'One of the more structurally important forest patches in this landscape. Large enough to support a high level of biodiversity, with substantial interior area protected from edge effects.',
            'Tier 2 (Established forest)': 'A high-quality patch that could function as a key hub or stepping stone in a potential movement network. Important for regional habitat connectivity.',
            'Tier 3 (Functional fragments)': 'A moderately connected forest fragment that could play a bridging role between larger patches in the landscape.',
            'Tier 4 (Vulnerable fragments)': 'A patch with significant edge exposure relative to its size. Functionally important but vulnerable to further habitat loss or degradation.',
            'Tier 5 (Marginal fragments)': 'A small, isolated forest fragment with limited connectivity potential to the surrounding landscape.',
            'Tier 6 (Remnant patches)': 'A highly isolated micro-patch or remnant forest fragment. Generally too small and disconnected to support resident populations, but may provide temporary shelter.'
        };
        const connDesc = {
            'High':    'This patch has high connectivity potential. The surrounding landscape presents less barriers to movement to neighbouring patches, suitable for a corridor.',
            'Moderate':'This patch has moderate connectivity potential. A corridor to neighbouring patches is possible but depends on the routes available through the landscape.',
            'Low':     'This patch has low connectivity potential. The surrounding landscape presents significant resistance to movement between patches, even with a corridor in place.',
            'Barrier': 'This patch is surrounded by an impermeable barrier zone such as dense urban development. Movement to neighbouring patches is effectively impossible.',
            'No Data': 'Connectivity data is not available for this patch.'
        };
        const metricInfo = {
            area:   'The total area of the forest patch in hectares.',
            core:   'The area of the patch buffered from external disturbance. The most ecologically stable part of the patch.',
            contig: 'Compactness of the patch, 0–1. Higher = more solid shape.',
            para:   'Perimeter-to-area ratio. Higher = more irregular or elongated shape.',
            enn:    'Straight-line distance to the nearest adjacent forest patch, in metres.',
            flow:   'Mean composite current flow, 0–300 scale. Higher = more central to the connectivity network.'
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
        const tierDisplay = (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[tier]) || tier || 'Unknown';
        h += '<div style="background:' + tc + ';color:#fff;padding:5px 9px;border-radius:3px;font-weight:700;margin-bottom:8px;font-size:0.82em">' + tierDisplay + '</div>';
        h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (tierDesc[tier] || '') + '</p>';
        if (conn && conn !== 'No Data') {
            h += '<div style="margin-bottom:4px;font-size:0.87em"><strong>Connectivity:</strong> <span style="background:' + cc + ';color:' + ct + ';padding:1px 7px;border-radius:3px;font-weight:700">' + conn + '</span></div>';
            h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (connDesc[conn] || '') + '</p>';
        }
        h += '<div style="font-size:0.87em;margin-bottom:10px"><strong>Nearest patch:</strong> ' + ennMsg + '</div>';
        h += '<details><summary style="cursor:pointer;font-weight:700;font-size:0.87em;color:inherit">Show technical details</summary>';
        h += '<ul style="margin:6px 0;padding-left:0;font-size:0.84em;line-height:1.8;color:inherit;list-style:none">';
        if (id !== undefined) h += '<li><strong>Patch ID:</strong> ' + id + '</li>';
        if (typeof area === 'number') h += '<li><strong>Total area:</strong> ' + area.toFixed(2) + ' ha' + infoBtn('area') + '</li>';
        if (typeof core === 'number') h += '<li><strong>Core area:</strong> ' + core.toFixed(2) + ' ha' + infoBtn('core') + '</li>';
        if (typeof properties[CONTIGUITY_INDEX_ATTRIBUTE] === 'number') h += '<li><strong>Contiguity index:</strong> ' + properties[CONTIGUITY_INDEX_ATTRIBUTE].toFixed(3) + infoBtn('contig') + '</li>';
        if (typeof properties[PERIMETER_AREA_RATIO_ATTRIBUTE] === 'number') h += '<li><strong>Perimeter-area ratio:</strong> ' + properties[PERIMETER_AREA_RATIO_ATTRIBUTE].toFixed(5) + infoBtn('para') + '</li>';
        if (!isNaN(ennNum)) h += '<li><strong>ENN distance:</strong> ' + Math.round(ennNum) + ' m' + infoBtn('enn') + '</li>';
        if (flow !== undefined && flow !== null) h += '<li><strong>Mean composite flow:</strong> ' + (typeof flow === 'number' ? flow.toFixed(2) : flow) + infoBtn('flow') + '</li>';
        h += '</ul>';
        h += '<div id="metric-inline-popup" style="display:none;margin-top:8px;background:#f0f4ff;border:1px solid #c0cfe8;border-radius:4px;padding:8px 10px;font-size:0.83em;line-height:1.5;color:#212529"></div>';
        h += '</details></div>';
        el.innerHTML = h;

        el.style.opacity = '0';
        requestAnimationFrame(() => { el.style.transition = 'opacity 0.2s ease'; el.style.opacity = '1'; });

        el.querySelectorAll('.metric-info-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var popup = el.querySelector('#metric-inline-popup');
                var key   = btn.getAttribute('data-info');
                if (popup.style.display === 'block' && popup.dataset.key === key) {
                    popup.style.display = 'none';
                } else {
                    popup.textContent = metricInfo[key] || '';
                    popup.dataset.key = key;
                    popup.style.display = 'block';
                }
            });
        });
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

    initializeAboutModal();
    initializeHowToModal();
    initializeDarkModeToggle();

    function initializeAboutModal() {
        const aboutBtn    = document.getElementById('about-btn');
        const aboutModal  = document.getElementById('about-modal');
        if (!aboutModal) { if(aboutBtn) aboutBtn.disabled = true; return; }
        const closeModalBtn = aboutModal.querySelector('.close-modal-btn');
        if (!aboutBtn || !closeModalBtn) { if(aboutBtn) aboutBtn.disabled = true; return; }
        function openModal()  { aboutModal.style.display = 'block'; requestAnimationFrame(() => document.body.classList.add('modal-open')); }
        function closeModal() {
            document.body.classList.remove('modal-open');
            setTimeout(() => { if (!document.body.classList.contains('modal-open')) aboutModal.style.display = 'none'; }, 300);
        }
        aboutBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);
        window.addEventListener('click', (e) => { if (e.target == aboutModal) closeModal(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('modal-open')) closeModal(); });
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
        const toggleButton = document.getElementById('dark-mode-toggle');
        if (!toggleButton) return;
        if (localStorage.getItem('darkMode') === 'enabled') {
            document.body.classList.add('dark-mode');
            toggleButton.textContent = '☀️'; toggleButton.setAttribute('aria-label', 'Switch to light mode');
        } else {
            toggleButton.textContent = '🌙'; toggleButton.setAttribute('aria-label', 'Switch to dark mode');
        }
        toggleButton.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
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
    const sidebar          = document.getElementById('sidebar');
    const appContainer     = document.getElementById('app-container');
    if (toggleSidebarBtn && sidebar && appContainer) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            appContainer.classList.toggle('sidebar-collapsed');
            setTimeout(() => { map.resize(); }, 250);
            toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
            toggleSidebarBtn.setAttribute('aria-label', sidebar.classList.contains('collapsed') ? 'Open sidebar' : 'Close sidebar');
            toggleSidebarBtn.setAttribute('aria-expanded', String(!sidebar.classList.contains('collapsed')));
        });
    }

    function updateUrlHash() {
        const c = map.getCenter();
        history.replaceState(null, '', '#' + map.getZoom().toFixed(2) + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5));
    }
    function applyUrlHash() {
        const parts = window.location.hash.slice(1).split('/');
        if (parts.length >= 3) {
            const zoom = parseFloat(parts[0]), lat = parseFloat(parts[1]), lng = parseFloat(parts[2]);
            if (!isNaN(zoom) && !isNaN(lat) && !isNaN(lng)) map.jumpTo({ center: [lng, lat], zoom });
        }
    }
    map.on('load', applyUrlHash);
    map.on('moveend', updateUrlHash);

    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            updateUrlHash();
            navigator.clipboard.writeText(window.location.href).then(() => {
                const orig = copyLinkBtn.textContent;
                copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => { copyLinkBtn.textContent = orig; }, 2000);
            }).catch(() => { prompt('Copy this link:', window.location.href); });
        });
    }

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

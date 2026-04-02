// --- VERY TOP OF app.js for file loading check ---
console.log("--- app.js LATEST (Improved Modal, Stats on Idle, Info Icons) - Timestamp: " + new Date().toLocaleTimeString() + " ---");

// Define descriptions for metrics. These constants (PATCH_AREA_ATTRIBUTE, etc.) are from config.js
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Total area of the forest patch in hectares. Larger patches can support more species and are more resilient to edge effects.",
    [CORE_AREA_ATTRIBUTE]: "The interior area of the patch that is sufficiently buffered from the edge. Edge zones experience altered conditions such as increased light and wind. Core area represents the stable interior habitat that sensitive arboreal animals depend on.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "A measure of how compact and internally connected the patch is. Values range from 0 to 1, where 1 indicates a perfectly contiguous patch. More contiguous patches allow easier movement within the patch.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "The ratio of the patch perimeter to its area. A higher ratio means the patch has a more irregular or elongated shape, with a greater proportion of edge habitat relative to interior.",
    [ENN_ATTRIBUTE]: "The straight-line distance to the nearest adjacent forest patch, in metres. Lower values indicate the patch is closer to other forest areas and more likely to be reached by dispersing animals.",
    [CONNECTIVITY_ATTRIBUTE]: "A connectivity rating derived from circuit theory modelling across the landscape. High indicates the patch sits within an active movement corridor. Moderate indicates partial connectivity. Low indicates the surrounding landscape presents significant resistance. Barrier indicates the patch is surrounded by an impermeable urban or agricultural matrix.",
    [MEAN_FLOW_ATTRIBUTE]: "The mean composite current flow value within this patch, on a 0 to 300 scale. Higher values indicate the patch carries more movement current and is more central to the regional connectivity network."
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
    // Standard initialization logic
    if (map.getSource('mapbox-dem')) {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    }
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    initializeTierFilters();
    initializeColorModeToggle();
    initializeConnectorLayer();
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
map.on('idle', () => {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        // Slight delay so the user can actually read the "boot sequence"
        setTimeout(() => {
            loadingIndicator.style.display = 'none';
        }, 3500);
    }
    updateSummaryStatistics();
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
        filterContainer.innerHTML = '<h3>Filter by Category</h3>';

        ALL_TIERS.forEach(tierValueFromConfig => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.className = 'tier-toggle';
            checkbox.value = tierValueFromConfig; 
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                console.log(`--- TIER CHECKBOX CHANGE for "${tierValueFromConfig}" ---`);
                applyForestFilter();
            });
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box'; colorBox.style.backgroundColor = TIER_COLORS[tierValueFromConfig] || '#ccc';
            label.appendChild(colorBox); label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tierValueFromConfig}`));
            filterContainer.appendChild(label);
        });
        console.log("Tier filters with color boxes initialized. Applying initial filter...");
        applyForestFilter();
    }

    function initializeColorModeToggle() {
        const btn = document.getElementById('color-mode-toggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            CURRENT_COLOR_MODE = CURRENT_COLOR_MODE === 'tier' ? 'connectivity' : 'tier';
            btn.textContent = CURRENT_COLOR_MODE === 'tier'
                ? 'View by: Conservation Tier'
                : 'View by: Connectivity';
            applyColorMode();
        });
    }

    function applyColorMode() {
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        if (CURRENT_COLOR_MODE === 'connectivity') {
            map.setPaintProperty(FOREST_PATCH_LAYER_ID, 'fill-color',
                ['match', ['get', CONNECTIVITY_ATTRIBUTE],
                    'High', '#f7ce46', 'Moderate', '#e07c1f',
                    'Low', '#a03030', 'Barrier', '#2c1a4a', '#888888']);
        } else {
            map.setPaintProperty(FOREST_PATCH_LAYER_ID, 'fill-color',
                ['match', ['get', TIER_ATTRIBUTE],
                    'Tier 1 (Core Habitat)', '#b1eaac',
                    'Tier 2 (Major Stepping Stones)', '#8ad284',
                    'Tier 3 (Connected Fragments)', '#5aaf64',
                    'Tier 4 (Vulnerable Edge Fragments)', '#2a8234',
                    'Tier 5 (Isolated Fragments)', '#1e6b27',
                    'Tier 6 (Isolated Micro Patches)', '#0a4c12',
                    '#cccccc']);
        }
    }

    function initializeConnectorLayer() {
        if (!CONNECTOR_LAYER_ID || !map.getLayer(CONNECTOR_LAYER_ID)) {
            console.warn('Connector layer not found in style:', CONNECTOR_LAYER_ID);
            const btn = document.getElementById('connector-toggle');
            if (btn) btn.style.display = 'none';
            return;
        }
        map.setLayoutProperty(CONNECTOR_LAYER_ID, 'visibility', 'none');

        // Style by connectivity
        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-color',
            ['match', ['get', 'connectivity'],
                'High', '#f7ce46', 'Moderate', '#e07c1f', 'Low', '#a03030', '#888888']);
        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-width', 3);
        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-opacity', 0.9);

        const connPopup = new mapboxgl.Popup({
            closeButton: false, closeOnClick: false, className: 'custom-hover-popup'
        });
        map.on('mousemove', CONNECTOR_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const f = e.features[0].properties;
                connPopup.setLngLat(e.lngLat)
                    .setHTML('<strong>Potential movement corridor</strong><br>Gap to nearest patch: ' + f.gap_m + ' m<br>Connectivity: ' + f.connectivity)
                    .addTo(map);
            }
        });
        map.on('mouseleave', CONNECTOR_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
            connPopup.remove();
        });
        map.on('click', CONNECTOR_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                const f = e.features[0].properties;
                const el = document.getElementById('patch-info-content');
                if (el) {
                    el.innerHTML =
                        '<div style="padding:4px">' +
                        '<strong>Potential movement corridor</strong><br><br>' +
                        '<strong>Gap to nearest patch:</strong> ' + f.gap_m + ' m<br>' +
                        '<strong>Connectivity:</strong> ' + f.connectivity + '<br>' +
                        '<strong>Source patch area:</strong> ' + f.area_ha + ' ha<br>' +
                        '<strong>Mean composite flow:</strong> ' + f.mean_flow + '<br><br>' +
                        '<em>' + (f.crossing_note || '') + '</em>' +
                        '</div>';
                }
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    document.getElementById('toggle-sidebar-btn').click();
                }
            }
        });

        const btn = document.getElementById('connector-toggle');
        if (btn) {
            let visible = false;
            btn.addEventListener('click', () => {
                visible = !visible;
                map.setLayoutProperty(CONNECTOR_LAYER_ID, 'visibility', visible ? 'visible' : 'none');
                btn.textContent = visible ? 'Hide Corridors' : 'Show Corridors';
                btn.classList.toggle('active', visible);
            });
        }
    }

    function initializeHoverPopups() {
        console.log("DEBUG: initializeHoverPopups() function EXECUTED.");
        const hoverPopup = new mapboxgl.Popup({
            closeButton: false, closeOnClick: false, className: 'custom-hover-popup'
        });
        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const feature = e.features[0];
                const patchIdVal = feature.properties[PATCH_ID_ATTRIBUTE];
                const categoryVal = feature.properties[TIER_ATTRIBUTE];
                const popupContent = `<strong>ID:</strong> ${patchIdVal !== undefined ? patchIdVal : 'N/A'}<br><strong>Category:</strong> ${categoryVal !== undefined ? categoryVal : 'N/A'}`;
                hoverPopup.setLngLat(e.lngLat).setHTML(popupContent).addTo(map);
            }
        });
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
            map.getCanvas().style.cursor = ''; hoverPopup.remove();
        });
    }

    function initializeClickInfoPanel() {
        console.log("DEBUG: initializeClickInfoPanel() function EXECUTED.");
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) { console.error("Patch info content panel not found!"); return; }
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                displayPatchInfo(feature.properties);
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    document.getElementById('toggle-sidebar-btn').click();
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
                if (map.getSource('mapbox-dem')) map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
                
                const patchInfoContent = document.getElementById('patch-info-content');
                if (newStyleUrl === MAP_STYLE_CUSTOM) {
                    if(filterSection) filterSection.style.display = 'block';
                    if(areaFilterControls) areaFilterControls.style.display = 'block';
                    if(statsSection) statsSection.style.display = 'block'; 
                    if(patchInfoContent) patchInfoContent.innerHTML = 'Select a patch on the map to see details.';
                    setTimeout(() => {
                        if (map.getLayer(FOREST_PATCH_LAYER_ID)) { 
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
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) {
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
            map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilterExpression);
            
            // Immediately force the summary stats to update so they match the screen
            if (typeof updateSummaryStatistics === 'function') {
                setTimeout(updateSummaryStatistics, 100); 
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
        
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) {
             countEl.textContent = '-'; 
             areaEl.textContent = '- ha'; 
             if (ennEl) ennEl.textContent = '- m';
             breakdownEl.innerHTML = ''; 
             return;
        }
        
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
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

        let breakdownHtml = '<h5>Breakdown by Visible Category:</h5>';
        if (features.length > 0 || currentlyCheckedTiers.length > 0 ) { 
             currentlyCheckedTiers.forEach(tier => {
                if (tierStats[tier]) { 
                    breakdownHtml += `<p><strong>${formatPropertyName(tier)}:</strong> ${tierStats[tier].count.toLocaleString()} patches, ${tierStats[tier].area.toFixed(2).toLocaleString()} ha</p>`;
                }
            });
             if (features.length === 0 && currentlyCheckedTiers.length > 0) {
                breakdownHtml += '<p>No patches match current filter combination.</p>';
            }
        } else if (features.length === 0 && currentlyCheckedTiers.length === 0) {
             breakdownHtml += '<p>No categories selected.</p>';
        } else { 
            breakdownHtml += '<p>No patches visible with current filters.</p>';
        }
        breakdownEl.innerHTML = breakdownHtml;
        console.log(`DEBUG: Stats updated - Overall: ${features.length} patches, ${overallTotalArea.toFixed(2)} ha.`);
    }

    function displayPatchInfo(properties) {
        console.log("DEBUG: displayPatchInfo() function EXECUTED.", properties);
        const patchInfoContent = document.getElementById('patch-info-content');
        patchInfoContent.innerHTML = '';
        if (!properties) { patchInfoContent.innerHTML = 'No data for this patch.'; return; }

        const tier = properties[TIER_ATTRIBUTE];
        const connectivity = properties[CONNECTIVITY_ATTRIBUTE];
        const area = properties[PATCH_AREA_ATTRIBUTE];
        const core = properties[CORE_AREA_ATTRIBUTE];
        const enn  = properties[ENN_ATTRIBUTE];
        const flow = properties[MEAN_FLOW_ATTRIBUTE];
        const id   = properties[PATCH_ID_ATTRIBUTE];

        const tierDesc = {
            'Tier 1 (Core Habitat)':
                'This is one of the most structurally important forest patches in the landscape. It is large enough to support a resident group of arboreal animals and has substantial interior area protected from edge effects.',
            'Tier 2 (Major Stepping Stones)':
                'A high-quality patch that functions as a key hub or stepping stone within the movement network. Critical for regional habitat connectivity.',
            'Tier 3 (Connected Fragments)':
                'A moderately connected forest fragment that plays a bridging role between larger patches in the landscape.',
            'Tier 4 (Vulnerable Edge Fragments)':
                'A patch with significant edge exposure relative to its size. Functionally important but vulnerable to further habitat loss or degradation.',
            'Tier 5 (Isolated Fragments)':
                'A small, isolated forest fragment with limited connectivity to the surrounding landscape. May support a small number of individuals but is poorly linked to the wider network.',
            'Tier 6 (Isolated Micro Patches)':
                'A highly isolated micro-patch or remnant forest fragment. These patches are generally too small and disconnected to support resident populations of arboreal animals, but may provide temporary shelter.'
        };

        const connDesc = {
            'High':    'This patch sits within an active movement corridor. The surrounding landscape allows relatively free movement to neighbouring patches.',
            'Moderate':'This patch has moderate connectivity. Movement to neighbouring patches is possible but depends on the specific routes available through the landscape.',
            'Low':     'This patch has low connectivity. The surrounding landscape presents significant resistance to movement between patches.',
            'Barrier': 'This patch is surrounded by an impermeable barrier zone such as dense urban development. Unaided movement to neighbouring patches is effectively impossible.',
            'No Data': 'Connectivity data is not available for this patch.'
        };

        const ennNum = typeof enn === 'number' ? enn : parseFloat(enn);
        let ennMsg;
        if (!isNaN(ennNum)) {
            if (ennNum <= 30) {
                ennMsg = 'This patch is directly adjacent to another forest area.';
            } else if (ennNum <= 800) {
                ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away, within the typical dispersal range for arboreal animals.';
            } else if (ennNum <= 2000) {
                ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away, beyond the typical single-generation dispersal distance for most arboreal animals.';
            } else {
                ennMsg = 'The nearest patch is ' + Math.round(ennNum) + ' m away. This patch is functionally isolated at the landscape scale.';
            }
        } else { ennMsg = 'Distance data not available.'; }

        let html = '<div class="plain-info-panel">';

        // Tier
        html += '<div class="info-tier-badge" style="background:' + (TIER_COLORS[tier] || '#555') + ';color:#fff;padding:6px 10px;border-radius:3px;font-weight:bold;margin-bottom:8px">' + (tier || 'Unknown') + '</div>';
        html += '<p style="margin:6px 0 12px">' + (tierDesc[tier] || '') + '</p>';

        // Connectivity
        if (connectivity && connectivity !== 'No Data') {
            html += '<strong>Connectivity:</strong> <span style="display:inline-block;padding:2px 8px;border-radius:3px;background:' +
                (CONNECTIVITY_COLORS[connectivity] || '#888') + ';color:' +
                (connectivity === 'High' || connectivity === 'Moderate' ? '#1a1a1a' : '#fff') + '">' +
                connectivity + '</span>';
            html += '<p style="margin:4px 0 12px">' + (connDesc[connectivity] || '') + '</p>';
        }

        // Nearest patch
        html += '<strong>Nearest patch:</strong><p style="margin:4px 0 12px">' + ennMsg + '</p>';

        // Technical details (collapsed)
        html += '<details style="margin-top:8px"><summary style="cursor:pointer">Show technical details</summary><ul style="margin:8px 0;padding-left:16px">';
        html += '<li><strong>Patch ID:</strong> ' + (id || 'N/A') + '</li>';
        if (typeof area === 'number') html += '<li><strong>Total area:</strong> ' + area.toFixed(2) + ' ha</li>';
        if (typeof core === 'number') html += '<li><strong>Core area:</strong> ' + core.toFixed(2) + ' ha <span class="metric-info-icon" data-metric-key="' + CORE_AREA_ATTRIBUTE + '" role="button" tabindex="0">i</span></li>';
        if (typeof properties[CONTIGUITY_INDEX_ATTRIBUTE] === 'number') html += '<li><strong>Contiguity index:</strong> ' + properties[CONTIGUITY_INDEX_ATTRIBUTE].toFixed(3) + ' <span class="metric-info-icon" data-metric-key="' + CONTIGUITY_INDEX_ATTRIBUTE + '" role="button" tabindex="0">i</span></li>';
        if (typeof properties[PERIMETER_AREA_RATIO_ATTRIBUTE] === 'number') html += '<li><strong>Perimeter-area ratio:</strong> ' + properties[PERIMETER_AREA_RATIO_ATTRIBUTE].toFixed(5) + ' <span class="metric-info-icon" data-metric-key="' + PERIMETER_AREA_RATIO_ATTRIBUTE + '" role="button" tabindex="0">i</span></li>';
        if (!isNaN(ennNum)) html += '<li><strong>Distance to nearest patch:</strong> ' + Math.round(ennNum) + ' m <span class="metric-info-icon" data-metric-key="' + ENN_ATTRIBUTE + '" role="button" tabindex="0">i</span></li>';
        if (flow !== undefined && flow !== null) html += '<li><strong>Mean composite flow:</strong> ' + (typeof flow === 'number' ? flow.toFixed(2) : flow) + ' <span class="metric-info-icon" data-metric-key="' + MEAN_FLOW_ATTRIBUTE + '" role="button" tabindex="0">i</span></li>';
        html += '</ul></details></div>';

        patchInfoContent.innerHTML = html;

        patchInfoContent.querySelectorAll('.metric-info-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                showMetricInfoPopup(icon.getAttribute('data-metric-key'), icon);
            });
        });
    }

    function showMetricInfoPopup(metricKey, iconElement) {
        if (metricPopup) {
            metricPopup.remove();
            metricPopup = null;
        }

        const description = METRIC_DESCRIPTIONS[metricKey];
        if (!description) return;

        metricPopup = document.createElement('div');
        metricPopup.id = 'metric-info-popup';
        metricPopup.innerHTML = `
            <p>${description}</p>
            <button class="close-metric-popup-btn" aria-label="Close metric description">Close</button>
        `;
        document.body.appendChild(metricPopup);

        const iconRect = iconElement.getBoundingClientRect();
        metricPopup.style.position = 'fixed';
        
        // Initial position: below the icon
        let top = iconRect.bottom + 5;
        let left = iconRect.left;

        metricPopup.style.top = `${top}px`;
        metricPopup.style.left = `${left}px`;
        
        // Adjust if popup goes off screen
        const popupRect = metricPopup.getBoundingClientRect();

        if (popupRect.right > window.innerWidth - 10) {
            left = window.innerWidth - popupRect.width - 10;
        }
        if (popupRect.bottom > window.innerHeight - 10) {
            top = iconRect.top - popupRect.height - 5; // Place above icon
        }
        if (left < 10) {
            left = 10;
        }
        if (top < 10 && (iconRect.top - popupRect.height - 5 < 10) ) { // If placing above also goes offscreen
            top = 10; // Stick to top
        }


        metricPopup.style.top = `${top}px`;
        metricPopup.style.left = `${left}px`;

        const closeBtn = metricPopup.querySelector('.close-metric-popup-btn');
        closeBtn.focus(); // Set focus to the close button for accessibility
        closeBtn.addEventListener('click', () => {
            metricPopup.remove();
            metricPopup = null;
            iconElement.focus(); // Return focus to the icon
        });

        // Close with Escape key
        metricPopup.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeBtn.click();
            }
        });
    }

    // Global click listener to close metric popup if clicked outside
    document.addEventListener('click', function(event) {
        if (metricPopup) {
            const isClickInsidePopup = metricPopup.contains(event.target);
            // Check if the click target or its parent is an info icon
            const isClickOnAnIcon = event.target.classList.contains('metric-info-icon') || (event.target.parentElement && event.target.parentElement.classList.contains('metric-info-icon'));

            if (!isClickInsidePopup && !isClickOnAnIcon) {
                metricPopup.remove();
                metricPopup = null;
            }
        }
    });


    function formatPropertyName(name) {
        let formattedName = name;
        if (name === TIER_ATTRIBUTE) return 'Category';
        if (name === PATCH_AREA_ATTRIBUTE) return 'Patch Area';
        if (name === CORE_AREA_ATTRIBUTE) return 'Core Area';
        if (name === CONNECTIVITY_ATTRIBUTE) return 'Connectivity';
        if (name === MEAN_FLOW_ATTRIBUTE) return 'Mean Composite Flow';
        formattedName = formattedName.replace(/_/g, ' ').replace(/ #$/, '');
        formattedName = formattedName.replace(/\b\w/g, l => l.toUpperCase());
        return formattedName;
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
        const howtoBtn   = document.getElementById('howto-btn');
        const howtoModal = document.getElementById('howto-modal');
        const closeBtn   = document.getElementById('close-howto-btn');
        if (!howtoBtn || !howtoModal || !closeBtn) return;
        function open()  { howtoModal.style.display = 'block'; requestAnimationFrame(() => document.body.classList.add('modal-open')); }
        function close() { document.body.classList.remove('modal-open'); setTimeout(() => { howtoModal.style.display = 'none'; }, 300); }
        howtoBtn.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        window.addEventListener('click', (e) => { if (e.target === howtoModal) close(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('modal-open')) close(); });
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
}); // End DOMContentLoaded

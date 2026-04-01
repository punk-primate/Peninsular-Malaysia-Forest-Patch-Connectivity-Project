// --- VERY TOP OF app.js for file loading check ---
console.log("--- app.js LATEST (Connectivity Integration) - Timestamp: " + new Date().toLocaleTimeString() + " ---");

// Define descriptions for metrics. These constants (PATCH_AREA_ATTRIBUTE, etc.) are from config.js
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha). This indicates the overall size of the habitat.",
    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch that is buffered from edge effects (e.g., changes in light, wind, temperature), in hectares (ha). It represents the more stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of the spatial connectedness or compactness of cells within a patch. Values range from 0 to 1, where higher values indicate more contiguous, less fragmented patches, which is generally better for biodiversity.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area. A higher ratio often indicates a more elongated or irregular shape, leading to a greater proportion of edge habitat compared to core habitat.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): The shortest straight-line distance to the nearest neighboring forest patch, in meters. Lower values indicate greater spatial connectivity.",
    [CONNECTIVITY_ATTRIBUTE]: "Connectivity: A categorical rating derived from omnidirectional circuit theory modelling (Omniscape). High = patch sits within a high current flow corridor; Moderate = intermediate flow; Low = low flow; Barrier = patch lies within the near-zero flow urban or agricultural barrier zone.",
    [MEAN_FLOW_ATTRIBUTE]: "Mean Composite Flow: The average normalised current flow value within this patch across all three resistance scenarios and three spatial scales, summed as a composite index (0–300 scale). Higher values indicate the patch carries more movement current and is more central to the connectivity network.",
    [PINCH_PCT_ATTRIBUTE]: "Pinch Point Coverage (%): The percentage of this patch's area classified as a structural pinch point — i.e., in the top 10% of composite current flow across the landscape. Patches with high pinch point coverage are critical connectivity bottlenecks where habitat loss would have the greatest impact on regional movement for Hylobates lar."
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
    initializeConnectivityFilters();
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

    function initializeConnectivityFilters() {
        const filterContainer = document.querySelector('#connectivity-filter-section');
        if (!filterContainer) return;
        filterContainer.innerHTML = '<h3>Filter by Connectivity</h3>';
        ALL_CONNECTIVITY_LABELS.forEach(label => {
            const itemLabel = document.createElement('label');
            itemLabel.className = 'filter-legend-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'connectivity-toggle';
            checkbox.value = label;
            checkbox.checked = true;
            checkbox.addEventListener('change', applyForestFilter);
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box';
            colorBox.style.backgroundColor = CONNECTIVITY_COLORS[label] || '#ccc';
            itemLabel.appendChild(colorBox);
            itemLabel.appendChild(checkbox);
            itemLabel.appendChild(document.createTextNode(` ${label}`));
            filterContainer.appendChild(itemLabel);
        });
    }

    function initializeColorModeToggle() {
        const btn = document.getElementById('color-mode-toggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            CURRENT_COLOR_MODE = CURRENT_COLOR_MODE === 'tier' ? 'connectivity' : 'tier';
            btn.textContent = CURRENT_COLOR_MODE === 'tier'
                ? 'Colour by: Tier'
                : 'Colour by: Connectivity';
            applyColorMode();
        });
    }

    function applyColorMode() {
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        if (CURRENT_COLOR_MODE === 'connectivity') {
            const colorExpression = ['match', ['get', CONNECTIVITY_ATTRIBUTE],
                ...Object.entries(CONNECTIVITY_COLORS).flatMap(([k, v]) => [k, v]),
                '#888888'
            ];
            map.setPaintProperty(FOREST_PATCH_LAYER_ID, 'fill-color', colorExpression);
        } else {
            const colorExpression = ['match', ['get', TIER_ATTRIBUTE],
                ...Object.entries(TIER_COLORS).flatMap(([k, v]) => [k, v]),
                '#cccccc'
            ];
            map.setPaintProperty(FOREST_PATCH_LAYER_ID, 'fill-color', colorExpression);
        }
    }

    function initializeConnectorLayer() {
        // The connector layer already exists in the Mapbox style.
        // We only need to override its paint properties and attach event listeners.
        // CONNECTOR_LAYER_ID must match the layer name exactly as it appears in Studio.
        if (!CONNECTOR_LAYER_ID) return;

        if (!map.getLayer(CONNECTOR_LAYER_ID)) {
            console.warn('Connector layer not found in style:', CONNECTOR_LAYER_ID);
            return;
        }

        // Start hidden — user turns on with the toggle button
        map.setLayoutProperty(CONNECTOR_LAYER_ID, 'visibility', 'none');

        // Override Studio styling with data-driven paint properties
        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-color',
            ['match', ['get', 'connectivity'],
                'High',     '#f7ce46',
                'Moderate', '#e07c1f',
                'Low',      '#a03030',
                '#555555'
            ]
        );

        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-width',
            ['case', ['==', ['get', 'within_dispersal'], true], 2.5, 1.0]
        );

        map.setPaintProperty(CONNECTOR_LAYER_ID, 'line-opacity',
            ['case', ['==', ['get', 'within_dispersal'], true], 0.85, 0.35]
        );

        // Hover popup
        const connPopup = new mapboxgl.Popup({
            closeButton: false, closeOnClick: false, className: 'custom-hover-popup'
        });

        map.on('mousemove', CONNECTOR_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const f = e.features[0].properties;
                connPopup.setLngLat(e.lngLat)
                    .setHTML(`<strong>Potential movement pathway</strong><br>Gap: ${f.gap_m} m`)
                    .addTo(map);
            }
        });
        map.on('mouseleave', CONNECTOR_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
            connPopup.remove();
        });

        // Click — plain English info panel
        map.on('click', CONNECTOR_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                displayConnectorInfo(e.features[0].properties);
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    document.getElementById('toggle-sidebar-btn').click();
                }
            }
        });

        // Toggle button
        const btn = document.getElementById('connector-toggle');
        if (btn) {
            btn.addEventListener('click', () => {
                const visible = map.getLayoutProperty(CONNECTOR_LAYER_ID, 'visibility');
                const nowHidden = visible === 'none';
                map.setLayoutProperty(CONNECTOR_LAYER_ID, 'visibility',
                    nowHidden ? 'visible' : 'none');
                btn.textContent = nowHidden
                    ? 'Hide Movement Pathways'
                    : 'Show Movement Pathways';
                btn.classList.toggle('active', nowHidden);
            });
        }
    }

    function displayConnectorInfo(props) {
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;

        const withinDispersal = props.within_dispersal === true || props.within_dispersal === 'true';
        const gapIcon = withinDispersal ? '✅' : '⚠️';
        const gapClass = withinDispersal ? 'conn-good' : 'conn-warn';

        patchInfoContent.innerHTML = `
            <div class="conn-info-panel">
                <div class="conn-header">🔗 Potential Movement Pathway</div>
                <div class="conn-gap ${gapClass}">
                    ${gapIcon} <strong>Gap distance: ${props.gap_m} m</strong>
                </div>
                <div class="conn-note">${props.crossing_note || ''}</div>
                <hr class="conn-divider">
                <div class="conn-stat"><span>Connectivity:</span>
                    <span class="conn-badge" style="background:${CONNECTIVITY_COLORS[props.connectivity] || '#888'};
                    color:${props.connectivity === 'High' || props.connectivity === 'Moderate' ? '#1a1a1a' : '#fff'}">
                        ${props.connectivity}
                    </span>
                </div>
                <div class="conn-stat"><span>Source patch area:</span> <span>${props.area_ha} ha</span></div>
                <div class="conn-stat"><span>Mean composite flow:</span> <span>${props.mean_flow}</span></div>
                <div class="conn-stat"><span>Pinch point coverage:</span> <span>${props.pinch_pct}%</span></div>
                <div class="conn-legend">
                    <div><span class="conn-line solid"></span> Within gibbon dispersal range (≤ 800 m)</div>
                    <div><span class="conn-line dashed"></span> Beyond typical dispersal range</div>
                </div>
            </div>
        `;
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
                if (selectedPatchMapboxId !== null) {
                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: false });
                }
                selectedPatchMapboxId = feature.id;
                if (selectedPatchMapboxId !== null && selectedPatchMapboxId !== undefined) {
                     map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: true });
                } else { console.warn("DEBUG: Clicked feature has no usable 'id' for selection state."); }
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
                placeholder: 'Search in the Klang Valley',
                bbox: [101.0, 2.5, 102.0, 3.5], 
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
        const checkedConnectivity = Array.from(document.querySelectorAll('.connectivity-toggle:checked')).map(cb => cb.value);
        const allFilters = [];

        // 1. TIER FILTER
        if (checkedTiers.length === 0) {
            allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH_POSSIBLE']);
        } else if (checkedTiers.length < ALL_TIERS.length) {
            allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }

        // 2. CONNECTIVITY FILTER
        if (checkedConnectivity.length === 0) {
            allFilters.push(['==', ['get', CONNECTIVITY_ATTRIBUTE], 'NO_MATCH_POSSIBLE']);
        } else if (checkedConnectivity.length < ALL_CONNECTIVITY_LABELS.length) {
            allFilters.push(['match', ['get', CONNECTIVITY_ATTRIBUTE], checkedConnectivity, true, false]);
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
        const flowEl = document.getElementById('visible-patches-flow');
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
        let overallTotalFlow = 0;
        let validEnnCount = 0;
        let validFlowCount = 0;
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
            const flow = feature.properties[MEAN_FLOW_ATTRIBUTE];
            if (flow !== undefined && !isNaN(parseFloat(flow))) {
                overallTotalFlow += parseFloat(flow);
                validFlowCount++;
            }
            
            const tier = feature.properties[TIER_ATTRIBUTE];
            if (tier && tierStats.hasOwnProperty(tier)) {
                tierStats[tier].count++;
                if (area !== undefined && !isNaN(parseFloat(area))) tierStats[tier].area += parseFloat(area);
            }
        });
        
        areaEl.textContent = overallTotalArea.toFixed(2).toLocaleString() + ' ha';
        
        if (ennEl) {
            ennEl.textContent = validEnnCount > 0
                ? (overallTotalEnn / validEnnCount).toFixed(2) + ' m'
                : '- m';
        }
        if (flowEl) {
            flowEl.textContent = validFlowCount > 0
                ? (overallTotalFlow / validFlowCount).toFixed(2)
                : '-';
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
        const patchInfoContent = document.getElementById('patch-info-content');
        patchInfoContent.innerHTML = '';
        if (!properties) { patchInfoContent.innerHTML = 'No data for this patch.'; return; }

        const tier = properties[TIER_ATTRIBUTE] || 'Unknown';
        const connectivity = properties[CONNECTIVITY_ATTRIBUTE] || 'No Data';
        const area = properties[PATCH_AREA_ATTRIBUTE];
        const core = properties[CORE_AREA_ATTRIBUTE];
        const enn  = properties[ENN_ATTRIBUTE];
        const flow = properties[MEAN_FLOW_ATTRIBUTE];
        const pinch = properties[PINCH_PCT_ATTRIBUTE];

        const tierDescriptions = {
            'Tier 1 (Core Habitat)': 'One of the most ecologically valuable patches in this landscape. Large enough to support a resident gibbon group with substantial protected interior habitat.',
            'Tier 2 (Major Stepping Stones)': 'A high-quality patch that acts as a key hub or stepping stone in the movement network. Critical for regional connectivity.',
            'Tier 3 (Connected Fragments)': 'A well-connected fragment that plays an important role in bridging the gap between larger patches.',
            'Tier 4 (Vulnerable Edge Fragments)': 'A moderate patch with significant edge exposure. Functionally important but vulnerable to further degradation.',
            'Tier 5 (Isolated Fragments)': 'A small, isolated patch with limited connectivity. May support a small number of individuals but is poorly connected to the wider network.',
            'Tier 6 (Isolated Micro Patches)': 'A highly isolated micro-patch. Likely too small and disconnected to support resident gibbons, but may provide temporary refuge.'
        };

        const connDescriptions = {
            'High':    'This patch sits within an active movement corridor. Gibbons can potentially move to neighbouring patches from here.',
            'Moderate':'This patch has moderate connectivity. Movement to other patches is possible but not guaranteed.',
            'Low':     'This patch has low connectivity. The surrounding landscape presents significant resistance to movement.',
            'Barrier': 'This patch is surrounded by an impermeable barrier zone. Unaided movement to neighbouring patches is effectively impossible.',
            'No Data': 'Connectivity data is not available for this patch.'
        };

        const pinchMsg = pinch > 50
            ? `⚠️ <strong>${pinch}% of this patch is a critical bottleneck.</strong> Losing or degrading this area would severely disrupt movement across the region.`
            : pinch > 10
            ? `This patch contains some pinch point area (${pinch}%). It plays a partial role in regional movement corridors.`
            : `This patch does not form a major pinch point in the connectivity network.`;

        const dispersalMsg = enn <= 800
            ? `✅ The nearest patch is <strong>${Math.round(enn)} m</strong> away — within the typical dispersal range of a gibbon.`
            : enn <= 2000
            ? `⚠️ The nearest patch is <strong>${Math.round(enn)} m</strong> away — beyond typical single-individual dispersal distance.`
            : `🚫 The nearest patch is <strong>${Math.round(enn)} m</strong> away — too far for unaided gibbon movement.`;

        patchInfoContent.innerHTML = `
            <div class="plain-info-panel">

                <div class="info-tier-badge" style="background:${TIER_COLORS[tier] || '#555'}">
                    ${tier}
                </div>
                <p class="info-tier-desc">${tierDescriptions[tier] || ''}</p>

                <div class="info-section-label">🔗 Connectivity</div>
                <div class="conn-badge-large" style="
                    background:${CONNECTIVITY_COLORS[connectivity] || '#888'};
                    color:${connectivity === 'High' || connectivity === 'Moderate' ? '#1a1a1a' : '#fff'}">
                    ${connectivity}
                </div>
                <p class="info-conn-desc">${connDescriptions[connectivity] || ''}</p>

                <div class="info-section-label">📍 Nearest Patch</div>
                <p>${dispersalMsg}</p>

                <div class="info-section-label">⚡ Pinch Point Status</div>
                <p>${pinchMsg}</p>

                <details class="tech-details">
                    <summary>Show technical details</summary>
                    <ul class="tech-list">
                        <li><strong>Patch ID:</strong> ${properties[PATCH_ID_ATTRIBUTE]}</li>
                        <li><strong>Total area:</strong> ${typeof area === 'number' ? area.toFixed(2) + ' ha' : area}</li>
                        <li><strong>Core area:</strong> ${typeof core === 'number' ? core.toFixed(2) + ' ha' : core}
                            <span class="metric-info-icon" data-metric-key="${CORE_AREA_ATTRIBUTE}" role="button" tabindex="0">ℹ️</span></li>
                        <li><strong>Contiguity index:</strong> ${typeof properties[CONTIGUITY_INDEX_ATTRIBUTE] === 'number' ? properties[CONTIGUITY_INDEX_ATTRIBUTE].toFixed(3) : properties[CONTIGUITY_INDEX_ATTRIBUTE]}
                            <span class="metric-info-icon" data-metric-key="${CONTIGUITY_INDEX_ATTRIBUTE}" role="button" tabindex="0">ℹ️</span></li>
                        <li><strong>Perimeter-area ratio:</strong> ${typeof properties[PERIMETER_AREA_RATIO_ATTRIBUTE] === 'number' ? properties[PERIMETER_AREA_RATIO_ATTRIBUTE].toFixed(5) : properties[PERIMETER_AREA_RATIO_ATTRIBUTE]}
                            <span class="metric-info-icon" data-metric-key="${PERIMETER_AREA_RATIO_ATTRIBUTE}" role="button" tabindex="0">ℹ️</span></li>
                        <li><strong>ENN distance:</strong> ${typeof enn === 'number' ? Math.round(enn) + ' m' : enn}
                            <span class="metric-info-icon" data-metric-key="${ENN_ATTRIBUTE}" role="button" tabindex="0">ℹ️</span></li>
                        <li><strong>Mean composite flow:</strong> ${flow} (0–300 scale)</li>
                        <li><strong>Pinch point coverage:</strong> ${pinch}%</li>
                    </ul>
                </details>
            </div>
        `;

        // Re-attach info icon listeners after innerHTML replacement
        patchInfoContent.querySelectorAll('.metric-info-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                showMetricInfoPopup(icon.getAttribute('data-metric-key'), icon);
            });
        });
    }

                // Format specific numeric values
                if (typeof properties[attrKey] === 'number') {
                    const numValue = properties[attrKey];
                    if (attrKey === PATCH_AREA_ATTRIBUTE || attrKey === CORE_AREA_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(2) + ' ha';
                    } else if (attrKey === CONTIGUITY_INDEX_ATTRIBUTE || attrKey === PERIMETER_AREA_RATIO_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(5);
                    } else if (attrKey === MEAN_FLOW_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(2) + ' (0–300 scale)';
                    } else if (attrKey === PINCH_PCT_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(1) + '%';
                    } else if (attrKey === PATCH_ID_ATTRIBUTE && Number.isInteger(numValue)) {
                        valueToDisplay = numValue.toLocaleString();
                    } else {
                        valueToDisplay = numValue;
                    }
                }

                // Add a coloured badge for the connectivity attribute
                if (attrKey === CONNECTIVITY_ATTRIBUTE) {
                    const badge = document.createElement('span');
                    badge.style.cssText = `
                        display: inline-block;
                        padding: 2px 8px;
                        border-radius: 3px;
                        font-size: 0.85em;
                        font-weight: bold;
                        background-color: ${CONNECTIVITY_COLORS[valueToDisplay] || '#888'};
                        color: ${valueToDisplay === 'High' || valueToDisplay === 'Moderate' ? '#1a1a1a' : '#ffffff'};
                        margin-left: 4px;
                    `;
                    badge.textContent = valueToDisplay;
                    li.innerHTML = `<strong>${displayKey}:</strong> `;
                    li.appendChild(badge);
                    if (METRIC_DESCRIPTIONS.hasOwnProperty(attrKey)) {
                        const infoIcon = document.createElement('span');
                        infoIcon.className = 'metric-info-icon';
                        infoIcon.textContent = 'ℹ️';
                        infoIcon.title = `Learn more about ${displayKey}`;
                        infoIcon.setAttribute('role', 'button');
                        infoIcon.setAttribute('tabindex', '0');
                        infoIcon.setAttribute('data-metric-key', attrKey);
                        infoIcon.addEventListener('click', (event) => { event.stopPropagation(); showMetricInfoPopup(attrKey, infoIcon); });
                        infoIcon.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); showMetricInfoPopup(attrKey, infoIcon); } });
                        li.appendChild(infoIcon);
                    }
                    ul.appendChild(li);
                    return; // skip to next attribute (replaces invalid 'continue' in forEach)
                }
                
                li.innerHTML = `<strong>${displayKey}:</strong> ${valueToDisplay} `; // Note the space for the icon

                // Check if this metric has a description and add an info icon
                if (METRIC_DESCRIPTIONS.hasOwnProperty(attrKey)) {
                    const infoIcon = document.createElement('span');
                    infoIcon.className = 'metric-info-icon';
                    infoIcon.textContent = 'ℹ️';
                    infoIcon.title = `Learn more about ${displayKey}`;
                    infoIcon.setAttribute('role', 'button');
                    infoIcon.setAttribute('tabindex', '0');
                    infoIcon.setAttribute('data-metric-key', attrKey);

                    infoIcon.addEventListener('click', (event) => {
                        event.stopPropagation(); // Prevent click from bubbling up
                        showMetricInfoPopup(attrKey, infoIcon);
                    });
                    infoIcon.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            showMetricInfoPopup(attrKey, infoIcon);
                        }
                    });
                    li.appendChild(infoIcon);
                }
                ul.appendChild(li);
            }
        });
        patchInfoContent.appendChild(ul);
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
        if (name === TIER_ATTRIBUTE)              return 'Category';
        if (name === PATCH_AREA_ATTRIBUTE)        return 'Patch Area';
        if (name === CORE_AREA_ATTRIBUTE)         return 'Core Area';
        if (name === CONNECTIVITY_ATTRIBUTE)      return 'Connectivity';
        if (name === MEAN_FLOW_ATTRIBUTE)         return 'Mean Composite Flow';
        if (name === PINCH_PCT_ATTRIBUTE)         return 'Pinch Point Coverage';
        let formattedName = name.replace(/_/g, ' ').replace(/ #$/, '');
        formattedName = formattedName.replace(/\b\w/g, l => l.toUpperCase());
        return formattedName;
    }
    
    console.log("DEBUG: Attempting to call initializeAboutModal...");
    initializeAboutModal();
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

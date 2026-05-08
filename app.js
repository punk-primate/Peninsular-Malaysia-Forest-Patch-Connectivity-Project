// file loading check 
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
    // Standard initialization logic
    if (map.getSource('mapbox-dem')) {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
    }
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    initializeTierFilters();
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

        // ── Ecological attributes ─────────────────────────────────────────────
        const canopy  = properties['canopy_height_m'];
        const elev    = properties['elevation_m'];
        const slope   = properties['slope_deg'];
        const biomass = properties['biomass_mgha'];

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
            area:    'The total area of the forest patch in hectares.',
            core:    'The area of the patch buffered from external disturbance. The most ecologically stable part of the patch.',
            contig:  'Compactness of the patch, 0–1. Higher = more solid shape.',
            para:    'Perimeter-to-area ratio. Higher = more irregular or elongated shape.',
            enn:     'Straight-line distance to the nearest adjacent forest patch, in metres.',
            flow:    'Mean composite current flow, 0–300 scale. Higher = more central to the connectivity network.',
            canopy:  'Mean canopy height across the patch in metres, derived from the ETH Global Canopy Height Model (2020) at 10 m resolution. Higher values indicate taller, more structurally complex forest — a key habitat requirement for arboreal wildlife.',
            elev:    'Mean elevation above sea level in metres, derived from the SRTM 30 m digital elevation model. Provides context on whether the patch occupies lowland, foothill or montane forest.',
            slope:   'Mean terrain slope within the patch in degrees, derived from SRTM. Steeper terrain can influence edge permeability and movement costs for wildlife crossing the matrix.',
            biomass: 'Mean aboveground biomass in megagrams per hectare (Mg/ha), derived from the ESA CCI Biomass map (v6.0, 2022) at 100 m resolution. Higher values reflect greater forest maturity and carbon storage capacity.'
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

        // Section header style — reused for both sections
        const secHdr = 'margin:14px 0 6px;padding:4px 0 4px 0;border-bottom:1px solid #ccc;font-size:0.82em;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:inherit;opacity:0.7';

        let h = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">';
        const tierDisplay = (typeof TIER_DISPLAY_NAMES !== 'undefined' && TIER_DISPLAY_NAMES[tier]) || tier || 'Unknown';
        h += '<div style="background:' + tc + ';color:#fff;padding:5px 9px;border-radius:3px;font-weight:700;margin-bottom:8px;font-size:0.82em">' + tierDisplay + '</div>';
        h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (tierDesc[tier] || '') + '</p>';
        if (conn && conn !== 'No Data') {
            h += '<div style="margin-bottom:4px;font-size:0.87em"><strong>Connectivity:</strong> <span style="background:' + cc + ';color:' + ct + ';padding:1px 7px;border-radius:3px;font-weight:700">' + conn + '</span></div>';
            h += '<p style="margin:0 0 10px;font-size:0.87em;line-height:1.5;color:inherit">' + (connDesc[conn] || '') + '</p>';
        }
        h += '<div style="font-size:0.87em;margin-bottom:10px"><strong>Nearest patch:</strong> ' + ennMsg + '</div>';

        // ── Structural metrics section ─────────────────────────────────────────
        h += '<details><summary style="cursor:pointer;font-weight:700;font-size:0.87em;color:inherit">Show patch details</summary>';

        h += '<p style="' + secHdr + '">Structural Metrics</p>';
        h += '<ul style="margin:4px 0 0;padding-left:0;font-size:0.84em;line-height:1.8;color:inherit;list-style:none">';
        if (id !== undefined)   h += '<li><strong>Patch ID:</strong> ' + id + '</li>';
        if (typeof area === 'number') h += '<li><strong>Total area:</strong> ' + area.toFixed(2) + ' ha' + infoBtn('area') + '</li>';
        if (typeof core === 'number') h += '<li><strong>Core area:</strong> ' + core.toFixed(2) + ' ha' + infoBtn('core') + '</li>';
        if (typeof properties[CONTIGUITY_INDEX_ATTRIBUTE] === 'number') h += '<li><strong>Contiguity index:</strong> ' + properties[CONTIGUITY_INDEX_ATTRIBUTE].toFixed(3) + infoBtn('contig') + '</li>';
        if (typeof properties[PERIMETER_AREA_RATIO_ATTRIBUTE] === 'number') h += '<li><strong>Perimeter-area ratio:</strong> ' + properties[PERIMETER_AREA_RATIO_ATTRIBUTE].toFixed(5) + infoBtn('para') + '</li>';
        if (!isNaN(ennNum))     h += '<li><strong>ENN distance:</strong> ' + Math.round(ennNum) + ' m' + infoBtn('enn') + '</li>';
        if (flow !== undefined && flow !== null) h += '<li><strong>Mean composite flow:</strong> ' + (typeof flow === 'number' ? flow.toFixed(2) : flow) + infoBtn('flow') + '</li>';
        h += '</ul>';

        // ── Ecological characteristics section ────────────────────────────────
        h += '<p style="' + secHdr + '">Ecological Characteristics</p>';
        h += '<ul style="margin:4px 0 0;padding-left:0;font-size:0.84em;line-height:1.8;color:inherit;list-style:none">';
        const canopyNum  = parseFloat(canopy);
        const elevNum    = parseFloat(elev);
        const slopeNum   = parseFloat(slope);
        const biomassNum = parseFloat(biomass);
        if (!isNaN(canopyNum))  h += '<li><strong>Canopy height:</strong> '  + canopyNum.toFixed(1)  + ' m'     + infoBtn('canopy')  + '</li>';
        if (!isNaN(elevNum))    h += '<li><strong>Elevation:</strong> '       + elevNum.toFixed(1)    + ' m'     + infoBtn('elev')    + '</li>';
        if (!isNaN(slopeNum))   h += '<li><strong>Slope:</strong> '           + slopeNum.toFixed(2)   + '\u00b0' + infoBtn('slope')   + '</li>';
        if (!isNaN(biomassNum)) h += '<li><strong>Aboveground biomass:</strong> ' + biomassNum.toFixed(1) + ' Mg/ha' + infoBtn('biomass') + '</li>';
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
        formattedName = formattedName.replace(/_/g, ' ').replace(/ #$/, '');
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

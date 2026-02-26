console.log("--- app-kuantan.js LATEST - Timestamp: " + new Date().toLocaleTimeString() + " ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha). This indicates the overall size of the habitat.",
    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch that is buffered from edge effects (e.g., changes in light, wind, temperature), in hectares (ha). It represents the more stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of the spatial connectedness or compactness of cells within a patch. Values range from 0 to 1, where higher values indicate more contiguous, less fragmented patches, which is generally better for biodiversity.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area. A higher ratio often indicates a more elongated or irregular shape, leading to a greater proportion of edge habitat compared to core habitat.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): The shortest straight-line distance to the nearest neighboring forest patch, in meters. Lower values indicate greater spatial connectivity."
};

let metricPopup = null; 

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired. Initializing Kuantan application.");

    // Emergency Failsafe: If map fails to load, remove the green terminal after 8 seconds
    setTimeout(() => {
        const loader = document.getElementById('loading-indicator');
        if (loader && loader.style.display !== 'none') {
            console.error("CRITICAL ERROR: Map idle event timeout. Check browser console (F12) for syntax errors.");
            loader.innerHTML = '<div class="terminal-loader"><p style="color:#ff5555;">> ERROR: GEOSPATIAL ENGINE TIMEOUT.</p><p style="color:#ff5555;">> PRESS F12 TO VIEW CONSOLE LOGS.</p><button style="margin-top: 15px;" onclick="document.getElementById(\'loading-indicator\').style.display=\'none\'">[ FORCE OVERRIDE ]</button></div>';
        }
    }, 8000);

    try {
        mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    } catch (err) {
        console.error("FATAL ERROR: Could not find MAPBOX_ACCESS_TOKEN. Is config-kuantan.js linked properly in your HTML?", err);
        return;
    }

    // INITIALIZE MAP (Strictly 2D)
    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
    });

    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    let selectedPatchMapboxId = null;
    let currentMinArea = null;
    let currentMaxArea = null;

    map.on('load', () => {
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        initializeTierFilters();
        initializeHoverPopups();
        initializeClickInfoPanel();
        initializeGeocoder();
        initializeBasemapToggle();
        initializeAreaFilterControls();

        // --- ZOOM WARNING LOGIC ---
        const warningBox = document.getElementById('zoom-warning');
        const PATCH_VISIBILITY_THRESHOLD = 11; 

        const checkZoomLevel = () => {
            const currentZoom = map.getZoom();
            if (currentZoom < PATCH_VISIBILITY_THRESHOLD) {
                if (warningBox) warningBox.style.display = 'block';
            } else {
                if (warningBox) warningBox.style.display = 'none';
            }
        };

        map.on('zoom', checkZoomLevel);
        checkZoomLevel(); 
    });

    map.on('idle', () => {
        if (loadingIndicator) {
            setTimeout(() => {
                loadingIndicator.style.display = 'none';
            }, 3500);
        }
        updateSummaryStatistics();
    });

    map.on('error', (e) => {
        console.error('Mapbox GL Error:', e);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<div class="terminal-loader"><p style="color:#ff5555;">> MAPBOX API ERROR. CHECK CONSOLE.</p><button onclick="document.getElementById(\'loading-indicator\').style.display=\'none\'">[ OVERRIDE ]</button></div>';
        }
    });

    function initializeTierFilters() {
        const filterContainer = document.querySelector('#filter-section');
        if (!filterContainer) return;
        filterContainer.innerHTML = '<h3>Filter by Category</h3>';

        ALL_TIERS.forEach(tierValueFromConfig => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.className = 'tier-toggle';
            checkbox.value = tierValueFromConfig; 
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                applyForestFilter();
            });
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box'; colorBox.style.backgroundColor = TIER_COLORS[tierValueFromConfig] || '#ccc';
            label.appendChild(colorBox); label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tierValueFromConfig}`));
            filterContainer.appendChild(label);
        });
        applyForestFilter();
    }

    function initializeHoverPopups() {
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
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
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
                }
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                     document.getElementById('toggle-sidebar-btn').click();
                }
            }
        });
    }

    function initializeGeocoder() {
        const geocoderContainer = document.getElementById('search-geocoder-container');
        if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
        try {
            const geocoder = new MapboxGeocoder({
                accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, marker: { color: '#FF6347' },
                placeholder: 'Search in Kuantan',
                bbox: [102.9, 3.5, 103.6, 4.2], 
                proximity: { longitude: INITIAL_CENTER[0], latitude: INITIAL_CENTER[1] },
                countries: 'MY', types: 'region,district,place,locality,neighborhood,poi', limit: 7
            });
            geocoderContainer.innerHTML = '';
            geocoderContainer.appendChild(geocoder.onAdd(map));
        } catch (error) { console.error("Geocoder Init Error:", error); }
    }
    
    function initializeBasemapToggle() {
        const basemapToggle = document.getElementById('basemap-toggle');
        const filterSection = document.getElementById('filter-section');
        const areaFilterControls = document.getElementById('area-filter-controls');
        const statsSection = document.getElementById('stats-section');

        if (!basemapToggle) return;
        basemapToggle.addEventListener('change', (e) => {
            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            if (loadingIndicator) loadingIndicator.style.display = 'block';
            const {lng, lat} = map.getCenter(); const zoom = map.getZoom();
            map.setStyle(newStyleUrl);
            map.once('style.load', () => {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                map.setCenter([lng, lat]); map.setZoom(zoom);
                
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
                        }
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
        const minAreaInput = document.getElementById('min-area-input');
        const maxAreaInput = document.getElementById('max-area-input');
        const applyAreaBtn = document.getElementById('apply-area-filter-btn');
        const resetAreaBtn = document.getElementById('reset-area-filter-btn');
        const areaFilterError = document.getElementById('area-filter-error');
        if (!minAreaInput || !maxAreaInput || !applyAreaBtn || !resetAreaBtn || !areaFilterError) return;
        
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
            applyForestFilter();
        });
        resetAreaBtn.addEventListener('click', () => {
            minAreaInput.value = ''; maxAreaInput.value = '';
            currentMinArea = null; currentMaxArea = null;
            areaFilterError.style.display = 'none'; areaFilterError.textContent = '';
            applyForestFilter();
        });
        [minAreaInput, maxAreaInput].forEach(input => {
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') applyAreaBtn.click(); });
            input.addEventListener('input', () => { areaFilterError.style.display = 'none'; areaFilterError.textContent = ''; });
        });
     }

    function applyForestFilter() {
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) {
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
        
        if (currentMinArea !== null && !isNaN(currentMinArea)) {
            allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        }
        if (currentMaxArea !== null && !isNaN(currentMaxArea)) {
            allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        }
        
        let combinedFilterExpression = null;
        if (allFilters.length > 0) {
            combinedFilterExpression = ['all', ...allFilters];
        }
        
        try {
            map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilterExpression);
            if (typeof updateSummaryStatistics === 'function') {
                setTimeout(updateSummaryStatistics, 100); 
            }
        } catch (error) { 
            console.error(`DEBUG: Error applying combined filter:`, error); 
        }
    }

    function updateSummaryStatistics() {
        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        const ennEl = document.getElementById('visible-patches-enn');
        const breakdownEl = document.getElementById('tier-stats-breakdown');
        
        if (!countEl || !areaEl || !breakdownEl) return;
        
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
    }

    function displayPatchInfo(properties) {
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
        patchInfoContent.innerHTML = ''; 

        if (!properties) {
            patchInfoContent.innerHTML = 'No data for this patch.';
            return;
        }

        const ul = document.createElement('ul');
        INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
            if (properties.hasOwnProperty(attrKey)) {
                const li = document.createElement('li');
                let displayKey = formatPropertyName(attrKey);
                let valueToDisplay = properties[attrKey]; 

                if (typeof properties[attrKey] === 'number') {
                    const numValue = properties[attrKey];
                    if (attrKey === PATCH_AREA_ATTRIBUTE || attrKey === CORE_AREA_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(2) + ' ha';
                    } else if (attrKey === CONTIGUITY_INDEX_ATTRIBUTE || attrKey === PERIMETER_AREA_RATIO_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(5);
                    } else if (attrKey === PATCH_ID_ATTRIBUTE && Number.isInteger(numValue)) {
                        valueToDisplay = numValue.toLocaleString();
                    } else {
                        valueToDisplay = numValue; 
                    }
                }
                
                li.innerHTML = `<strong>${displayKey}:</strong> ${valueToDisplay} `; 

                if (METRIC_DESCRIPTIONS.hasOwnProperty(attrKey)) {
                    const infoIcon = document.createElement('span');
                    infoIcon.className = 'metric-info-icon';
                    infoIcon.textContent = 'ℹ️';
                    infoIcon.title = `Learn more about ${displayKey}`;
                    infoIcon.setAttribute('role', 'button');
                    infoIcon.setAttribute('tabindex', '0');
                    infoIcon.setAttribute('data-metric-key', attrKey);

                    infoIcon.addEventListener('click', (event) => {
                        event.stopPropagation(); 
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
        
        let top = iconRect.bottom + 5;
        let left = iconRect.left;

        metricPopup.style.top = `${top}px`;
        metricPopup.style.left = `${left}px`;
        
        const popupRect = metricPopup.getBoundingClientRect();

        if (popupRect.right > window.innerWidth - 10) left = window.innerWidth - popupRect.width - 10;
        if (popupRect.bottom > window.innerHeight - 10) top = iconRect.top - popupRect.height - 5; 
        if (left < 10) left = 10;
        if (top < 10 && (iconRect.top - popupRect.height - 5 < 10) ) top = 10; 

        metricPopup.style.top = `${top}px`;
        metricPopup.style.left = `${left}px`;

        const closeBtn = metricPopup.querySelector('.close-metric-popup-btn');
        closeBtn.focus(); 
        closeBtn.addEventListener('click', () => {
            metricPopup.remove();
            metricPopup = null;
            iconElement.focus(); 
        });

        metricPopup.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeBtn.click();
        });
    }

    document.addEventListener('click', function(event) {
        if (metricPopup) {
            const isClickInsidePopup = metricPopup.contains(event.target);
            const isClickOnAnIcon = event.target.classList.contains('metric-info-icon') || (event.target.parentElement && event.target.parentElement.classList.contains('metric-info-icon

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
        console.log("DEBUG: displayPatchInfo() function EXECUTED.");
        const patchInfoContent = document.getElementById('patch-info-content');
        patchInfoContent.innerHTML = ''; // Clear previous content

        if (!properties) {
            patchInfoContent.innerHTML = 'No data for this patch.';
            return;
        }

        const ul = document.createElement('ul');
        INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
            if (properties.hasOwnProperty(attrKey)) {
                const li = document.createElement('li');
                let displayKey = formatPropertyName(attrKey);
                let valueToDisplay = properties[attrKey]; // Original value

                // Format specific numeric values
                if (typeof properties[attrKey] === 'number') {
                    const numValue = properties[attrKey];
                    if (attrKey === PATCH_AREA_ATTRIBUTE || attrKey === CORE_AREA_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(2) + ' ha';
                    } else if (attrKey === CONTIGUITY_INDEX_ATTRIBUTE || attrKey === PERIMETER_AREA_RATIO_ATTRIBUTE) {
                        valueToDisplay = numValue.toFixed(5);
                    } else if (attrKey === PATCH_ID_ATTRIBUTE && Number.isInteger(numValue)) {
                        valueToDisplay = numValue.toLocaleString();
                    } else {
                        valueToDisplay = numValue; // Default for other numbers
                    }
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


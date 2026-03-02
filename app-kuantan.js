// --- VERY TOP OF app-kuantan.js for file loading check ---
console.log("--- app-kuantan.js LATEST (Improved Modal, Stats on Idle, Info Icons) - Timestamp: " + new Date().toLocaleTimeString() + " ---");

// Define descriptions for metrics. These constants (PATCH_AREA_ATTRIBUTE, etc.) are from config-kuantan.js
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
                accessToken: mapboxgl.accessToken, 
                mapboxgl: mapboxgl, 
                marker: { color: '#FF6347' },
                placeholder: 'Search in Kuantan',
                proximity: { longitude: INITIAL_CENTER[0], latitude: INITIAL_CENTER[1] },
                countries: 'MY', 
                types: 'country,region,postcode,district,place,locality,neighborhood,address,poi', 
                limit: 7
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
            maxAreaInput

// --- VERY TOP OF app-kuantan.js for file loading check ---
console.log("--- app-kuantan.js LATEST - Timestamp: " + new Date().toLocaleTimeString() + " ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Interior habitat buffered from edge effects, in hectares (ha).",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: Connectedness of cells (0-1). Higher is more contiguous.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of perimeter to area. Higher indicates more edge habitat.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Shortest distance to nearest patch in meters."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
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

        const warningBox = document.getElementById('zoom-warning');
        const PATCH_VISIBILITY_THRESHOLD = 11;

        const checkZoomLevel = () => {
            if (map.getZoom() < PATCH_VISIBILITY_THRESHOLD) {
                warningBox.style.display = 'block';
            } else {
                warningBox.style.display = 'none';
            }
        };

        map.on('zoom', checkZoomLevel);
        checkZoomLevel();
    });

    map.on('idle', () => {
        if (loadingIndicator) {
            setTimeout(() => { loadingIndicator.style.display = 'none'; }, 3500);
        }
        updateSummaryStatistics();
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
            checkbox.addEventListener('change', () => applyForestFilter());
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box'; colorBox.style.backgroundColor = TIER_COLORS[tierValueFromConfig] || '#ccc';
            label.appendChild(colorBox); label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tierValueFromConfig}`));
            filterContainer.appendChild(label);
        });
        applyForestFilter();
    }

    function initializeHoverPopups() {
        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const f = e.features[0];
                const content = `<strong>ID:</strong> ${f.properties[PATCH_ID_ATTRIBUTE]}<br><strong>Category:</strong> ${f.properties[TIER_ATTRIBUTE]}`;
                hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
            }
        });
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
            map.getCanvas().style.cursor = ''; hoverPopup.remove();
        });
    }

    function initializeClickInfoPanel() {
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                displayPatchInfo(feature.properties);
                if (selectedPatchMapboxId !== null) {
                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: false });
                }
                selectedPatchMapboxId = feature.id;
                map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: true });
            }
        });
    }

    function initializeGeocoder() {
        const geocoderContainer = document.getElementById('search-geocoder-container');
        if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, marker: { color: '#FF6347' },
            placeholder: 'Search in Kuantan',
            bbox: [103.1, 3.6, 103.5, 4.0], // Updated Bounding Box for Kuantan
            countries: 'MY', limit: 7
        });
        geocoderContainer.innerHTML = '';
        geocoderContainer.appendChild(geocoder.onAdd(map));
    }

    function initializeBasemapToggle() {
        const basemapToggle = document.getElementById('basemap-toggle');
        basemapToggle.addEventListener('change', (e) => {
            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            loadingIndicator.style.display = 'block';
            map.setStyle(newStyleUrl);
            map.once('style.load', () => {
                loadingIndicator.style.display = 'none';
                if (map.getSource('mapbox-dem')) map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
                if (newStyleUrl === MAP_STYLE_CUSTOM) {
                    setTimeout(() => { applyForestFilter(); }, 250);
                }
            });
        });
    }

    function initializeAreaFilterControls() {
        const minAreaInput = document.getElementById('min-area-input');
        const maxAreaInput = document.getElementById('max-area-input');
        const applyAreaBtn = document.getElementById('apply-area-filter-btn');
        const resetAreaBtn = document.getElementById('reset-area-filter-btn');

        applyAreaBtn.addEventListener('click', () => {
            currentMinArea = parseFloat(minAreaInput.value) || null;
            currentMaxArea = parseFloat(maxAreaInput.value) || null;
            applyForestFilter();
        });
        resetAreaBtn.addEventListener('click', () => {
            minAreaInput.value = ''; maxAreaInput.value = '';
            currentMinArea = null; currentMaxArea = null;
            applyForestFilter();
        });
    }

    function applyForestFilter() {
        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const allFilters = [];
        if (checkedTiers.length === 0) {
            allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH']);
        } else if (checkedTiers.length < ALL_TIERS.length) {
            allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }
        if (currentMinArea !== null) allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        if (currentMaxArea !== null) allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        
        const combinedFilter = allFilters.length > 0 ? ['all', ...allFilters] : null;
        map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilter);
        setTimeout(updateSummaryStatistics, 100);
    }

    function updateSummaryStatistics() {
        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        const ennEl = document.getElementById('visible-patches-enn');
        const breakdownEl = document.getElementById('tier-stats-breakdown');
        
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        
        let totalArea = 0; let totalEnn = 0; let validEnn = 0;
        features.forEach(f => {
            totalArea += parseFloat(f.properties[PATCH_AREA_ATTRIBUTE] || 0);
            if (f.properties[ENN_ATTRIBUTE]) { totalEnn += f.properties[ENN_ATTRIBUTE]; validEnn++; }
        });

        countEl.textContent = features.length.toLocaleString();
        areaEl.textContent = totalArea.toFixed(2) + ' ha';
        ennEl.textContent = validEnn > 0 ? (totalEnn / validEnn).toFixed(2) + ' m' : '- m';
    }

    function displayPatchInfo(properties) {
        const patchInfoContent = document.getElementById('patch-info-content');
        patchInfoContent.innerHTML = '';
        const ul = document.createElement('ul');
        INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
            if (properties.hasOwnProperty(attrKey)) {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${formatPropertyName(attrKey)}:</strong> ${properties[attrKey]}`;
                ul.appendChild(li);
            }
        });
        patchInfoContent.appendChild(ul);
    }

    function formatPropertyName(name) {
        if (name === TIER_ATTRIBUTE) return 'Category';
        if (name === PATCH_AREA_ATTRIBUTE) return 'Patch Area';
        if (name === CORE_AREA_ATTRIBUTE) return 'Core Area';
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    initializeAboutModal();
    initializeDarkModeToggle();

    function initializeAboutModal() {
        const aboutBtn = document.getElementById('about-btn');
        const aboutModal = document.getElementById('about-modal');
        const closeModalBtn = aboutModal.querySelector('.close-modal-btn');
        aboutBtn.addEventListener('click', () => { aboutModal.style.display = 'block'; document.body.classList.add('modal-open'); });
        closeModalBtn.addEventListener('click', () => { aboutModal.style.display = 'none'; document.body.classList.remove('modal-open'); });
    }

    function initializeDarkModeToggle() {
        const toggleButton = document.getElementById('dark-mode-toggle'); 
        toggleButton.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            toggleButton.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
        });
    }
});

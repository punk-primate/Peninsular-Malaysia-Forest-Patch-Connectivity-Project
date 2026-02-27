console.log("--- app-kuantan.js LOADED - " + new Date().toLocaleTimeString() + " ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area in hectares.",
    [CORE_AREA_ATTRIBUTE]: "Interior habitat buffered from edge effects.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Spatial connectedness of patch cells (0–1).",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Shape complexity indicator.",
    [ENN_ATTRIBUTE]: "Distance to nearest neighbouring patch in metres."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM
    });

    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';

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

        const warningBox = document.getElementById('zoom-warning');
        const PATCH_VISIBILITY_THRESHOLD = 11;

        const checkZoomLevel = () => {
            warningBox.style.display = map.getZoom() < PATCH_VISIBILITY_THRESHOLD ? 'block' : 'none';
        };

        map.on('zoom', checkZoomLevel);
        checkZoomLevel();
    });

    map.on('idle', () => {
        setTimeout(() => loadingIndicator.style.display = 'none', 2500);
        updateSummaryStatistics();
    });

    function initializeGeocoder() {
        const geocoderContainer = document.getElementById('search-geocoder-container');
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search in Kuantan',
            bbox: [103.1, 3.6, 103.6, 4.1],
            countries: 'MY'
        });
        geocoderContainer.appendChild(geocoder.onAdd(map));
    }

    function initializeTierFilters() {
        const container = document.getElementById('filter-section');
        container.innerHTML = '<h3>Filter by Category</h3>';

        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = tier;
            checkbox.checked = true;
            checkbox.className = 'tier-toggle';
            checkbox.addEventListener('change', applyForestFilter);

            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box';
            colorBox.style.backgroundColor = TIER_COLORS[tier];

            label.appendChild(colorBox);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(" " + tier));

            container.appendChild(label);
        });

        applyForestFilter();
    }

    function initializeHoverPopups() {
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            const feature = e.features[0];
            popup
                .setLngLat(e.lngLat)
                .setHTML(`<strong>ID:</strong> ${feature.properties[PATCH_ID_ATTRIBUTE]}`)
                .addTo(map);
        });

        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => popup.remove());
    }

    function initializeClickInfoPanel() {
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            const feature = e.features[0];
            displayPatchInfo(feature.properties);
        });
    }

    function applyForestFilter() {
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const filters = [];

        if (checkedTiers.length > 0 && checkedTiers.length < ALL_TIERS.length) {
            filters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }

        if (currentMinArea !== null) {
            filters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        }

        if (currentMaxArea !== null) {
            filters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        }

        const combined = filters.length ? ['all', ...filters] : null;
        map.setFilter(FOREST_PATCH_LAYER_ID, combined);
    }

    function updateSummaryStatistics() {
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });

        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        const ennEl = document.getElementById('visible-patches-enn');

        countEl.textContent = features.length;

        let totalArea = 0;
        let totalEnn = 0;

        features.forEach(f => {
            totalArea += Number(f.properties[PATCH_AREA_ATTRIBUTE]) || 0;
            totalEnn += Number(f.properties[ENN_ATTRIBUTE]) || 0;
        });

        areaEl.textContent = totalArea.toFixed(2) + ' ha';
        ennEl.textContent = features.length ? (totalEnn / features.length).toFixed(2) + ' m' : '- m';
    }

    function displayPatchInfo(properties) {
        const container = document.getElementById('patch-info-content');
        container.innerHTML = '';

        const ul = document.createElement('ul');

        INFO_PANEL_ATTRIBUTES.forEach(attr => {
            if (properties[attr] !== undefined) {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${attr}:</strong> ${properties[attr]}`;
                ul.appendChild(li);
            }
        });

        container.appendChild(ul);
    }

});

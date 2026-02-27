// --- app-kuantan.js ---
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of the spatial connectedness of a patch.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Shortest straight-line distance to the nearest patch."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: 0,
        bearing: 0
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

        // ZOOM WARNING LOGIC
        const warningBox = document.getElementById('zoom-warning');
        const checkZoom = () => {
            if (map.getZoom() < 11) {
                warningBox.style.display = 'block';
            } else {
                warningBox.style.display = 'none';
            }
        };
        map.on('zoom', checkZoom);
        checkZoom();
    });

    map.on('idle', () => {
        if (loadingIndicator && loadingIndicator.style.display !== 'none') {
            setTimeout(() => {
                loadingIndicator.style.opacity = '0';
                setTimeout(() => {
                    loadingIndicator.style.display = 'none';
                }, 500);
            }, 3500); // 3.5 seconds as requested
        }
        updateSummaryStatistics();
    });

    function initializeTierFilters() {
        const filterContainer = document.querySelector('#filter-section');
        filterContainer.innerHTML = '<h3>Filter by Category</h3>';
        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.className = 'tier-toggle';
            checkbox.value = tier; checkbox.checked = true;
            checkbox.addEventListener('change', () => applyForestFilter());
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box'; colorBox.style.backgroundColor = TIER_COLORS[tier];
            label.append(colorBox, checkbox, ` ${tier}`);
            filterContainer.appendChild(label);
        });
        applyForestFilter();
    }

    function initializeHoverPopups() {
        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const feat = e.features[0];
            hoverPopup.setLngLat(e.lngLat).setHTML(`ID: ${feat.properties[PATCH_ID_ATTRIBUTE]}<br>Tier: ${feat.properties[TIER_ATTRIBUTE]}`).addTo(map);
        });
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
            map.getCanvas().style.cursor = ''; hoverPopup.remove();
        });
    }

    function initializeClickInfoPanel() {
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features.length > 0) {
                displayPatchInfo(e.features[0].properties);
            }
        });
    }

    function initializeGeocoder() {
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, placeholder: 'Search Kuantan'
        });
        document.getElementById('search-geocoder-container').appendChild(geocoder.onAdd(map));
    }

    function initializeBasemapToggle() {
        document.getElementById('basemap-toggle').addEventListener('change', (e) => {
            const style = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            map.setStyle(style);
            map.once('style.load', () => {
                if (style === MAP_STYLE_CUSTOM) applyForestFilter();
            });
        });
    }

    function initializeAreaFilterControls() {
        document.getElementById('apply-area-filter-btn').addEventListener('click', () => {
            currentMinArea = parseFloat(document.getElementById('min-area-input').value) || null;
            currentMaxArea = parseFloat(document.getElementById('max-area-input').value) || null;
            applyForestFilter();
        });
        document.getElementById('reset-area-filter-btn').addEventListener('click', () => {
            document.getElementById('min-area-input').value = '';
            document.getElementById('max-area-input').value = '';
            currentMinArea = null; currentMaxArea = null;
            applyForestFilter();
        });
    }

    function applyForestFilter() {
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const filters = ['all'];
        if (checkedTiers.length < ALL_TIERS.length) {
            filters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
        }
        if (currentMinArea) filters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        if (currentMaxArea) filters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        map.setFilter(FOREST_PATCH_LAYER_ID, filters.length > 1 ? filters : null);
    }

    function updateSummaryStatistics() {
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        document.getElementById('visible-patches-count').textContent = features.length.toLocaleString();
        let totalArea = 0;
        features.forEach(f => totalArea += f.properties[PATCH_AREA_ATTRIBUTE]);
        document.getElementById('visible-patches-area').textContent = totalArea.toFixed(2) + ' ha';
    }

    function displayPatchInfo(props) {
        const content = document.getElementById('patch-info-content');
        let html = '<ul>';
        INFO_PANEL_ATTRIBUTES.forEach(attr => {
            html += `<li><strong>${attr}:</strong> ${props[attr]}</li>`;
        });
        content.innerHTML = html + '</ul>';
    }

    // Modal and Sidebar Helpers
    document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').style.display = 'block';
    document.querySelector('.close-modal-btn').onclick = () => document.getElementById('about-modal').style.display = 'none';
    document.getElementById('toggle-sidebar-btn').onclick = () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        setTimeout(() => map.resize(), 300);
    };
});

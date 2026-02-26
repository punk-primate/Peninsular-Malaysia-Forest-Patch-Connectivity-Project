console.log("--- app-kuantan.js LATEST (2D Fixed) ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Stable interior habitat buffered from edge effects.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: Measure of spatial connectedness (0-1).",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio indicating shape irregularity.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Straight-line distance to nearest neighbor."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: 0, // Forced 2D
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
            if (map.getZoom() < 11) { warningBox.style.display = 'block'; }
            else { warningBox.style.display = 'none'; }
        };
        map.on('zoom', checkZoom);
        checkZoom();
    });

    map.on('idle', () => {
        if (loadingIndicator && loadingIndicator.style.display !== 'none') {
            setTimeout(() => {
                loadingIndicator.style.opacity = '0';
                setTimeout(() => { loadingIndicator.style.display = 'none'; }, 500);
            }, 3500); // 3.5 Second Boot Sequence
        }
        updateSummaryStatistics();
    });

    function initializeTierFilters() {
        const container = document.querySelector('#filter-section');
        container.innerHTML = '<h3>Filter by Category</h3>';
        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'tier-toggle';
            cb.value = tier; cb.checked = true;
            cb.onchange = () => applyForestFilter();
            const box = document.createElement('span');
            box.className = 'legend-color-box'; box.style.backgroundColor = TIER_COLORS[tier];
            label.append(box, cb, ` ${tier}`);
            container.appendChild(label);
        });
        applyForestFilter();
    }

    function initializeHoverPopups() {
        const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const feat = e.features[0];
            popup.setLngLat(e.lngLat).setHTML(`ID: ${feat.properties[PATCH_ID_ATTRIBUTE]}<br>Tier: ${feat.properties[TIER_ATTRIBUTE]}`).addTo(map);
        });
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    }

    function initializeClickInfoPanel() {
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            const feat = e.features[0];
            displayPatchInfo(feat.properties);
        });
    }

    function initializeGeocoder() {
        const container = document.getElementById('search-geocoder-container');
        const geocoder = new MapboxGeocoder({ accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, placeholder: 'Search Kuantan' });
        container.appendChild(geocoder.onAdd(map));
    }

    function initializeBasemapToggle() {
        document.getElementById('basemap-toggle').onchange = (e) => {
            const style = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            map.setStyle(style);
            map.once('style.load', () => {
                if (style === MAP_STYLE_CUSTOM) applyForestFilter();
            });
        };
    }

    function initializeAreaFilterControls() {
        document.getElementById('apply-area-filter-btn').onclick = () => {
            currentMinArea = parseFloat(document.getElementById('min-area-input').value) || null;
            currentMaxArea = parseFloat(document.getElementById('max-area-input').value) || null;
            applyForestFilter();
        };
        document.getElementById('reset-area-filter-btn').onclick = () => {
            document.getElementById('min-area-input').value = '';
            document.getElementById('max-area-input').value = '';
            currentMinArea = null; currentMaxArea = null;
            applyForestFilter();
        };
    }

    function applyForestFilter() {
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const tiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
        const filters = ['all'];
        if (tiers.length < ALL_TIERS.length) filters.push(['match', ['get', TIER_ATTRIBUTE], tiers, true, false]);
        if (currentMinArea) filters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        if (currentMaxArea) filters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        map.setFilter(FOREST_PATCH_LAYER_ID, filters.length > 1 ? filters : null);
    }

    function updateSummaryStatistics() {
        const feats = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        document.getElementById('visible-patches-count').textContent = feats.length;
        let area = 0; feats.forEach(f => area += f.properties[PATCH_AREA_ATTRIBUTE]);
        document.getElementById('visible-patches-area').textContent = area.toFixed(2) + ' ha';
    }

    function displayPatchInfo(props) {
        const panel = document.getElementById('patch-info-content');
        let html = '<ul>';
        INFO_PANEL_ATTRIBUTES.forEach(attr => { html += `<li><strong>${attr}:</strong> ${props[attr]}</li>`; });
        panel.innerHTML = html + '</ul>';
    }

    // Modal & Dark Mode Helpers
    const initModal = () => {
        document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').style.display = 'block';
        document.querySelector('.close-modal-btn').onclick = () => document.getElementById('about-modal').style.display = 'none';
    };
    const initSidebar = () => {
        document.getElementById('toggle-sidebar-btn').onclick = () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
            setTimeout(() => map.resize(), 300);
        };
    };
    initModal(); initSidebar();
});

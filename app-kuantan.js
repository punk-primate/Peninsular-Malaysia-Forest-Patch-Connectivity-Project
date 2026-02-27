// --- app-kuantan.js ---
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: Connectedness of cells within a patch.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of perimeter to area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Shortest distance to nearest patch."
};

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
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    let currentMinArea = null;
    let currentMaxArea = null;

    map.on('load', () => {
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Check for layer presence
        if (!map.getStyle().layers.find(l => l.id === FOREST_PATCH_LAYER_ID)) {
            console.error(`Layer "${FOREST_PATCH_LAYER_ID}" not found.`);
        }

        initializeTierFilters();
        initializeHoverPopups();
        initializeClickInfoPanel();
        initializeGeocoder();
        initializeBasemapToggle();
        initializeAreaFilterControls();

        // Zoom Warning
        const warningBox = document.getElementById('zoom-warning');
        const checkZoom = () => {
            if (map.getZoom() < 11) {
                if(warningBox) warningBox.style.display = 'block';
            } else {
                if(warningBox) warningBox.style.display = 'none';
            }
        };
        map.on('zoom', checkZoom);
        checkZoom();
    });

    map.on('idle', () => {
        if (loadingIndicator && loadingIndicator.style.display !== 'none') {
            setTimeout(() => {
                loadingIndicator.style.opacity = '0';
                setTimeout(() => { loadingIndicator.style.display = 'none'; }, 500);
            }, 3500); // 3.5s delay
        }
        updateSummaryStatistics();
    });

    function initializeTierFilters() {
        const container = document.querySelector('#filter-section');
        if (!container) return;
        container.innerHTML = '<h3>Filter by Category</h3>';
        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'tier-toggle';
            cb.value = tier; cb.checked = true;
            cb.addEventListener('change', () => applyForestFilter());
            const box = document.createElement('span');
            box.className = 'legend-color-box'; box.style.backgroundColor = TIER_COLORS[tier];
            label.append(box, cb, ` ${tier}`);
            container.appendChild(label);
        });
        applyForestFilter();
    }

    function initializeHoverPopups() {
        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const feat = e.features[0];
                hoverPopup.setLngLat(e.lngLat).setHTML(`ID: ${feat.properties[PATCH_ID_ATTRIBUTE]}<br>Tier: ${feat.properties[TIER_ATTRIBUTE]}`).addTo(map);
            }
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
        const container = document.getElementById('search-geocoder-container');
        if (!container) return;
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken, mapboxgl: mapboxgl, placeholder: 'Search Kuantan'
        });
        container.innerHTML = '';
        container.appendChild(geocoder.onAdd(map));
    }

    function initializeBasemapToggle() {
        const toggle = document.getElementById('basemap-toggle');
        if (!toggle) return;
        toggle.addEventListener('change', (e) => {
            const style = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            map.setStyle(style);
            map.once('style.load', () => {
                if (style === MAP_STYLE_CUSTOM) applyForestFilter();
            });
        });
    }

    function initializeAreaFilterControls() {
        const applyBtn = document.getElementById('apply-area-filter-btn');
        const resetBtn = document.getElementById('reset-area-filter-btn');
        if (applyBtn) {
            applyBtn.onclick = () => {
                currentMinArea = parseFloat(document.getElementById('min-area-input').value) || null;
                currentMaxArea = parseFloat(document.getElementById('max-area-input').value) || null;
                applyForestFilter();
            };
        }
        if (resetBtn) {
            resetBtn.onclick = () => {
                document.getElementById('min-area-input').value = '';
                document.getElementById('max-area-input').value = '';
                currentMinArea = null; currentMaxArea = null;
                applyForestFilter();
            };
        }
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
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const feats = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        if (countEl) countEl.textContent = feats.length.toLocaleString();
        let total = 0;
        feats.forEach(f => total += (f.properties[PATCH_AREA_ATTRIBUTE] || 0));
        if (areaEl) areaEl.textContent = total.toFixed(2) + ' ha';
    }

    function displayPatchInfo(props) {
        const panel = document.getElementById('patch-info-content');
        if (!panel) return;
        let html = '<ul>';
        INFO_PANEL_ATTRIBUTES.forEach(attr => { html += `<li><strong>${attr}:</strong> ${props[attr] || 'N/A'}</li>`; });
        panel.innerHTML = html + '</ul>';
    }

    // Static interactions (About, Sidebar, Dark Mode)
    const aboutBtn = document.getElementById('about-btn');
    if (aboutBtn) aboutBtn.onclick = () => document.getElementById('about-modal').style.display = 'block';
    
    const closeModal = document.querySelector('.close-modal-btn');
    if (closeModal) closeModal.onclick = () => document.getElementById('about-modal').style.display = 'none';
    
    const dmBtn = document.getElementById('dark-mode-toggle');
    if (dmBtn) dmBtn.onclick = () => document.body.classList.toggle('dark-mode');
    
    const sidebarBtn = document.getElementById('toggle-sidebar-btn');
    if (sidebarBtn) {
        sidebarBtn.onclick = () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
            sidebarBtn.textContent = document.getElementById('sidebar').classList.contains('collapsed') ? '›' : '‹';
            setTimeout(() => map.resize(), 300);
        };
    }
});

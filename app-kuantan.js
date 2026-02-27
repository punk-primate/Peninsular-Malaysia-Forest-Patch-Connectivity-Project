// --- app-kuantan.js LATEST - Mirroring Working KV Logic ---
console.log("--- app-kuantan.js INITIALIZING ---");

const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Stable interior habitat critical for sensitive species.",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of the spatial connectedness of a patch.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Shortest straight-line distance to the nearest patch."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded fired.");

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

    let currentMinArea = null;
    let currentMaxArea = null;

    map.on('load', () => {
        console.log("DEBUG: Map Load Event Fired.");
        
        // Navigation
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Verify Layer Existence
        const layers = map.getStyle().layers;
        const layerExists = layers.some(l => l.id === FOREST_PATCH_LAYER_ID);
        if (!layerExists) {
            console.error(`CRITICAL: Layer "${FOREST_PATCH_LAYER_ID}" NOT FOUND in current style.`);
        }

        // Initialize Components
        initializeTierFilters();
        initializeHoverPopups();
        initializeClickInfoPanel();
        initializeGeocoder();
        initializeBasemapToggle();
        initializeAreaFilterControls();
        initializeAboutModal();
        initializeDarkModeToggle();
        initializeSidebarToggle();

        // Zoom Warning Logic
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
            }, 3500);
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
                const content = `<strong>ID:</strong> ${feat.properties[PATCH_ID_ATTRIBUTE]}<br><strong>Tier:</strong> ${feat.properties[TIER_ATTRIBUTE]}`;
                hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
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
        if (!applyBtn) return;

        applyBtn.addEventListener('click', () => {
            currentMinArea = parseFloat(document.getElementById('min-area-input').value) || null;
            currentMaxArea = parseFloat(document.getElementById('max-area-input').value) || null;
            applyForestFilter();
        });

        resetBtn.addEventListener('click', () => {
            document.getElementById('min-area-input').value = '';
            document.getElementById('max-area-input').value = '';
            currentMinArea = null; currentMaxArea = null;
            applyForestFilter();
        });
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
        document.getElementById('visible-patches-count').textContent = feats.length.toLocaleString();
        let totalArea = 0;
        feats.forEach(f => totalArea += (f.properties[PATCH_AREA_ATTRIBUTE] || 0));
        document.getElementById('visible-patches-area').textContent = totalArea.toFixed(2) + ' ha';
    }

    function displayPatchInfo(props) {
        const panel = document.getElementById('patch-info-content');
        if (!panel) return;
        let html = '<ul>';
        INFO_PANEL_ATTRIBUTES.forEach(attr => {
            html += `<li><strong>${attr}:</strong> ${props[attr] || 'N/A'}</li>`;
        });
        panel.innerHTML = html + '</ul>';
    }

    function initializeAboutModal() {
        const btn = document.getElementById('about-btn');
        const modal = document.getElementById('about-modal');
        const close = document.querySelector('.close-modal-btn');
        if (btn && modal && close) {
            btn.onclick = () => modal.style.display = 'block';
            close.onclick = () => modal.style.display = 'none';
            window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };
        }
    }

    function initializeDarkModeToggle() {
        const btn = document.getElementById('dark-mode-toggle');
        if (btn) {
            btn.onclick = () => {
                document.body.classList.toggle('dark-mode');
                btn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌓';
            };
        }
    }

    function initializeSidebarToggle() {
        const btn = document.getElementById('toggle-sidebar-btn');
        const sidebar = document.getElementById('sidebar');
        if (btn && sidebar) {
            btn.onclick = () => {
                sidebar.classList.toggle('collapsed');
                btn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
                setTimeout(() => map.resize(), 300);
            };
        }
    }
});

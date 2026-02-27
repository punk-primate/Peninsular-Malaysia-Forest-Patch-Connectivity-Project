document.addEventListener('DOMContentLoaded', () => {
    // 1. Verify Config Loaded
    if (typeof MAPBOX_ACCESS_TOKEN === 'undefined') {
        console.error("CRITICAL: config-kuantan.js not found or loaded incorrectly.");
        return;
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM
    });

    const safeGet = (id) => document.getElementById(id);

    map.on('load', () => {
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Initialize interactive parts
        initTierFilters();
        initSearch();
        initAreaFilters();
        initUI();

        // Click interaction
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features.length > 0) {
                const p = e.features[0].properties;
                const info = safeGet('patch-info-content');
                if (info) {
                    info.innerHTML = `<ul>
                        <li><strong>ID:</strong> ${p[PATCH_ID_ATTRIBUTE]}</li>
                        <li><strong>Tier:</strong> ${p[TIER_ATTRIBUTE]}</li>
                        <li><strong>Area:</strong> ${p[PATCH_AREA_ATTRIBUTE]} ha</li>
                    </ul>`;
                }
            }
        });

        map.on('mouseenter', FOREST_PATCH_LAYER_ID, () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => map.getCanvas().style.cursor = '');
    });

    function initTierFilters() {
        const container = safeGet('filter-section');
        if (!container) return;
        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.style.display = "block";
            label.innerHTML = `<input type="checkbox" class="tier-toggle" value="${tier}" checked> ${tier}`;
            label.querySelector('input').addEventListener('change', applyFilters);
            container.appendChild(label);
        });
    }

    function applyFilters() {
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        const checked = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(i => i.value);
        const min = parseFloat(safeGet('min-area-input')?.value) || 0;
        const max = parseFloat(safeGet('max-area-input')?.value) || Infinity;

        const filters = ['all'];
        filters.push(['match', ['get', TIER_ATTRIBUTE], checked, true, false]);
        filters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], min]);
        if (max !== Infinity) filters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], max]);

        map.setFilter(FOREST_PATCH_LAYER_ID, filters);
        updateStats();
    }

    function updateStats() {
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        if (safeGet('visible-patches-count')) safeGet('visible-patches-count').textContent = features.length;
    }

    function initSearch() {
        const container = safeGet('search-geocoder-container');
        if (!container) return;
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search Kuantan...',
            bbox: [103.1, 3.6, 103.5, 4.0]
        });
        container.appendChild(geocoder.onAdd(map));
    }

    function initAreaFilters() {
        safeGet('apply-area-filter-btn')?.addEventListener('click', applyFilters);
        safeGet('reset-area-filter-btn')?.addEventListener('click', () => {
            if (safeGet('min-area-input')) safeGet('min-area-input').value = '';
            if (safeGet('max-area-input')) safeGet('max-area-input').value = '';
            applyFilters();
        });
    }

    function initUI() {
        safeGet('dark-mode-toggle')?.addEventListener('click', () => document.body.classList.toggle('dark-mode'));
        safeGet('toggle-sidebar-btn')?.addEventListener('click', () => {
            safeGet('sidebar')?.classList.toggle('collapsed');
            setTimeout(() => map.resize(), 300);
        });
        safeGet('about-btn')?.addEventListener('click', () => safeGet('about-modal').style.display = 'block');
        document.querySelector('.close-modal-btn')?.addEventListener('click', () => safeGet('about-modal').style.display = 'none');
    }

    map.on('idle', () => {
        if (safeGet('loading-indicator')) safeGet('loading-indicator').style.display = 'none';
        updateStats();
    });
});

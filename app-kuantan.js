document.addEventListener('DOMContentLoaded', () => {
    if (typeof MAPBOX_ACCESS_TOKEN === 'undefined') {
        console.error("Config file not loaded!");
        return;
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
    });

    // --- Safety Wrappers ---
    const getEl = (id) => document.getElementById(id);

    map.on('load', () => {
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        
        // Initialize components only if elements exist
        if (getEl('filter-section')) initializeFilters();
        if (getEl('search-geocoder-container')) initializeSearch();
        setupInteractions();
    });

    function initializeFilters() {
        const container = getEl('filter-section');
        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="tier-toggle" value="${tier}" checked> ${tier}`;
            label.querySelector('input').addEventListener('change', updateFilters);
            container.appendChild(label);
        });
    }

    function setupInteractions() {
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            const props = e.features[0].properties;
            const infoBox = getEl('patch-info-content');
            if (infoBox) {
                infoBox.innerHTML = `<ul>
                    <li>ID: ${props[PATCH_ID_ATTRIBUTE]}</li>
                    <li>Tier: ${props[TIER_ATTRIBUTE]}</li>
                    <li>Area: ${props[PATCH_AREA_ATTRIBUTE]} ha</li>
                </ul>`;
            }
        });

        map.on('mouseenter', FOREST_PATCH_LAYER_ID, () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => map.getCanvas().style.cursor = '');
    }

    function updateFilters() {
        const checked = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(i => i.value);
        const filter = checked.length === ALL_TIERS.length ? null : ['match', ['get', TIER_ATTRIBUTE], checked, true, false];
        map.setFilter(FOREST_PATCH_LAYER_ID, filter);
    }

    function initializeSearch() {
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search Kuantan...',
            bbox: [103.1, 3.6, 103.5, 4.0]
        });
        getEl('search-geocoder-container').appendChild(geocoder.onAdd(map));
    }

    // Basic UI Toggles
    if (getEl('dark-mode-toggle')) {
        getEl('dark-mode-toggle').addEventListener('click', () => document.body.classList.toggle('dark-mode'));
    }

    if (getEl('toggle-sidebar-btn')) {
        getEl('toggle-sidebar-btn').addEventListener('click', () => {
            getEl('sidebar').classList.toggle('collapsed');
            setTimeout(() => map.resize(), 300);
        });
    }

    map.on('idle', () => {
        if (getEl('loading-indicator')) getEl('loading-indicator').style.display = 'none';
    });
});

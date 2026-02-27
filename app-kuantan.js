// app-kuantan.js
console.log("--- app-kuantan.js Loaded ---");

// Metric Descriptions
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: Total land area in hectares (ha).",
    [CORE_AREA_ATTRIBUTE]: "Core Area: Interior habitat buffered from edge effects (ha).",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: Connectedness of cells (0-1).",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of perimeter to area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): Distance to nearest patch in meters."
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check if Mapbox token is available
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

    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

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
            if (!warningBox) return;
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
            setTimeout(() => { loadingIndicator.style.display = 'none'; }, 1000); 
        }
        updateSummaryStatistics();
    });

    function initializeTierFilters() {
        const filterContainer = document.querySelector('#filter-section');
        if (!filterContainer || typeof ALL_TIERS === 'undefined') return;
        
        filterContainer.innerHTML = '<h3>Filter by Category</h3>';

        ALL_TIERS.forEach(tier => {
            const label = document.createElement('label');
            label.className = 'filter-legend-item';
            
            const colorBox = document.createElement('span');
            colorBox.className = 'legend-color-box'; 
            colorBox.style.backgroundColor = TIER_COLORS[tier] || '#ccc';
            colorBox.style.display = 'inline-block';
            colorBox.style.width = '12px';
            colorBox.style.height = '12px';
            colorBox.style.marginRight = '8px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; 
            checkbox.className = 'tier-toggle';
            checkbox.value = tier; 
            checkbox.checked = true;
            checkbox.addEventListener('change', applyForestFilter);
            
            label.appendChild(colorBox); 
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${tier}`));
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
                const content = `<strong>ID:</strong> ${f.properties[PATCH_ID_ATTRIBUTE] || 'N/A'}<br><strong>Category:</strong> ${f.properties[TIER_ATTRIBUTE] || 'N/A'}`;
                hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
            }
        });
        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
            map.getCanvas().style.cursor = ''; hoverPopup.remove();
        });
    }

    function initializeClickInfoPanel() {
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
        
        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
            if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                displayPatchInfo(feature.properties);
                
                if (selectedPatchMapboxId !== null) {
                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: false });
                }
                selectedPatchMapboxId = feature.id;
                if (selectedPatchMapboxId !== undefined) {
                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: true });
                }
                
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('collapsed')) {
                    const toggleBtn = document.getElementById('toggle-sidebar-btn');
                    if(toggleBtn) toggleBtn.click();
                }
            }
        });
    }

    function initializeGeocoder() {
        const geocoderContainer = document.getElementById('search-geocoder-container');
        if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
        
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken, 
            mapboxgl: mapboxgl, 
            marker: { color: '#FF6347' },
            placeholder: 'Search in Kuantan',
            bbox: [103.1, 3.6, 103.6, 4.1], 
            countries: 'MY', 
            limit: 7
        });
        geocoderContainer.innerHTML = '';
        geocoderContainer.appendChild(geocoder.onAdd(map));
    }

    function initializeBasemapToggle() {
        const basemapToggle = document.getElementById('basemap-toggle');
        if (!basemapToggle) return;
        
        basemapToggle.addEventListener('change', (e) => {
            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
            if(loadingIndicator) loadingIndicator.style.display = 'block';
            map.setStyle(newStyleUrl);
            map.once('style.load', () => {
                if(loadingIndicator) loadingIndicator.style.display = 'none';
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

        if(applyAreaBtn) {
            applyAreaBtn.addEventListener('click', () => {
                currentMinArea = minAreaInput && minAreaInput.value !== '' ? parseFloat(minAreaInput.value) : null;
                currentMaxArea = maxAreaInput && maxAreaInput.value !== '' ? parseFloat(maxAreaInput.value) : null;
                applyForestFilter();
            });
        }
        
        if(resetAreaBtn) {
            resetAreaBtn.addEventListener('click', () => {
                if(minAreaInput) minAreaInput.value = ''; 
                if(maxAreaInput) maxAreaInput.value = '';
                currentMinArea = null; 
                currentMaxArea = null;
                applyForestFilter();
            });
        }
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
        
        if (currentMinArea !== null && !isNaN(currentMinArea)) allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
        if (currentMaxArea !== null && !isNaN(currentMaxArea)) allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
        
        const combinedFilter = allFilters.length > 0 ? ['all', ...allFilters] : null;
        map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilter);
        
        if (typeof OUTLINE_LAYER_ID !== 'undefined' && map.getLayer(OUTLINE_LAYER_ID)) {
             map.setFilter(OUTLINE_LAYER_ID, combinedFilter);
        }
        
        setTimeout(updateSummaryStatistics, 100);
    }

    function updateSummaryStatistics() {
        const countEl = document.getElementById('visible-patches-count');
        const areaEl = document.getElementById('visible-patches-area');
        const ennEl = document.getElementById('visible-patches-enn');
        
        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
        
        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
        
        let totalArea = 0; 
        let totalEnn = 0; 
        let validEnn = 0;
        
        const uniqueFeatures = new Map();
        features.forEach(f => {
            const id = f.properties[PATCH_ID_ATTRIBUTE];
            if (id && !uniqueFeatures.has(id)) {
                uniqueFeatures.set(id, f);
            }
        });

        uniqueFeatures.forEach(f => {
            totalArea += parseFloat(f.properties[PATCH_AREA_ATTRIBUTE] || 0);
            if (f.properties[ENN_ATTRIBUTE]) { 
                totalEnn += parseFloat(f.properties[ENN_ATTRIBUTE]); 
                validEnn++; 
            }
        });

        if(countEl) countEl.textContent = uniqueFeatures.size.toLocaleString();
        if(areaEl) areaEl.textContent = totalArea.toFixed(2) + ' ha';
        if(ennEl) ennEl.textContent = validEnn > 0 ? (totalEnn / validEnn).toFixed(2) + ' m' : '- m';
    }

    function displayPatchInfo(properties) {
        const patchInfoContent = document.getElementById('patch-info-content');
        if (!patchInfoContent) return;
        
        patchInfoContent.innerHTML = '';
        const ul = document.createElement('ul');
        
        if (typeof INFO_PANEL_ATTRIBUTES !== 'undefined') {
            INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
                if (properties.hasOwnProperty(attrKey)) {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong>${formatPropertyName(attrKey)}:</strong> ${properties[attrKey]}`;
                    ul.appendChild(li);
                }
            });
        }
        patchInfoContent.appendChild(ul);
    }

    function formatPropertyName(name) {
        if (name === TIER_ATTRIBUTE) return 'Category';
        if (name === PATCH_AREA_ATTRIBUTE) return 'Patch Area';
        if (name === CORE_AREA_ATTRIBUTE) return 'Core Area';
        return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // --- SIDEBAR & MODAL LOGIC ---
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    if (aboutBtn && aboutModal) {
        const closeModalBtn = aboutModal.querySelector('.close-modal-btn');
        aboutBtn.addEventListener('click', () => { 
            aboutModal.style.display = 'block'; 
            document.body.classList.add('modal-open'); 
        });
        if(closeModalBtn) {
            closeModalBtn.addEventListener('click', () => { 
                aboutModal.style.display = 'none'; 
                document.body.classList.remove('modal-open'); 
            });
        }
    }

    const darkModeToggle = document.getElementById('dark-mode-toggle'); 
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            darkModeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
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
        });
    }
    
    // Fallback: If map fails to load completely, force hide the loading indicator after 10 seconds
    setTimeout(() => {
        if(loadingIndicator) loadingIndicator.style.display = 'none';
    }, 10000);

});

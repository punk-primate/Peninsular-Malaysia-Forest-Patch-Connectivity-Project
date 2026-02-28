 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app-kuantan.js b/app-kuantan.js
index 6d0a5268bd5aaf8e1fe62c8d3ddc576f0466a50c..cb3d2b37e342af4819152ffcdf07d9555d2cd4fa 100644
--- a/app-kuantan.js
+++ b/app-kuantan.js
@@ -1,268 +1,379 @@
-console.log("--- app-kuantan.js Initialized ---");
-
-const METRIC_DESCRIPTIONS = {
-    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
-    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch buffered from edge effects (ha).",
-    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of spatial connectedness (0-1).",
-    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of perimeter to area.",
-    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor: Distance to nearest patch in meters."
-};
-
-document.addEventListener('DOMContentLoaded', () => {
-    
-    // --- 1. INITIALIZE BASIC UI FIRST (Prevents Mapbox from blocking interaction) ---
-    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
-    const sidebar = document.getElementById('sidebar');
-    const appContainer = document.getElementById('app-container');
-    const aboutBtn = document.getElementById('about-btn');
-    const aboutModal = document.getElementById('about-modal');
-    const darkModeToggle = document.getElementById('dark-mode-toggle');
-
-    if (toggleSidebarBtn && sidebar && appContainer) {
-        toggleSidebarBtn.addEventListener('click', () => {
-            sidebar.classList.toggle('collapsed');
-            appContainer.classList.toggle('sidebar-collapsed');
-            toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
-        });
-    }
-
-    if (aboutBtn && aboutModal) {
-        aboutBtn.addEventListener('click', () => { aboutModal.style.display = 'block'; });
-        document.querySelector('.close-modal-btn')?.addEventListener('click', () => { aboutModal.style.display = 'none'; });
-    }
-
-    if (darkModeToggle) {
-        darkModeToggle.addEventListener('click', () => {
-            document.body.classList.toggle('dark-mode');
-            darkModeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
-        });
-    }
-
-    // --- 2. MAPBOX INITIALIZATION ---
-    if (typeof MAPBOX_ACCESS_TOKEN === 'undefined') {
-        console.error("CRITICAL: MAPBOX_ACCESS_TOKEN missing. config-kuantan.js failed to load.");
-        return;
-    }
-
-    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
-    const map = new mapboxgl.Map({
-        container: 'map',
-        style: MAP_STYLE_CUSTOM,
-        center: INITIAL_CENTER,
-        zoom: INITIAL_ZOOM,
-    });
-
-    const loadingIndicator = document.getElementById('loading-indicator');
-    if (loadingIndicator) loadingIndicator.style.display = 'block';
-
-    let selectedPatchMapboxId = null;
-    let currentMinArea = null;
-    let currentMaxArea = null;
-
-    map.on('load', () => {
-        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
-        
-        initializeTierFilters();
-        initializeHoverPopups();
-        initializeClickInfoPanel();
-        initializeGeocoder();
-        initializeBasemapToggle();
-        initializeAreaFilterControls();
-
-        const warningBox = document.getElementById('zoom-warning');
-        const checkZoomLevel = () => {
-            if (!warningBox) return;
-            warningBox.style.display = map.getZoom() < 11 ? 'block' : 'none';
-        };
-        map.on('zoom', checkZoomLevel);
-        checkZoomLevel();
-    });
-
-    // --- 3. FORCE DISMISS LOADER (Solves the "invisible shield" issue) ---
-    const hideLoader = () => {
-        if (loadingIndicator) {
-            loadingIndicator.style.display = 'none';
-            loadingIndicator.style.pointerEvents = 'none'; // Guarantee it allows clicks through
-        }
-    };
-    
-    map.on('idle', () => {
-        setTimeout(hideLoader, 1500);
-        updateSummaryStatistics();
-    });
-    
-    // Failsafe: Hide loader after 5 seconds even if map.idle never fires
-    setTimeout(hideLoader, 5000);
-
-    // --- 4. MAP LOGIC FUNCTIONS ---
-    function initializeTierFilters() {
-        const filterContainer = document.querySelector('#filter-section');
-        if (!filterContainer) return;
-        filterContainer.innerHTML = '<h3>Filter by Category</h3>';
-
-        ALL_TIERS.forEach(tier => {
-            const label = document.createElement('label');
-            label.className = 'filter-legend-item';
-            
-            const colorBox = document.createElement('span');
-            colorBox.className = 'legend-color-box'; 
-            colorBox.style.backgroundColor = TIER_COLORS[tier] || '#ccc';
-
-            const checkbox = document.createElement('input');
-            checkbox.type = 'checkbox'; 
-            checkbox.className = 'tier-toggle';
-            checkbox.value = tier; 
-            checkbox.checked = true;
-            checkbox.addEventListener('change', applyForestFilter);
-            
-            label.appendChild(colorBox); 
-            label.appendChild(checkbox);
-            label.appendChild(document.createTextNode(` ${tier}`));
-            filterContainer.appendChild(label);
-        });
-        applyForestFilter();
-    }
-
-    function initializeHoverPopups() {
-        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
-        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
-            if (e.features && e.features.length > 0) {
-                map.getCanvas().style.cursor = 'pointer';
-                const f = e.features[0];
-                const content = `<strong>ID:</strong> ${f.properties[PATCH_ID_ATTRIBUTE] || 'N/A'}<br><strong>Category:</strong> ${f.properties[TIER_ATTRIBUTE] || 'N/A'}`;
-                hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
-            }
-        });
-        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
-            map.getCanvas().style.cursor = ''; hoverPopup.remove();
-        });
-    }
-
-    function initializeClickInfoPanel() {
-        const patchInfoContent = document.getElementById('patch-info-content');
-        if (!patchInfoContent) return;
-        
-        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
-            if (e.features && e.features.length > 0) {
-                const feature = e.features[0];
-                
-                patchInfoContent.innerHTML = '';
-                const ul = document.createElement('ul');
-                INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
-                    if (feature.properties.hasOwnProperty(attrKey)) {
-                        const li = document.createElement('li');
-                        let propName = attrKey === TIER_ATTRIBUTE ? 'Category' : attrKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
-                        li.innerHTML = `<strong>${propName}:</strong> ${feature.properties[attrKey]}`;
-                        ul.appendChild(li);
-                    }
-                });
-                patchInfoContent.appendChild(ul);
-                
-                if (selectedPatchMapboxId !== null) map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: false });
-                selectedPatchMapboxId = feature.id;
-                if (selectedPatchMapboxId !== undefined) map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: true });
-                
-                if (sidebar && sidebar.classList.contains('collapsed') && toggleSidebarBtn) toggleSidebarBtn.click();
-            }
-        });
-    }
-
-    function initializeGeocoder() {
-        const geocoderContainer = document.getElementById('search-geocoder-container');
-        if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
-        
-        const geocoder = new MapboxGeocoder({
-            accessToken: mapboxgl.accessToken, 
-            mapboxgl: mapboxgl, 
-            marker: { color: '#FF6347' },
-            placeholder: 'Search in Kuantan',
-            bbox: [103.1, 3.6, 103.6, 4.1], 
-            countries: 'MY', 
-            limit: 7
-        });
-        geocoderContainer.innerHTML = '';
-        geocoderContainer.appendChild(geocoder.onAdd(map));
-    }
-
-    function initializeBasemapToggle() {
-        const basemapToggle = document.getElementById('basemap-toggle');
-        if (!basemapToggle) return;
-        
-        basemapToggle.addEventListener('change', (e) => {
-            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
-            if(loadingIndicator) { loadingIndicator.style.display = 'block'; loadingIndicator.style.pointerEvents = 'auto'; }
-            map.setStyle(newStyleUrl);
-            map.once('style.load', () => {
-                hideLoader();
-                if (map.getSource('mapbox-dem')) map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
-                if (newStyleUrl === MAP_STYLE_CUSTOM) setTimeout(() => { applyForestFilter(); }, 250);
-            });
-        });
-    }
-
-    function initializeAreaFilterControls() {
-        const minInput = document.getElementById('min-area-input');
-        const maxInput = document.getElementById('max-area-input');
-        
-        document.getElementById('apply-area-filter-btn')?.addEventListener('click', () => {
-            currentMinArea = minInput && minInput.value !== '' ? parseFloat(minInput.value) : null;
-            currentMaxArea = maxInput && maxInput.value !== '' ? parseFloat(maxInput.value) : null;
-            applyForestFilter();
-        });
-        
-        document.getElementById('reset-area-filter-btn')?.addEventListener('click', () => {
-            if(minInput) minInput.value = ''; 
-            if(maxInput) maxInput.value = '';
-            currentMinArea = null; currentMaxArea = null;
-            applyForestFilter();
-        });
-    }
-
-    function applyForestFilter() {
-        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
-        
-        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
-        const allFilters = [];
-        
-        if (checkedTiers.length === 0) allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH']);
-        else if (checkedTiers.length < ALL_TIERS.length) allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
-        
-        if (currentMinArea !== null && !isNaN(currentMinArea)) allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
-        if (currentMaxArea !== null && !isNaN(currentMaxArea)) allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
-        
-        const combinedFilter = allFilters.length > 0 ? ['all', ...allFilters] : null;
-        map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilter);
-        
-        if (typeof OUTLINE_LAYER_ID !== 'undefined' && map.getLayer(OUTLINE_LAYER_ID)) {
-             map.setFilter(OUTLINE_LAYER_ID, combinedFilter);
-        }
-        
-        setTimeout(updateSummaryStatistics, 100);
-    }
-
-    function updateSummaryStatistics() {
-        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
-        
-        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
-        let totalArea = 0; let totalEnn = 0; let validEnn = 0;
-        
-        const uniqueFeatures = new Map();
-        features.forEach(f => {
-            const id = f.properties[PATCH_ID_ATTRIBUTE];
-            if (id && !uniqueFeatures.has(id)) uniqueFeatures.set(id, f);
-        });
-
-        uniqueFeatures.forEach(f => {
-            totalArea += parseFloat(f.properties[PATCH_AREA_ATTRIBUTE] || 0);
-            if (f.properties[ENN_ATTRIBUTE]) { totalEnn += parseFloat(f.properties[ENN_ATTRIBUTE]); validEnn++; }
-        });
-
-        const countEl = document.getElementById('visible-patches-count');
-        const areaEl = document.getElementById('visible-patches-area');
-        const ennEl = document.getElementById('visible-patches-enn');
-
-        if(countEl) countEl.textContent = uniqueFeatures.size.toLocaleString();
-        if(areaEl) areaEl.textContent = totalArea.toFixed(2) + ' ha';
-        if(ennEl) ennEl.textContent = validEnn > 0 ? (totalEnn / validEnn).toFixed(2) + ' m' : '- m';
-    }
-});
+console.log("--- app-kuantan.js Initialized (stability update) ---");
+
+const METRIC_DESCRIPTIONS = {
+    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha).",
+    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch buffered from edge effects (ha).",
+    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of spatial connectedness (0-1).",
+    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: Ratio of perimeter to area.",
+    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor: Distance to nearest patch in meters."
+};
+
+document.addEventListener('DOMContentLoaded', () => {
+    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
+    const sidebar = document.getElementById('sidebar');
+    const appContainer = document.getElementById('app-container');
+    const aboutBtn = document.getElementById('about-btn');
+    const aboutModal = document.getElementById('about-modal');
+    const darkModeToggle = document.getElementById('dark-mode-toggle');
+    const loadingIndicator = document.getElementById('loading-indicator');
+
+    const patchInfoContent = document.getElementById('patch-info-content');
+
+    const hideLoader = () => {
+        if (loadingIndicator) {
+            loadingIndicator.style.display = 'none';
+            loadingIndicator.style.pointerEvents = 'none';
+        }
+    };
+
+    const showLoader = () => {
+        if (loadingIndicator) {
+            loadingIndicator.style.display = 'block';
+            loadingIndicator.style.pointerEvents = 'auto';
+        }
+    };
+
+    if (toggleSidebarBtn && sidebar && appContainer) {
+        toggleSidebarBtn.addEventListener('click', () => {
+            sidebar.classList.toggle('collapsed');
+            appContainer.classList.toggle('sidebar-collapsed');
+            toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
+            toggleSidebarBtn.setAttribute('aria-expanded', String(!sidebar.classList.contains('collapsed')));
+            if (map) setTimeout(() => map.resize(), 220);
+        });
+    }
+
+    if (aboutBtn && aboutModal) {
+        aboutBtn.addEventListener('click', () => { aboutModal.style.display = 'block'; });
+        document.querySelector('.close-modal-btn')?.addEventListener('click', () => { aboutModal.style.display = 'none'; });
+        window.addEventListener('click', (event) => {
+            if (event.target === aboutModal) aboutModal.style.display = 'none';
+        });
+    }
+
+    if (darkModeToggle) {
+        const persisted = localStorage.getItem('darkMode');
+        if (persisted === 'enabled') {
+            document.body.classList.add('dark-mode');
+            darkModeToggle.textContent = '☀️';
+        } else {
+            darkModeToggle.textContent = '🌙';
+        }
+
+        darkModeToggle.addEventListener('click', () => {
+            document.body.classList.toggle('dark-mode');
+            const enabled = document.body.classList.contains('dark-mode');
+            localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
+            darkModeToggle.textContent = enabled ? '☀️' : '🌙';
+        });
+    }
+
+    if (typeof MAPBOX_ACCESS_TOKEN === 'undefined') {
+        console.error("CRITICAL: MAPBOX_ACCESS_TOKEN missing. config-kuantan.js failed to load.");
+        if (patchInfoContent) patchInfoContent.textContent = 'Configuration error: missing Mapbox token.';
+        hideLoader();
+        return;
+    }
+
+    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;
+    let map = new mapboxgl.Map({
+        container: 'map',
+        style: MAP_STYLE_CUSTOM,
+        center: INITIAL_CENTER,
+        zoom: INITIAL_ZOOM,
+    });
+
+    showLoader();
+
+    let selectedPatchMapboxId = null;
+    let currentMinArea = null;
+    let currentMaxArea = null;
+
+    const onStyleReady = () => {
+        initializeTierFilters();
+        initializeHoverPopups();
+        initializeClickInfoPanel();
+        initializeGeocoder();
+        initializeAreaFilterControls();
+        initializeBasemapToggle();
+
+        const warningBox = document.getElementById('zoom-warning');
+        const checkZoomLevel = () => {
+            if (!warningBox) return;
+            warningBox.style.display = map.getZoom() < 11 ? 'block' : 'none';
+        };
+        map.off('zoom', checkZoomLevel);
+        map.on('zoom', checkZoomLevel);
+        checkZoomLevel();
+
+        const hasPatchLayer = !!map.getLayer(FOREST_PATCH_LAYER_ID);
+        if (!hasPatchLayer) {
+            const msg = `Layer not found in style: ${FOREST_PATCH_LAYER_ID}. Verify Mapbox style layer names.`;
+            console.error(msg);
+            if (patchInfoContent) patchInfoContent.textContent = msg;
+        } else {
+            applyForestFilter();
+        }
+    };
+
+    map.on('load', () => {
+        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
+        onStyleReady();
+    });
+
+    map.on('idle', () => {
+        setTimeout(hideLoader, 1200);
+        updateSummaryStatistics();
+    });
+
+    map.on('error', (e) => {
+        console.error('Mapbox GL Error:', e);
+        if (loadingIndicator) {
+            loadingIndicator.innerHTML = '<div class="spinner"></div>Error loading map. Check console.';
+            showLoader();
+        }
+        setTimeout(hideLoader, 2500);
+    });
+
+    setTimeout(hideLoader, 7000);
+
+    function initializeTierFilters() {
+        const filterContainer = document.querySelector('#filter-section');
+        if (!filterContainer) return;
+
+        filterContainer.innerHTML = '<h3>Filter by Category</h3>';
+        ALL_TIERS.forEach(tier => {
+            const label = document.createElement('label');
+            label.className = 'filter-legend-item';
+
+            const colorBox = document.createElement('span');
+            colorBox.className = 'legend-color-box';
+            colorBox.style.backgroundColor = TIER_COLORS[tier] || '#ccc';
+
+            const checkbox = document.createElement('input');
+            checkbox.type = 'checkbox';
+            checkbox.className = 'tier-toggle';
+            checkbox.value = tier;
+            checkbox.checked = true;
+            checkbox.addEventListener('change', applyForestFilter);
+
+            label.appendChild(colorBox);
+            label.appendChild(checkbox);
+            label.appendChild(document.createTextNode(` ${tier}`));
+            filterContainer.appendChild(label);
+        });
+    }
+
+    function initializeHoverPopups() {
+        if (!map.getLayer(FOREST_PATCH_LAYER_ID)) return;
+
+        const hoverPopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, className: 'custom-hover-popup' });
+        map.on('mousemove', FOREST_PATCH_LAYER_ID, (e) => {
+            if (!e.features || e.features.length === 0) return;
+            map.getCanvas().style.cursor = 'pointer';
+            const f = e.features[0];
+            const content = `<strong>ID:</strong> ${f.properties[PATCH_ID_ATTRIBUTE] || 'N/A'}<br><strong>Category:</strong> ${f.properties[TIER_ATTRIBUTE] || 'N/A'}`;
+            hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
+        });
+        map.on('mouseleave', FOREST_PATCH_LAYER_ID, () => {
+            map.getCanvas().style.cursor = '';
+            hoverPopup.remove();
+        });
+    }
+
+    function initializeClickInfoPanel() {
+        if (!patchInfoContent || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
+
+        map.on('click', FOREST_PATCH_LAYER_ID, (e) => {
+            if (!e.features || e.features.length === 0) return;
+
+            const feature = e.features[0];
+            patchInfoContent.innerHTML = '';
+            const ul = document.createElement('ul');
+
+            INFO_PANEL_ATTRIBUTES.forEach(attrKey => {
+                if (!Object.prototype.hasOwnProperty.call(feature.properties, attrKey)) return;
+                const li = document.createElement('li');
+                const propName = attrKey === TIER_ATTRIBUTE
+                    ? 'Category'
+                    : attrKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
+                li.innerHTML = `<strong>${propName}:</strong> ${feature.properties[attrKey]}`;
+                ul.appendChild(li);
+            });
+
+            patchInfoContent.appendChild(ul);
+
+            try {
+                if (selectedPatchMapboxId !== null) {
+                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: false });
+                }
+                selectedPatchMapboxId = feature.id;
+                if (selectedPatchMapboxId !== undefined && selectedPatchMapboxId !== null) {
+                    map.setFeatureState({ source: feature.source, sourceLayer: feature.sourceLayer, id: selectedPatchMapboxId }, { selected: true });
+                }
+            } catch (err) {
+                console.warn('Feature-state update skipped:', err);
+            }
+
+            if (sidebar && sidebar.classList.contains('collapsed') && toggleSidebarBtn) toggleSidebarBtn.click();
+        });
+    }
+
+    function initializeGeocoder() {
+        const geocoderContainer = document.getElementById('search-geocoder-container');
+        if (!geocoderContainer || typeof MapboxGeocoder === 'undefined') return;
+
+        const geocoder = new MapboxGeocoder({
+            accessToken: mapboxgl.accessToken,
+            mapboxgl,
+            marker: { color: '#FF6347' },
+            placeholder: 'Search in Kuantan',
+            bbox: [103.1, 3.6, 103.6, 4.1],
+            countries: 'MY',
+            limit: 7
+        });
+
+        geocoderContainer.innerHTML = '';
+        geocoderContainer.appendChild(geocoder.onAdd(map));
+    }
+
+    function initializeBasemapToggle() {
+        const basemapToggle = document.getElementById('basemap-toggle');
+        if (!basemapToggle || basemapToggle.dataset.bound === 'true') return;
+        basemapToggle.dataset.bound = 'true';
+
+        basemapToggle.addEventListener('change', (e) => {
+            const newStyleUrl = e.target.value === 'satellite' ? MAP_STYLE_SATELLITE : MAP_STYLE_CUSTOM;
+
+            const { lng, lat } = map.getCenter();
+            const zoom = map.getZoom();
+            const bearing = map.getBearing();
+            const pitch = map.getPitch();
+
+            showLoader();
+            map.setStyle(newStyleUrl);
+            map.once('style.load', () => {
+                map.setCenter([lng, lat]);
+                map.setZoom(zoom);
+                map.setBearing(bearing);
+                map.setPitch(pitch);
+                onStyleReady();
+                hideLoader();
+            });
+        });
+    }
+
+    function initializeAreaFilterControls() {
+        const minInput = document.getElementById('min-area-input');
+        const maxInput = document.getElementById('max-area-input');
+        const errorEl = document.getElementById('area-filter-error');
+        const applyBtn = document.getElementById('apply-area-filter-btn');
+        const resetBtn = document.getElementById('reset-area-filter-btn');
+
+        if (!applyBtn || !resetBtn) return;
+
+        if (applyBtn.dataset.bound !== 'true') {
+            applyBtn.dataset.bound = 'true';
+            applyBtn.addEventListener('click', () => {
+                if (errorEl) {
+                    errorEl.style.display = 'none';
+                    errorEl.textContent = '';
+                }
+
+                const minVal = minInput && minInput.value !== '' ? parseFloat(minInput.value) : null;
+                const maxVal = maxInput && maxInput.value !== '' ? parseFloat(maxInput.value) : null;
+
+                currentMinArea = Number.isFinite(minVal) && minVal >= 0 ? minVal : null;
+                currentMaxArea = Number.isFinite(maxVal) && maxVal >= 0 ? maxVal : null;
+
+                if (currentMinArea !== null && currentMaxArea !== null && currentMaxArea < currentMinArea) {
+                    if (errorEl) {
+                        errorEl.textContent = 'Max Area cannot be less than Min Area.';
+                        errorEl.style.display = 'block';
+                    }
+                    return;
+                }
+
+                applyForestFilter();
+            });
+        }
+
+        if (resetBtn.dataset.bound !== 'true') {
+            resetBtn.dataset.bound = 'true';
+            resetBtn.addEventListener('click', () => {
+                if (minInput) minInput.value = '';
+                if (maxInput) maxInput.value = '';
+                if (errorEl) {
+                    errorEl.style.display = 'none';
+                    errorEl.textContent = '';
+                }
+                currentMinArea = null;
+                currentMaxArea = null;
+                applyForestFilter();
+            });
+        }
+    }
+
+    function applyForestFilter() {
+        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) {
+            if (!map.isStyleLoaded()) setTimeout(applyForestFilter, 300);
+            return;
+        }
+
+        const checkedTiers = Array.from(document.querySelectorAll('.tier-toggle:checked')).map(cb => cb.value);
+        const allFilters = [];
+
+        if (checkedTiers.length === 0) {
+            allFilters.push(['==', ['get', TIER_ATTRIBUTE], 'NO_MATCH']);
+        } else if (checkedTiers.length < ALL_TIERS.length) {
+            allFilters.push(['match', ['get', TIER_ATTRIBUTE], checkedTiers, true, false]);
+        }
+
+        if (currentMinArea !== null && !isNaN(currentMinArea)) allFilters.push(['>=', ['get', PATCH_AREA_ATTRIBUTE], currentMinArea]);
+        if (currentMaxArea !== null && !isNaN(currentMaxArea)) allFilters.push(['<=', ['get', PATCH_AREA_ATTRIBUTE], currentMaxArea]);
+
+        const combinedFilter = allFilters.length > 0 ? ['all', ...allFilters] : null;
+
+        try {
+            map.setFilter(FOREST_PATCH_LAYER_ID, combinedFilter);
+            if (typeof OUTLINE_LAYER_ID !== 'undefined' && map.getLayer(OUTLINE_LAYER_ID)) {
+                map.setFilter(OUTLINE_LAYER_ID, combinedFilter);
+            }
+        } catch (err) {
+            console.error('Failed to apply filter:', err);
+        }
+
+        setTimeout(updateSummaryStatistics, 100);
+    }
+
+    function updateSummaryStatistics() {
+        if (!map.isStyleLoaded() || !map.getLayer(FOREST_PATCH_LAYER_ID)) return;
+
+        const features = map.queryRenderedFeatures({ layers: [FOREST_PATCH_LAYER_ID] });
+        let totalArea = 0;
+        let totalEnn = 0;
+        let validEnn = 0;
+
+        const uniqueFeatures = new Map();
+        features.forEach(f => {
+            const id = f.properties[PATCH_ID_ATTRIBUTE];
+            if (id !== undefined && id !== null && !uniqueFeatures.has(id)) uniqueFeatures.set(id, f);
+        });
+
+        uniqueFeatures.forEach(f => {
+            totalArea += parseFloat(f.properties[PATCH_AREA_ATTRIBUTE] || 0);
+            if (f.properties[ENN_ATTRIBUTE] !== undefined && f.properties[ENN_ATTRIBUTE] !== null && !isNaN(parseFloat(f.properties[ENN_ATTRIBUTE]))) {
+                totalEnn += parseFloat(f.properties[ENN_ATTRIBUTE]);
+                validEnn++;
+            }
+        });
+
+        const countEl = document.getElementById('visible-patches-count');
+        const areaEl = document.getElementById('visible-patches-area');
+        const ennEl = document.getElementById('visible-patches-enn');
+
+        if (countEl) countEl.textContent = uniqueFeatures.size.toLocaleString();
+        if (areaEl) areaEl.textContent = totalArea.toFixed(2) + ' ha';
+        if (ennEl) ennEl.textContent = validEnn > 0 ? (totalEnn / validEnn).toFixed(2) + ' m' : '- m';
+    }
+});
 
EOF
)

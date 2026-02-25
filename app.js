// --- VERY TOP OF app.js for file loading check ---
console.log("--- app.js LATEST (Restored Logic + Zoom Prompt) - " + new Date().toLocaleTimeString() + " ---");

// Define descriptions for metrics. These constants are from config.js
const METRIC_DESCRIPTIONS = {
    [PATCH_AREA_ATTRIBUTE]: "Patch Area: The total land area of the forest patch in hectares (ha). This indicates the overall size of the habitat.",
    [CORE_AREA_ATTRIBUTE]: "Core Area: The area within a forest patch that is buffered from edge effects, in hectares (ha).",
    [CONTIGUITY_INDEX_ATTRIBUTE]: "Contiguity Index: A measure of spatial connectedness. Values range from 0 to 1.",
    [PERIMETER_AREA_RATIO_ATTRIBUTE]: "Perimeter-Area Ratio: The ratio of the patch's perimeter to its area.",
    [ENN_ATTRIBUTE]: "Euclidean Nearest-Neighbor (ENN): The shortest straight-line distance to the nearest neighboring forest patch, in meters."
};

let metricPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof mapboxgl === 'undefined') {
        console.error("Mapbox GL JS not loaded.");
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
    const zoomPrompt = document.getElementById('zoom-prompt');
    const ZOOM_THRESHOLD = 11;

    // --- ZOOM PROMPT LOGIC ---
    function updateZoomPrompt() {
        if (!zoomPrompt) return;
        if (map.getZoom() >= ZOOM_THRESHOLD) {
            zoomPrompt.classList.add('hidden');
        } else {
            zoomPrompt.classList.remove('hidden');
        }
    }

    map.on('load', () => {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        
        // Initial check for zoom prompt
        updateZoomPrompt();

        // Add geocoder
        const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search location...',
            marker: true
        });
        document.getElementById('search-geocoder-container').appendChild(geocoder.onAdd(map));
    });

    map.on('zoom', updateZoomPrompt);
    map.on('move', updateZoomPrompt);

    // --- SIDEBAR TOGGLE LOGIC ---
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const appContainer = document.getElementById('app-container');

    if (toggleSidebarBtn && sidebar && appContainer) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            // This works with your existing CSS classes
            appContainer.classList.toggle('sidebar-collapsed');
            
            // Allow CSS transition to finish before resizing map
            setTimeout(() => { map.resize(); }, 305);

            // Update arrow icon
            toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
        });
    }

    // --- DARK MODE LOGIC ---
    const toggleButton = document.getElementById('dark-mode-toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            toggleButton.textContent = isDark ? '☀️' : '🌓';
        });
    }

    // --- REST OF YOUR ORIGINAL FUNCTIONS ---
    // (Keep your Filter logic, Info Panel updates, and Stats calculations here)
    // Because we restored the original HTML IDs, your functions like 
    // document.getElementById('stats-content') will now work perfectly again.
});

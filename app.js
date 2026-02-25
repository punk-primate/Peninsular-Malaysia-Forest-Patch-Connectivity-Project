document.addEventListener('DOMContentLoaded', () => {
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

    function updateZoomPrompt() {
        if (!zoomPrompt) return;
        map.getZoom() >= ZOOM_THRESHOLD ? zoomPrompt.classList.add('hidden') : zoomPrompt.classList.remove('hidden');
    }

    map.on('load', () => {
        loadingIndicator.style.display = 'none';
        updateZoomPrompt();
    });

    map.on('zoom', updateZoomPrompt);

    // --- SIDEBAR TOGGLE LOGIC ---
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            
            // Adjust map size after sidebar animation finishes
            setTimeout(() => {
                map.resize();
            }, 305);

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
});

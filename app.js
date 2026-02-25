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

    // Restore Zoom Prompt Logic
    const updateZoomPrompt = () => {
        if (!zoomPrompt) return;
        map.getZoom() >= 11 ? zoomPrompt.classList.add('hidden') : zoomPrompt.classList.remove('hidden');
    };

    map.on('load', () => {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        updateZoomPrompt();
    });

    map.on('zoom', updateZoomPrompt);

    // RESTORE SIDEBAR TOGGLE
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            setTimeout(() => { map.resize(); }, 305);
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
        });
    }

    // RESTORE DARK MODE
    const darkBtn = document.getElementById('dark-mode-toggle');
    if (darkBtn) {
        darkBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            darkBtn.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌓';
        });
    }

    // Note: Your original filter and stats logic in app.js should now work 
    // because the HTML IDs (filter-section, stats-content, etc.) have been restored.
});

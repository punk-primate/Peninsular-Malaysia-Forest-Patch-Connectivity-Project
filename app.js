document.addEventListener('DOMContentLoaded', () => {
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_STYLE_CUSTOM,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
    });

    const zoomPrompt = document.getElementById('zoom-prompt');
    const updateZoom = () => {
        if (!zoomPrompt) return;
        map.getZoom() >= 11 ? zoomPrompt.classList.add('hidden') : zoomPrompt.classList.remove('hidden');
    };

    map.on('zoom', updateZoom);
    map.on('load', updateZoom);

    // SIDEBAR TOGGLE
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            setTimeout(() => { map.resize(); }, 305);
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
        });
    }

    // DARK MODE
    const darkBtn = document.getElementById('dark-mode-toggle');
    if (darkBtn) {
        darkBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
        });
    }
});

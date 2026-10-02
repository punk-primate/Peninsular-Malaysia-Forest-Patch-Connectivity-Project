/* Public exploration of the supplied resistance and normalized-current models. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        const map = window._mapInstance; if (!map) return;
        const empty = () => ({ type: 'FeatureCollection', features: [] });
        const landscape = FOREST_PATCH_LAYER_ID === 'Kuantan Forest Patches' ? 'kuantan' : 'klang-valley';
        const metadataURL = new URL('data/connectivity/' + landscape + '.json', location.href).href;
        let worker = null, loading = null, metadata = null, ready = false, busy = false, job = 0;
        let active = false, picking = null, start = null, end = null, result = null, footprint = null, footprintKey = '';
        const button = document.createElement('button'); button.id = 'connectivity-toggle'; button.textContent = 'Connections';
        button.setAttribute('aria-controls', 'connectivity-panel'); button.setAttribute('aria-expanded', 'false');
        document.getElementById('map-top-bar').insertBefore(button, document.getElementById('home-btn'));
        const panel = document.createElement('section'); panel.id = 'connectivity-panel'; panel.className = 'sidebar-section'; panel.hidden = true;
        panel.innerHTML = '<h3>Modelled connections</h3>' +
            '<p>Select two locations to find the path with the lowest accumulated resistance in the supplied model.</p>' +
            '<div class="connection-points"><button id="connection-start">Choose start A</button><button id="connection-end">Choose end B</button></div>' +
            '<p id="connection-locations">No locations selected.</p>' +
            '<label class="connection-flow-toggle"><input type="checkbox" id="connection-flow"> Show high-flow areas (blue)</label>' +
            '<p id="connection-status" role="status" aria-live="polite">Loading model data…</p>' +
            '<button id="connection-analyse" class="connection-primary" disabled>Calculate path</button>' +
            '<div id="connection-results" hidden></div>' +
            '<details><summary>How this is calculated</summary><p>Paths use the original approximately 30 m resistance cells and eight-direction movement. Lower accumulated resistance is preferred. NoData cells are blocked; finite resistance values, including 100, remain traversable. Lines show paths, not corridor widths.</p>' +
            '<p>For a calculated development scenario, every cell touched by the footprint is treated as impassable. This is a scenario assumption. High-flow areas remain the supplied baseline; Omniscape has not been rerun.</p>' +
            '<p>Blue areas mark the top 10% of positive supplied normalized-current values, with ties included. This relative threshold does not establish ecological pinch points. The overlay uses 90 m display pixels; footprint counts use the original approximately 30 m cells.</p>' +
            '<p>Modelled paths require field assessment and do not establish canopy continuity, safe road crossings, or observed wildlife movement.</p></details>' +
            '<button id="connection-fit" disabled>View whole path</button>' +
            '<div class="connection-actions"><button id="connection-export" disabled>Download assessment</button><button id="connection-reset">Clear points</button><button id="connection-close">Close</button></div>';
        document.getElementById('sidebar').insertBefore(panel, document.getElementById('tools-section'));
        const get = id => document.getElementById(id);
        const status = (text, error = false) => { get('connection-status').textContent = text; get('connection-status').classList.toggle('connection-error', error); };
        const fmt = value => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
        const api = window._connectivityExplorer = {
            get picking() { return !!picking; },
            get assessment() { return result ? { ...result, sourceModel: metadata.sourceModel,
                method: 'Native-grid least-cost path; average endpoint resistance times projected step distance; development touched cells impassable',
                flowMethod: 'Top 10% of positive supplied normalized current; whole native cells touched by footprint',
                sourceProvenance: metadata.provenance, currentFlowRecalculated: false } : null; },
            open
        };
        function update() {
            const drawing = !!(window._developmentScenario && window._developmentScenario.drawing);
            ['connection-start', 'connection-end'].forEach(id => { get(id).disabled = !ready || busy || drawing; });
            get('connection-analyse').disabled = !ready || busy || drawing || !start || !end;
            get('connection-analyse').textContent = busy ? 'Calculating…' : 'Calculate path';
            get('connection-export').disabled = !result;
            get('connection-fit').disabled = !result || ![result.baseline, result.scenario].some(path => path && path.status === 'found');
            get('connection-start').classList.toggle('selected', picking === 'start');
            get('connection-end').classList.toggle('selected', picking === 'end');
            get('connection-locations').textContent = 'A: ' + (start ? start.map(n => n.toFixed(5)).join(', ') : 'not selected') +
                ' · B: ' + (end ? end.map(n => n.toFixed(5)).join(', ') : 'not selected');
        }
        function layers() {
            if (!map.getStyle()) return;
            ['connection-existing', 'connection-scenario', 'connection-points'].forEach(id => {
                if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() });
            });
            const definitions = [
                { id: 'connection-existing-line', type: 'line', source: 'connection-existing', paint: { 'line-color': '#7946bf', 'line-width': 4, 'line-dasharray': [2, 1] } },
                { id: 'connection-scenario-line', type: 'line', source: 'connection-scenario', paint: { 'line-color': '#d25b05', 'line-width': 4 } },
                { id: 'connection-points-circle', type: 'circle', source: 'connection-points', paint: { 'circle-radius': 7,
                    'circle-color': ['match', ['get', 'point'], 'A', '#7946bf', '#d25b05'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } }
            ];
            definitions.forEach(layer => { if (!map.getLayer(layer.id)) map.addLayer(layer); });
            if (metadata && !map.getSource('connection-high-flow')) {
                map.addSource('connection-high-flow', { type: 'image', url: new URL(metadata.flow.display.file, metadataURL).href,
                    coordinates: metadata.flow.display.coordinates });
                // Put the baseline flow behind all scenario/path overlays.
                const firstOverlay = (map.getStyle().layers || []).find(layer => /^(development-|connection-)/.test(layer.id));
                map.addLayer({ id: 'connection-high-flow-raster', type: 'raster', source: 'connection-high-flow',
                    paint: { 'raster-opacity': .8, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, firstOverlay && firstOverlay.id);
            }
        }
        function drawMap() {
            if (!metadata || !map.getStyle()) return;
            // Wait for initial/basemap style loading, but keep updating existing
            // sources while Mapbox is processing their GeoJSON changes.
            if (!map.getSource('connection-existing') && !map.isStyleLoaded()) return;
            layers();
            const beforeView = window._developmentScenario && window._developmentScenario.active && window._developmentScenario.view === 'before';
            map.getSource('connection-existing').setData(active && result && result.baseline && result.baseline.status === 'found' ?
                { type: 'FeatureCollection', features: [result.baseline.geometry] } : empty());
            map.getSource('connection-scenario').setData(active && !beforeView && result && result.scenario && result.scenario.status === 'found' ?
                { type: 'FeatureCollection', features: [result.scenario.geometry] } : empty());
            map.getSource('connection-points').setData({ type: 'FeatureCollection', features: active ? [[start, 'A'], [end, 'B']].filter(([p]) => p).map(([p, label]) =>
                ({ type: 'Feature', properties: { point: label }, geometry: { type: 'Point', coordinates: p } })) : [] });
            if (map.getLayer('connection-high-flow-raster')) map.setLayoutProperty('connection-high-flow-raster', 'visibility', active && get('connection-flow').checked ? 'visible' : 'none');
        }
        function flowSummary() {
            const target = get('development-connectivity-summary'); if (!target) return;
            if (!result || !result.exposure) { target.textContent = footprint ? 'Loading baseline high-flow exposure…' : ''; return; }
            const exposure = result.exposure;
            target.textContent = 'Baseline high-flow cells touched: ' + exposure.highCells.toLocaleString() + '. Valid flow cells touched: ' + exposure.validCells.toLocaleString() +
                '. Counts use whole approximately 30 m cells, including boundary contacts. Flow has not been recalculated.' +
                (exposure.outside ? ' The footprint extends beyond this flow grid; counts cover available cells only.' : '') +
                (exposure.validCells < exposure.touchedCells ? ' Some touched cells have no valid flow data.' : '');
        }
        function render() {
            const target = get('connection-results'); target.hidden = !result;
            if (!result) { target.innerHTML = ''; flowSummary(); return; }
            const row = (label, value) => '<div class="connection-metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
            let html = '<p class="connection-legend"><span class="existing-key"></span>Existing path <span class="scenario-key"></span>Development path</p>';
            const messages = { 'unreachable': 'No path exists between these cells under this model and its blocked-cell rules.',
                'endpoint-blocked': 'A selected endpoint cell is covered by the development footprint.' };
            if (result.baseline) {
                if (result.baseline.status === 'found') {
                    html += row('Existing path length', fmt(result.baseline.lengthM / 1000) + ' km') + row('Existing accumulated cost', fmt(result.baseline.cost)) +
                        row('Length in highest resistance', fmt(result.baseline.highestResistanceM / 1000) + ' km');
                } else html += '<p>' + messages[result.baseline.status] + '</p>';
            }
            if (result.scenario) {
                if (result.scenario.status === 'found') {
                    html += row('Development path length', fmt(result.scenario.lengthM / 1000) + ' km') + row('Development accumulated cost', fmt(result.scenario.cost)) +
                        row('Development length in highest resistance', fmt(result.scenario.highestResistanceM / 1000) + ' km');
                    if (result.baseline.status === 'found') html += row('Change in accumulated cost', fmt(100 * (result.scenario.cost / result.baseline.cost - 1)) + '%');
                } else html += '<p class="connection-warning">' + messages[result.scenario.status] + ' This does not establish population isolation.</p>';
                if (result.outsideResistanceExtent) html += '<p class="connection-warning">Part of the footprint is outside the resistance map. Only available cells are assessed.</p>';
            }
            if (result.exposure) html += row('Baseline high-flow cells touched', result.exposure.highCells.toLocaleString());
            if (!result.hasDevelopment) html += '<p class="connection-detail">Draw and calculate a development footprint to compare its effect on this path.</p>';
            html += '<p class="connection-detail">Cost is resistance × projected metres, not a movement probability. Endpoints snap to native cell centres. Finite high resistance remains traversable; paths need feasibility checks.</p>';
            target.innerHTML = html; flowSummary();
        }
        function load() {
            if (ready) return Promise.resolve();
            if (loading) return loading;
            status('Loading the supplied resistance and flow models…');
            loading = new Promise((resolve, reject) => {
                worker = new Worker('connectivity-worker.js');
                function failure(text) {
                    ready = busy = false; loading = null; worker.terminate(); worker = null;
                    status(text, true); update();
                    const target = get('development-connectivity-summary'); if (target) target.textContent = text;
                    reject(new Error(text));
                }
                worker.onerror = () => failure('The model service could not start. Close and reopen Connections to retry.');
                worker.onmessage = event => {
                    const message = event.data;
                    if (message.type === 'ready') {
                        ready = true; metadata = message.metadata; status('Model loaded. Choose start A and end B on the map.');
                        drawMap(); update(); resolve(); return;
                    }
                    if (message.job != null && message.job !== job) return;
                    if (message.type === 'error') {
                        if (message.job == null) { failure(message.message); return; }
                        busy = false; status(message.message, true);
                        const target = get('development-connectivity-summary'); if (target) target.textContent = message.message;
                        update(); return;
                    }
                    if (message.type === 'progress') { status('Calculating ' + message.phase + ' path… ' + message.expanded.toLocaleString() + ' cells searched.'); return; }
                    if (message.type === 'result') {
                        result = message.result; busy = false; drawMap(); render(); update();
                        status(result.baseline ? 'Path assessment calculated. Purple is existing; orange is the development scenario.' : 'Baseline high-flow exposure calculated. Select two locations to assess a path.');
                    }
                };
                worker.postMessage({ type: 'load', url: metadataURL });
            });
            return loading;
        }
        function invalidate() { job++; busy = false; result = null; drawMap(); render(); update(); }
        function analyse() {
            if (!ready || (!footprint && (!start || !end))) return;
            job++; busy = true; status('Calculating native-grid model changes…'); update();
            worker.postMessage({ type: 'analyse', job, start, end, footprint });
        }
        async function open() {
            active = true; panel.hidden = false; button.classList.add('active'); button.setAttribute('aria-expanded', 'true');
            if (get('sidebar').classList.contains('collapsed')) get('toggle-sidebar-btn').click();
            panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); update();
            try { await load(); drawMap(); } catch (_) {}
        }
        function close() {
            active = false; picking = null; panel.hidden = true; button.classList.remove('active'); button.setAttribute('aria-expanded', 'false');
            map.getCanvas().style.cursor = ''; drawMap(); update();
        }
        button.addEventListener('click', () => active ? close() : open());
        get('connection-close').addEventListener('click', close);
        ['start', 'end'].forEach(which => get('connection-' + which).addEventListener('click', () => {
            picking = picking === which ? null : which; map.getCanvas().style.cursor = picking ? 'crosshair' : '';
            status(picking ? 'Click the map to place ' + (which === 'start' ? 'start A' : 'end B') + '.' : 'Location selection cancelled.'); update();
        }));
        map.on('click', event => {
            if (!picking) return;
            const point = [event.lngLat.lng, event.lngLat.lat]; if (picking === 'start') start = point; else end = point;
            picking = null; map.getCanvas().style.cursor = ''; invalidate();
            status(start && end ? 'Both locations selected. Calculate the path.' : 'Choose the other location.');
            if (footprint) analyse();
        });
        get('connection-analyse').addEventListener('click', analyse);
        get('connection-flow').addEventListener('change', drawMap);
        get('connection-fit').addEventListener('click', () => {
            const coordinates = [result.baseline, result.scenario].filter(path => path && path.status === 'found').flatMap(path => path.geometry.geometry.coordinates);
            let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
            coordinates.forEach(([x,y]) => { west = Math.min(west,x); east = Math.max(east,x); south = Math.min(south,y); north = Math.max(north,y); });
            map.fitBounds([[west,south],[east,north]], { padding:70, maxZoom:17, duration:500 });
        });
        get('connection-reset').addEventListener('click', () => {
            start = end = null; picking = null; map.getCanvas().style.cursor = ''; invalidate();
            status('Choose two new locations.'); if (footprint) analyse();
        });
        get('connection-export').addEventListener('click', () => {
            if (!result) return;
            const output = { landscape: metadata.landscape, selectedStart: start, selectedEnd: end, footprint,
                created: new Date().toISOString(), ...api.assessment };
            const url = URL.createObjectURL(new Blob([JSON.stringify(output)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'connectivity-assessment.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        document.addEventListener('click', event => { if (event.target.closest('[data-open-connectivity]')) open(); });
        document.addEventListener('forestconnect:development', event => {
            const next = event.detail.footprint, key = next ? JSON.stringify(next.geometry) : '';
            if (event.detail.drawing && picking) { picking = null; map.getCanvas().style.cursor = ''; }
            if (key !== footprintKey) {
                footprint = next; footprintKey = key; invalidate();
                if (footprint || (start && end)) load().then(() => { if (key === footprintKey) analyse(); }).catch(() => {});
            }
            drawMap(); update(); flowSummary();
        });
        map.on('style.load', () => { if (metadata) drawMap(); });
        map.on('idle', () => {
            // A model may finish loading before the initial map tiles do.
            if (metadata && !map.getSource('connection-existing')) drawMap();
        });
        update();
    });
})();

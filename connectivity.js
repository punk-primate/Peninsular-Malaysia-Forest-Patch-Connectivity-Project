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
        const markers = {};
        const button = document.createElement('button'); button.id = 'connectivity-toggle'; button.textContent = 'Connections';
        button.setAttribute('aria-controls', 'connectivity-panel'); button.setAttribute('aria-expanded', 'false');
        document.getElementById('map-top-bar').insertBefore(button, document.getElementById('home-btn'));
        const panel = document.createElement('section'); panel.id = 'connectivity-panel'; panel.className = 'sidebar-section'; panel.hidden = true;
        panel.innerHTML = '<h3>Compare routes</h3>' +
            '<p>Compare a route between the same two places before and with your development. Routes favour lower resistance across the landscape.</p>' +
            '<p>These are potential connections that may need protection or restoration to become functioning wildlife corridors. Development can obstruct that opportunity before a corridor is established.</p>' +
            '<ol class="connection-steps"><li id="connection-step-points">Place A and B on the map</li><li id="connection-step-route">Draw a development footprint</li><li id="connection-step-development">Select Calculate changes</li></ol>' +
            '<div class="connection-points"><button id="connection-start">Choose start A</button><button id="connection-end">Choose end B</button></div>' +
            '<button id="connection-cancel" hidden>Cancel point placement</button>' +
            '<p id="connection-locations">No locations selected.</p>' +
            '<label class="connection-flow-toggle"><input type="checkbox" id="connection-flow"> Show baseline high-flow areas (blue)</label>' +
            '<p id="connection-status" role="status" aria-live="polite">Loading model data…</p>' +
            '<button id="connection-development" class="connection-development">Draw a development to compare</button>' +
            '<div class="connection-route-actions"><button id="connection-analyse" disabled>Refresh routes</button><button id="connection-fit" disabled>View routes on map</button></div>' +
            '<div id="connection-results" hidden></div>' +
            '<details><summary>How this is calculated</summary><p>Paths use the original approximately 30 m resistance cells and eight-direction movement. Lower accumulated resistance is preferred. NoData cells are blocked; finite resistance values, including 100, remain traversable. Lines show paths, not corridor widths.</p>' +
            '<p>The before-development route uses the current resistance map. The with-development route treats every cell touched by your calculated footprint as impassable, then finds a route around it. Both routes connect the same A and B.</p>' +
            '<p>Blue areas mark the top 10% of positive supplied normalized-current values, with ties included. This relative threshold does not establish ecological pinch points. The overlay uses 90 m display pixels; footprint counts use the original approximately 30 m cells.</p>' +
            '<p>Modelled paths require field assessment and do not establish canopy continuity, safe road crossings, or observed wildlife movement.</p></details>' +
            '<div class="connection-actions"><button id="connection-export" disabled>Download assessment</button><button id="connection-reset">Clear points</button><button id="connection-close">Close routes</button></div>';
        document.getElementById('sidebar').insertBefore(panel, document.getElementById('tools-section'));
        const mapLegend = document.createElement('aside'); mapLegend.id = 'connection-map-legend'; mapLegend.hidden = true;
        mapLegend.setAttribute('aria-label', 'Route comparison legend'); map.getContainer().appendChild(mapLegend);
        const get = id => document.getElementById(id);
        const status = (text, error = false) => { get('connection-status').textContent = text; get('connection-status').classList.toggle('connection-error', error); };
        const fmt = value => value.toLocaleString('en-GB', { maximumFractionDigits: 2 });
        const api = window._connectivityExplorer = {
            get active() { return active; },
            get picking() { return !!picking; },
            get selectedPoint() { return picking === 'start' ? 'A' : 'B'; },
            get assessment() { return result ? { ...result, sourceModel: metadata.sourceModel,
                method: 'Native-grid least-cost path; average endpoint resistance times projected step distance; development touched cells impassable',
                flowMethod: 'Top 10% of positive supplied normalized current; whole native cells touched by footprint',
                sourceProvenance: metadata.provenance, currentFlowRecalculated: false } : null; },
            open
        };
        function update() {
            if (window._forestMapInteraction) window._forestMapInteraction.refresh();
            const drawing = !!(window._developmentScenario && window._developmentScenario.drawing);
            ['connection-start', 'connection-end'].forEach(id => { get(id).disabled = !ready || busy || drawing; });
            get('connection-analyse').disabled = !ready || busy || drawing || !start || !end;
            get('connection-analyse').textContent = busy ? 'Calculating…' : 'Refresh routes';
            get('connection-analyse').hidden = !start || !end;
            get('connection-cancel').hidden = !picking;
            get('connection-development').disabled = busy || drawing;
            get('connection-development').textContent = footprint ? 'Edit development footprint' : 'Draw a development to compare';
            get('connection-export').disabled = !result;
            get('connection-fit').disabled = !result || ![result.baseline, result.scenario].some(path => path && path.status === 'found');
            get('connection-start').classList.toggle('selected', picking === 'start');
            get('connection-end').classList.toggle('selected', picking === 'end');
            get('connection-locations').textContent = 'A: ' + (start ? 'placed on map' : 'not selected') + ' · B: ' + (end ? 'placed on map' : 'not selected');
            const complete = [!!(start && end), !!(window._developmentScenario && window._developmentScenario.hasDrawing), !!(result && result.scenario)];
            ['points', 'route', 'development'].forEach((step, i) => {
                const el = get('connection-step-' + step); el.classList.toggle('complete', complete[i]);
                if (!complete[i] && (i === 0 || complete[i - 1])) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
            });
        }
        function layers() {
            if (!map.getStyle()) return;
            ['connection-existing', 'connection-scenario', 'connection-points', 'connection-blocked-cells'].forEach(id => {
                if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty() });
            });
            const definitions = [
                { id: 'connection-blocked-fill', type: 'fill', source: 'connection-blocked-cells', paint: { 'fill-color': '#b82323', 'fill-opacity': .22 } },
                { id: 'connection-blocked-outline', type: 'line', source: 'connection-blocked-cells', paint: { 'line-color': '#b82323', 'line-width': 3 } },
                { id: 'connection-existing-halo', type: 'line', source: 'connection-existing', paint: { 'line-color': '#ffffff', 'line-width': 8 } },
                { id: 'connection-scenario-halo', type: 'line', source: 'connection-scenario', paint: { 'line-color': '#ffffff', 'line-width': 8 } },
                { id: 'connection-scenario-line', type: 'line', source: 'connection-scenario', paint: { 'line-color': '#d25b05', 'line-width': 4 } },
                { id: 'connection-existing-line', type: 'line', source: 'connection-existing', paint: { 'line-color': '#7946bf', 'line-width': 4, 'line-dasharray': [2, 1] } },
                { id: 'connection-points-circle', type: 'circle', source: 'connection-points', paint: { 'circle-radius': 7,
                    'circle-color': '#23364e', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } }
            ];
            definitions.forEach(layer => { if (!map.getLayer(layer.id)) map.addLayer(layer); });
            // Development may be opened after Connections. Keep filled forest
            // and footprint overlays below route colours, and Draw handles above.
            const ordered = map.getStyle().layers || [];
            const firstRoute = ordered.findIndex(layer => layer.id === definitions[0].id);
            const lastFill = ordered.reduce((last, layer, index) =>
                /^(development-|gl-draw)/.test(layer.id) && layer.type === 'fill' ? index : last, -1);
            if (lastFill > firstRoute) {
                definitions.forEach(layer => map.moveLayer(layer.id));
                ordered.filter(layer => /^gl-draw/.test(layer.id) && layer.type !== 'fill').forEach(layer => map.moveLayer(layer.id));
            }
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
            map.getSource('connection-blocked-cells').setData(active && !beforeView && result && result.blockedEndpointCells || empty());
            map.getSource('connection-points').setData({ type: 'FeatureCollection', features: active ? [[result && result.snappedStart || start, 'A'], [result && result.snappedEnd || end, 'B']].filter(([p]) => p).map(([p, label]) =>
                ({ type: 'Feature', properties: { point: label }, geometry: { type: 'Point', coordinates: p } })) : [] });
            if (map.getLayer('connection-high-flow-raster')) map.setLayoutProperty('connection-high-flow-raster', 'visibility', active && get('connection-flow').checked ? 'visible' : 'none');
            [[start, 'A', result && result.snappedStart], [end, 'B', result && result.snappedEnd]].forEach(([point, label, snapped]) => {
                if (!active || !point) { if (markers[label]) { markers[label].remove(); delete markers[label]; } return; }
                if (!markers[label]) {
                    const element = document.createElement('div'); element.className = 'connection-marker'; element.textContent = label;
                    element.setAttribute('aria-label', 'Route endpoint ' + label); element.title = 'Route endpoint ' + label;
                    markers[label] = new mapboxgl.Marker({ element }).setLngLat(snapped || point).addTo(map);
                } else markers[label].setLngLat(snapped || point);
                const blocked = !beforeView && result && (result.blockedEndpoints || []).includes(label);
                const element = markers[label].getElement();
                element.classList.toggle('connection-marker-blocked', !!blocked);
                element.title = 'Route endpoint ' + label + (blocked ? ': development touches its model cell' : '');
                element.setAttribute('aria-label', element.title);
            });
            const before = active && result && result.baseline && result.baseline.status === 'found';
            const after = active && !beforeView && result && result.scenario && result.scenario.status === 'found';
            mapLegend.hidden = !active || (!start && !end && !get('connection-flow').checked);
            mapLegend.innerHTML = '<strong>Routes between A and B</strong>' +
                (before ? '<div class="connection-legend-row"><span class="connection-key existing-key"></span>Before development</div>' : '') +
                (after ? '<div class="connection-legend-row"><span class="connection-key scenario-key"></span>With development</div>' : '') +
                (before && after ? '<p>Where lines overlap, both routes follow the same cells.</p>' : before ? '<p>' + (beforeView && result.hasDevelopment ? 'Showing the before-development view.' : result.scenario ? result.scenario.status === 'endpoint-blocked' ? 'Red outline: blocked endpoint cell.' : 'No route found with development under this model.' : 'Draw and calculate development to add a comparison.') + '</p>' : '<p>Place A and B to see a route.</p>') +
                (get('connection-flow').checked ? '<div class="connection-legend-row"><span class="connection-flow-key"></span>Baseline high-flow areas</div>' : '');
        }
        function flowSummary() {
            const target = get('development-connectivity-summary'); if (!target) return;
            if (!result || !result.exposure) { target.textContent = footprint ? 'Loading baseline high-flow exposure…' : ''; return; }
            const exposure = result.exposure;
            target.textContent = 'Baseline high-flow cells touched: ' + exposure.highCells.toLocaleString() + '. Valid flow cells touched: ' + exposure.validCells.toLocaleString() +
                '. Counts use whole approximately 30 m cells, including boundary contacts.' +
                (exposure.outside ? ' The footprint extends beyond this flow grid; counts cover available cells only.' : '') +
                (exposure.validCells < exposure.touchedCells ? ' Some touched cells have no valid flow data.' : '');
        }
        function render() {
            const target = get('connection-results'); target.hidden = !result;
            if (!result) { target.innerHTML = ''; flowSummary(); return; }
            const row = (label, value) => '<div class="connection-metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
            let html = '';
            const messages = { 'unreachable': 'No path exists between these cells under this model and its blocked-cell rules.',
                'endpoint-blocked': 'A selected endpoint cell is covered by the development footprint.' };
            if (result.baseline && result.baseline.status === 'found') {
                let heading = 'Potential connection before development', explanation = 'This modelled route could inform a future corridor, even where no corridor has been established. Draw a development footprint and select Calculate changes to assess this opportunity.';
                if (result.scenario && result.scenario.status === 'found') {
                    const change = 100 * (result.scenario.cost / result.baseline.cost - 1);
                    const same = JSON.stringify(result.baseline.geometry) === JSON.stringify(result.scenario.geometry);
                    const obstructed = result.baselineCellsBlocked > 0;
                    heading = same ? 'Potential connection remains available' : obstructed ? 'Potential corridor opportunity obstructed' : 'An alternative potential route is shown';
                    explanation = same ? 'The same modelled route remains available between A and B with this footprint.' : obstructed ?
                        'Your development blocks part of the original potential route. This could reduce opportunities for a future corridor through protection or restoration, even if no corridor exists there yet. An alternative route remains available around the footprint under this model.' :
                        'The original potential route remains outside the footprint. The model shows a different available route between A and B.';
                    explanation += change > 0.005 ? ' Total route resistance is ' + fmt(change) + '% greater than before development.' : Math.abs(change) > 1e-9 ? ' Total route resistance changes by less than 0.01%.' : ' Total route resistance stays the same.';
                    if (result.scenario.lengthM < result.baseline.lengthM - 1 && change > 0.005) explanation += ' A shorter route can still pass through higher-resistance cells.';
                } else if (result.scenario) {
                    const blocked = result.blockedEndpoints || [];
                    heading = result.scenario.status === 'endpoint-blocked' ? 'Move ' + blocked.join(' and ') + ' to compare routes' : 'Potential connection blocked under this model';
                    explanation = result.scenario.status === 'endpoint-blocked' ?
                        'Your development touches the approximately 30 m model ' + (blocked.length > 1 ? 'cells containing ' : 'cell containing ') + blocked.join(' and ') + '. The blocked ' + (blocked.length > 1 ? 'cells are' : 'cell is') + ' outlined in red. Move the marked point farther from the footprint, even if it looks outside the drawn edge.' :
                        'Your development cuts off the modelled connection between A and B. This could sever an opportunity for a future corridor, even where none has been established. No alternative route remains under this model and its barrier assumption.';
                }
                html += '<div class="connection-outcome"><strong>' + heading + '</strong><p>' + explanation + '</p></div>';
                if (result.scenario && result.scenario.status === 'endpoint-blocked') html += '<div class="connection-points">' + result.blockedEndpoints.map(label => '<button data-move-endpoint="' + label + '">Move ' + label + '</button>').join('') + '</div>';
            } else if (!result.baseline) html += '<div class="connection-outcome"><strong>Development footprint assessed</strong><p>Choose A and B to compare a route before and with development.</p></div>';
            if (result.baseline) {
                if (result.baseline.status === 'found') {
                    html += '<section class="connection-route-card"><h4><span class="connection-key existing-key"></span>Before development</h4><p>Potential route through the current landscape.</p>' + row('Route length', fmt(result.baseline.lengthM / 1000) + ' km') + '</section>';
                } else html += '<p>' + messages[result.baseline.status] + '</p>';
            }
            if (result.scenario) {
                if (result.scenario.status === 'found') {
                    html += '<section class="connection-route-card"><h4><span class="connection-key scenario-key"></span>With development</h4><p>Potential route with your footprint treated as a barrier.</p>' + row('Route length', fmt(result.scenario.lengthM / 1000) + ' km') + '</section>';
                }
                if (result.outsideResistanceExtent) html += '<p class="connection-warning">Part of the footprint is outside the resistance map. Only available cells are assessed.</p>';
            }
            if (result.baseline && result.baseline.status === 'found') {
                html += '<section class="connection-route-card connection-resistance-reference" aria-label="Resistance cost comparison"><h4>Resistance cost in context</h4>' +
                    '<p>Resistance cost describes how difficult the whole route is to cross in this model. Longer routes and higher-resistance cells increase the cost.</p>' +
                    '<p>For the same A and B, we set the before-development route to <strong>100</strong> as a reference.</p>' +
                    row('Before development: reference score', '100');
                if (result.scenario && result.scenario.status === 'found') {
                    html += row('With development: relative score', fmt(100 * (result.scenario.cost / result.baseline.cost)));
                } else if (result.scenario) {
                    html += '<p>No comparison score: ' + (result.scenario.status === 'endpoint-blocked' ? 'move the blocked endpoint first.' : 'no route was found with development.') + '</p>';
                } else html += '<p>Draw and calculate development to get a comparison score.</p>';
                html += '<p>Example: <strong>120</strong> means <strong>20% more resistance</strong> than before; <strong>200</strong> means twice the resistance.</p>' +
                    '<p>Compare scores for this A/B pair only. They are not percentages of habitat lost or wildlife survival.</p></section>';
            }
            if (result.exposure) html += row('Baseline high-flow cells touched', result.exposure.highCells.toLocaleString());
            if (result.baseline && result.baseline.status === 'found') {
                html += '<details class="connection-cost-details"><summary>Raw model cost and route details</summary><p>The comparison score above rescales these totals so the before-development route equals 100. Raw cost sums resistance × projected distance along the route; it is not a movement probability.</p>' +
                    row('Before: raw resistance cost', fmt(result.baseline.cost)) + row('Before: length in highest resistance', fmt(result.baseline.highestResistanceM / 1000) + ' km');
                if (result.scenario && result.scenario.status === 'found') html += row('With development: raw resistance cost', fmt(result.scenario.cost)) + row('With development: length in highest resistance', fmt(result.scenario.highestResistanceM / 1000) + ' km');
                html += '<p>Cost uses resistance × projected metres. Endpoints snap to native cell centres.</p></details>';
            }
            target.innerHTML = html; flowSummary();
        }
        function load() {
            if (ready) return Promise.resolve();
            if (loading) return loading;
            status('Loading the supplied resistance and flow models…');
            loading = new Promise((resolve, reject) => {
                worker = new Worker('connectivity-worker.js?v=20261002-corridor');
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
                        ready = true; metadata = message.metadata; status('Choose A and B on the map. These are the same endpoints for both routes.');
                        drawMap(); update(); resolve(); return;
                    }
                    if (message.job != null && message.job !== job) return;
                    if (message.type === 'error') {
                        if (message.job == null) { failure(message.message); return; }
                        busy = false; status(message.message, true);
                        const target = get('development-connectivity-summary'); if (target) target.textContent = message.message;
                        update(); return;
                    }
                    if (message.type === 'progress') { status(message.phase === 'existing' ? 'Finding the route before development…' : 'Finding a route around your development…'); return; }
                    if (message.type === 'result') {
                        result = message.result; busy = false; drawMap(); render(); update();
                        let completionText = 'Footprint assessed. Choose A and B to compare routes.';
                        if (result.baseline) {
                            if (result.baseline.status !== 'found') completionText = 'No route found between A and B under this model.';
                            else if (!result.scenario) completionText = 'Potential connection ready. Draw a development to assess a future corridor opportunity.';
                            else if (result.scenario.status === 'found') completionText = 'Comparison ready. Dashed purple: before development. Solid orange: with development.';
                            else completionText = result.scenario.status === 'endpoint-blocked' ? 'Comparison needs a new endpoint. Use Move below.' : 'Potential connection blocked. See the result below.';
                        }
                        status(completionText);
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
        function place(which) {
            if (!ready || busy || window._developmentScenario && window._developmentScenario.drawing) return;
            picking = which; map.getCanvas().style.cursor = 'crosshair';
            status('Click the map to place ' + (which === 'start' ? 'A' : 'B') + '.'); update();
        }
        ['start', 'end'].forEach(which => get('connection-' + which).addEventListener('click', () => place(which)));
        get('connection-cancel').addEventListener('click', () => {
            picking = null; map.getCanvas().style.cursor = ''; status('Point placement cancelled. Your placed points are kept.'); update();
        });
        get('connection-results').addEventListener('click', event => {
            const target = event.target.closest('[data-move-endpoint]');
            if (target) place(target.dataset.moveEndpoint === 'A' ? 'start' : 'end');
        });
        map.on('click', event => {
            if (!picking) return;
            const point = [event.lngLat.lng, event.lngLat.lat]; if (picking === 'start') start = point; else end = point;
            picking = null; map.getCanvas().style.cursor = ''; invalidate();
            if (start && end) analyse();
            else place(start ? 'end' : 'start');
        });
        get('connection-analyse').addEventListener('click', analyse);
        get('connection-development').addEventListener('click', () => {
            if (!window._developmentScenario.active) get('development-toggle').click();
            else get('development-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        get('connection-flow').addEventListener('change', drawMap);
        get('connection-fit').addEventListener('click', () => {
            const coordinates = [result.baseline, result.scenario].filter(path => path && path.status === 'found').flatMap(path => path.geometry.geometry.coordinates);
            let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
            coordinates.forEach(([x,y]) => { west = Math.min(west,x); east = Math.max(east,x); south = Math.min(south,y); north = Math.max(north,y); });
            map.fitBounds([[west,south],[east,north]], { padding:70, maxZoom:17, duration:500 });
            if (window.matchMedia('(max-width:768px)').matches && !get('sidebar').classList.contains('collapsed')) get('toggle-sidebar-btn').click();
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
            if (event.detail.drawing && picking) { picking = null; map.getCanvas().style.cursor = 'crosshair'; }
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

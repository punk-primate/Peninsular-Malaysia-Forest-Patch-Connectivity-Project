/* First-stage development scenarios: complete clearance inside one footprint. */
(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', function () {
        const map = window._mapInstance;
        if (!map) return;
        let active = false, drawing = false, busy = false, ready = false;
        let draw = null, worker = null, feature = null, result = null, job = 0;
        let view = 'scenario', loading = null, controlsSnapshot = [], filterSnapshot = null;
        let patchLayer = null, corridorSnapshot = [];
        const empty = () => ({ type: 'FeatureCollection', features: [] });
        const api = window._developmentScenario = {
            get active() { return active; },
            decoratePatchFilter: function (base) {
                if (!active || !result || !result.affected.length) return base;
                const exclude = ['!', ['in', ['to-string', ['get', PATCH_ID_ATTRIBUTE]], ['literal', result.affected.map(p => String(p.id))]]];
                return base ? ['all', base, exclude] : exclude;
            }
        };
        const button = document.createElement('button');
        button.id = 'development-toggle'; button.textContent = 'Development';
        button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'development-panel');
        document.getElementById('map-top-bar').insertBefore(button, document.getElementById('home-btn'));
        const panel = document.createElement('section');
        panel.id = 'development-panel'; panel.className = 'sidebar-section'; panel.hidden = true;
        panel.innerHTML = '<h3>Development scenario</h3>' +
            '<p class="development-intro">Draw a proposed development to see the forest that would be removed and the fragments left behind.</p>' +
            '<div class="development-shapes" role="group" aria-label="Development footprint shape">' +
            '<button data-shape="line">Line</button><button data-shape="rectangle">Rectangle</button><button data-shape="polygon">Polygon</button></div>' +
            '<label id="development-width-row" for="development-width" hidden>Total line width (m)' +
            '<input id="development-width" type="number" min="1" max="10000" value="30" step="1"></label>' +
            '<p id="development-status" role="status" aria-live="polite">Loading forest boundaries…</p>' +
            '<div id="development-drawing-actions" hidden><button id="development-finish">Finish drawing</button><button id="development-cancel">Cancel drawing</button></div>' +
            '<button id="development-analyse" class="development-primary" disabled>Calculate changes</button>' +
            '<div id="development-results" hidden></div>' +
            '<p class="development-assumption">Assumes all mapped forest inside the footprint is cleared. Results describe changes in forest geometry; wildlife movement has not been recalculated.</p>' +
            '<div class="development-actions"><button id="development-reset">Clear scenario</button><button id="development-close">Close</button></div>';
        const info = document.getElementById('info-panel-section'); info.parentNode.insertBefore(panel, info);
        const get = id => document.getElementById(id);
        const status = (message, error = false) => { get('development-status').textContent = message; get('development-status').classList.toggle('development-error', error); };
        const area = value => value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
        function updateActions() {
            get('development-analyse').disabled = !ready || !feature || drawing || busy;
            get('development-analyse').textContent = busy ? 'Calculating…' : 'Calculate changes';
            get('development-drawing-actions').hidden = !drawing;
        }
        function loadScript(url) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script'); script.src = url;
                script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Drawing dependencies could not load. Close the tool and try again.')); };
                document.head.appendChild(script);
            });
        }
        async function dependencies() {
            if (!window.MapboxDraw) await loadScript('vendor/mapbox-gl-draw-1.4.3.js');
            if (!window.turf) await loadScript('vendor/turf-6.5.0.min.js');
            if (!window.polygonClipping) await loadScript('vendor/polygon-clipping-0.15.7.min.js');
            if (!window.DevelopmentGeometry) await loadScript('scenario-engine.js');
        }
        function startWorker() {
            if (worker) return;
            worker = new Worker('scenario-worker.js');
            worker.onerror = () => {
                ready = busy = false; worker.terminate(); worker = null; loading = null;
                status('The calculation service could not start. Close the tool and try again.', true); updateActions();
            };
            worker.onmessage = event => {
                const message = event.data;
                if (message.type === 'ready') {
                    ready = true;
                    if (active && !drawing && !feature) status(message.count.toLocaleString() + ' forest patches loaded. Choose a drawing shape.');
                    updateActions(); return;
                }
                if (message.job != null && message.job !== job) return;
                if (message.type === 'progress') { status('Calculating forest changes… ' + message.percent + '%'); return; }
                if (message.type === 'error') {
                    busy = false;
                    if (message.job == null) { ready = false; worker.terminate(); worker = null; loading = null; }
                    status(message.message, true); updateActions(); return;
                }
                if (message.type === 'result' && active) {
                    busy = false; result = message.result; view = 'scenario';
                    applyMapView(); renderResults(); status('Scenario calculated. Compare the existing forest with the development scenario.'); updateActions();
                }
            };
            const dataset = FOREST_PATCH_LAYER_ID === 'Kuantan Forest Patches' ? 'kuantan' : 'klang-valley';
            worker.postMessage({ type: 'load', url: new URL('data/' + dataset + '-patches.geojson.gz', window.location.href).href });
        }
        function rectangleMode() {
            return {
                onSetup: function () {
                    const polygon = this.newFeature({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[]] } });
                    this.addFeature(polygon); this.clearSelectedFeatures(); this.updateUIClasses({ mouse: 'add' });
                    this.setActionableState({ trash: true });
                    const zoomEnabled = this.map.doubleClickZoom.isEnabled(); this.map.doubleClickZoom.disable();
                    return { polygon, start: null, valid: false, completed: false, zoomEnabled };
                },
                onClick: function (state, event) {
                    if (!state.start) { state.start = [event.lngLat.lng, event.lngLat.lat]; return; }
                    this.updateRectangle(state, event);
                    if (state.valid) { state.completed = true; this.changeMode('simple_select', { featureIds: [state.polygon.id] }); }
                },
                updateRectangle: function (state, event) {
                    if (!state.start) return;
                    const a = state.start, b = [event.lngLat.lng, event.lngLat.lat];
                    state.valid = Math.abs(a[0] - b[0]) > 1e-8 && Math.abs(a[1] - b[1]) > 1e-8;
                    // Draw's internal polygon rings are unclosed; toGeoJSON()
                    // adds the closing vertex. Avoid a duplicate zero-length edge.
                    state.polygon.setCoordinates([[a, [b[0], a[1]], b, [a[0], b[1]]]]);
                },
                onMouseMove: function (state, event) { this.updateRectangle(state, event); },
                onKeyUp: function (state, event) {
                    if (event.keyCode === 27) this.changeMode('simple_select');
                    if (event.keyCode === 13 && state.valid) { state.completed = true; this.changeMode('simple_select', { featureIds: [state.polygon.id] }); }
                },
                onTrash: function () { this.changeMode('simple_select'); },
                onStop: function (state) {
                    if (state.zoomEnabled) this.map.doubleClickZoom.enable();
                    if (state.completed && this.getFeature(state.polygon.id)) this.map.fire('draw.create', { features: [state.polygon.toGeoJSON()] });
                    else this.deleteFeature([state.polygon.id], { silent: true });
                },
                toDisplayFeatures: function (state, geojson, display) {
                    geojson.properties.active = geojson.properties.id === state.polygon.id ? 'true' : 'false';
                    if (geojson.properties.active !== 'true' || state.valid) display(geojson);
                }
            };
        }
        function createDraw() {
            if (draw) return;
            const modes = Object.assign({}, MapboxDraw.modes, { draw_rectangle: rectangleMode() });
            ['simple_select', 'draw_line_string', 'draw_polygon'].forEach(name => {
                const original = modes[name];
                modes[name] = Object.assign({}, original);
                ['onClick', 'onTap'].forEach(handler => {
                    modes[name][handler] = function (state, event) {
                        // Map tiles can briefly retain a deleted shape's vertices.
                        // They must not finish a new drawing or select a missing feature.
                        const target = event.featureTarget;
                        if (target) {
                            const id = target.properties.parent || target.properties.id;
                            const current = state.line || state.polygon;
                            if (!this.getFeature(id) || (current && id !== current.id)) event.featureTarget = null;
                        }
                        return original[handler].call(this, state, event);
                    };
                });
            });
            draw = new MapboxDraw({ displayControlsDefault: false, controls: {},
                modes });
            map.addControl(draw);
            map.on('draw.create', handleFeature); map.on('draw.update', handleFeature);
            map.on('draw.delete', () => { clearResult(); feature = null; updateActions(); status('Choose a shape to draw another footprint.'); });
            map.on('draw.modechange', event => {
                drawing = event.mode.startsWith('draw_'); updateActions();
                if (active && !drawing && !feature) status('Drawing cancelled. Choose a shape to start again.');
            });
        }
        function waitForMapIdle() {
            if (map.loaded()) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { map.off('idle', done); reject(new Error('The map is still loading. Close the tool and try again.')); }, 15000);
                function done() { clearTimeout(timeout); resolve(); }
                map.once('idle', done);
            });
        }
        function findPatchLayer() {
            return (map.getStyle().layers || []).find(layer => layer.type === 'fill' &&
                (layer.id === FOREST_PATCH_LAYER_ID || /forest|patch/i.test(layer.id)));
        }
        function ensureLayers() {
            [['development-footprint', empty()], ['development-forest', empty()], ['development-loss', empty()]].forEach(([id, data]) => {
                if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data });
            });
            const layers = [
                { id: 'development-forest-fill', type: 'fill', source: 'development-forest', paint: { 'fill-color': '#2a8234', 'fill-opacity': 0.65 } },
                { id: 'development-forest-outline', type: 'line', source: 'development-forest', paint: { 'line-color': '#0b4b19', 'line-width': 1.5 } },
                { id: 'development-loss-fill', type: 'fill', source: 'development-loss', paint: { 'fill-color': '#d44532', 'fill-opacity': 0.75 } },
                { id: 'development-footprint-fill', type: 'fill', source: 'development-footprint', paint: { 'fill-color': '#e5a132', 'fill-opacity': 0.14 } },
                { id: 'development-footprint-outline', type: 'line', source: 'development-footprint', paint: { 'line-color': '#b56804', 'line-width': 2, 'line-dasharray': [3, 2] } }
            ];
            layers.forEach(layer => { if (!map.getLayer(layer.id)) map.addLayer(layer); });
        }
        function applyMapView() {
            if (!active) return;
            ensureLayers();
            if (result) {
                map.getSource('development-footprint').setData(result.footprint);
                map.getSource('development-forest').setData(view === 'before' ? result.baselineForest : result.remainingForest);
                map.getSource('development-loss').setData(view === 'scenario' ? result.lostForest : empty());
            }
            if (patchLayer && map.getLayer(patchLayer)) map.setFilter(patchLayer, api.decoratePatchFilter(null));
        }
        function clearResult() {
            job++; busy = false; result = null; get('development-results').hidden = true;
            ['development-footprint', 'development-forest', 'development-loss'].forEach(id => { if (map.getSource(id)) map.getSource(id).setData(empty()); });
            if (active && patchLayer && map.getLayer(patchLayer)) map.setFilter(patchLayer, null);
        }
        function handleFeature(event) {
            if (!active || !event.features.length) return;
            clearResult(); feature = event.features[0]; drawing = false;
            try {
                const footprint = DevelopmentGeometry.createFootprint(feature, get('development-width').value);
                ensureLayers(); map.getSource('development-footprint').setData(footprint);
                status('Footprint ready. Calculate changes to compare the forest before and after development.');
            } catch (error) { status(error.message, true); }
            updateActions();
        }
        async function open() {
            if (active) { close(); return; }
            const baselineLayer = findPatchLayer();
            if (!baselineLayer || !map.isStyleLoaded()) { button.textContent = 'Map loading…'; setTimeout(() => { button.textContent = 'Development'; }, 1500); return; }
            active = true; panel.hidden = false; button.classList.add('active'); button.setAttribute('aria-expanded', 'true');
            patchLayer = baselineLayer.id; filterSnapshot = map.getFilter(patchLayer) || null; map.setFilter(patchLayer, null);
            ['filter-section', 'info-panel-section', 'stats-section', 'area-filter-controls'].forEach(id => {
                const el = get(id); controlsSnapshot.push([el, el.style.display]); el.style.display = 'none';
            });
            get('basemap-toggle').disabled = true;
            // Existing illustrative corridors must not be confused with scenario outputs.
            const corridorButton = get('corridor-toggle-fab');
            if (corridorButton && corridorButton.classList.contains('active')) { corridorButton.click(); corridorSnapshot.push('restore'); }
            ['corridor-controls', 'corridor-tier-filter'].forEach(id => { const el = get(id); controlsSnapshot.push([el, el.style.display]); el.style.display = 'none'; });
            const sidebar = get('sidebar'); if (sidebar.classList.contains('collapsed')) get('toggle-sidebar-btn').click();
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panel.querySelectorAll('[data-shape]').forEach(el => { el.disabled = true; });
            status(ready ? 'Choose a drawing shape.' : 'Loading drawing tools and complete forest boundaries…');
            try {
                if (!loading) loading = dependencies().then(startWorker).catch(error => { loading = null; throw error; });
                await loading;
                if (!active) return;
                // Draw 1.4.3 waits for a map load event if added while loaded()
                // is false. After the first load that event will not recur.
                // Wait for idle so its sources and event handlers connect now.
                if (!draw) await waitForMapIdle();
                if (!active) return;
                createDraw(); ensureLayers(); panel.querySelectorAll('[data-shape]').forEach(el => { el.disabled = false; });
            } catch (error) { status(error.message, true); }
        }
        function close() {
            if (!active) return;
            if (draw) { draw.changeMode('simple_select'); draw.deleteAll(); }
            feature = null; clearResult(); drawing = false; active = false; panel.hidden = true;
            button.classList.remove('active'); button.setAttribute('aria-expanded', 'false');
            if (patchLayer && map.getLayer(patchLayer)) map.setFilter(patchLayer, filterSnapshot);
            controlsSnapshot.forEach(([el, display]) => { el.style.display = display; }); controlsSnapshot = [];
            get('basemap-toggle').disabled = false;
            if (corridorSnapshot.length) get('corridor-toggle-fab').click(); corridorSnapshot = [];
            updateActions();
        }
        function startDrawing(shape) {
            if (!draw || busy) return;
            draw.changeMode('simple_select'); draw.deleteAll(); clearResult(); feature = null;
            panel.querySelectorAll('[data-shape]').forEach(el => el.classList.toggle('selected', el.dataset.shape === shape));
            get('development-width-row').hidden = shape !== 'line';
            get('development-finish').hidden = shape === 'rectangle';
            drawing = true; draw.changeMode(shape === 'rectangle' ? 'draw_rectangle' : shape === 'line' ? 'draw_line_string' : 'draw_polygon');
            status(shape === 'rectangle' ? 'Click two opposite corners to finish the rectangle.' : 'Click to place vertices. Press Enter or use Finish drawing when complete.');
            updateActions();
        }
        function renderResults() {
            const container = get('development-results'); container.hidden = false;
            const row = (label, value, cls = '') => '<div class="development-metric ' + cls + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
            let html = '<div class="development-view" role="group" aria-label="Compare landscape views"><button data-view="before">Existing forest</button>' +
                '<button data-view="scenario" class="selected">Development scenario</button></div>' +
                '<p class="development-legend"><span class="forest-key"></span>Forest <span class="loss-key"></span>Removed <span class="footprint-key"></span>Footprint</p>' +
                row('Development footprint', area(result.footprintHa) + ' ha') +
                row('Forest removed', area(result.lostHa) + ' ha', 'development-loss') +
                row('Forest remaining in affected patches', area(result.affectedRemainingHa) + ' ha') +
                row('Patches affected', result.affected.length.toLocaleString()) +
                row('Patches with new separation', result.splitCount.toLocaleString()) +
                row('Patches completely removed', result.removedCount.toLocaleString()) +
                '<p class="development-detail">Additional fragments: ' + result.newFragments + '. Existing disconnected parts are accounted for; touching corners count as connected.</p>' +
                '<details><summary>Landscape totals</summary>' + row('Existing mapped forest', area(result.baselineHa) + ' ha') +
                row('Forest after this scenario', area(result.remainingLandscapeHa) + ' ha') + '</details>';
            if (!result.affected.length) html += '<p class="development-detail">' + (result.outsideDatasetExtent ? 'This footprint is outside the extent of the supplied forest data.' : 'No mapped forest overlaps this footprint. This result does not assess other habitats or development impacts.') + '</p>';
            if (result.affected.length) {
                html += '<details><summary>Affected patches</summary><div class="development-table"><table><thead><tr><th>Patch</th><th>Loss (ha)</th><th>Fragments<br>before → after</th></tr></thead><tbody>';
                result.affected.slice().sort((a, b) => b.lostHa - a.lostHa).forEach(p => {
                    html += '<tr><td>' + escape(p.id) + '</td><td>' + area(p.lostHa) + '</td><td>' + p.partsBefore + ' → ' + p.partsAfter + '</td></tr>';
                });
                html += '</tbody></table></div></details>';
            }
            html += '<button id="development-export">Download scenario</button>';
            container.innerHTML = html;
            container.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => {
                view = el.dataset.view; container.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('selected', b.dataset.view === view)); applyMapView();
            }));
            get('development-export').addEventListener('click', () => {
                const output = { landscape: FOREST_PATCH_LAYER_ID, assumption: 'Complete mapped forest clearance inside the footprint',
                    areaMethod: 'Turf 6.5.0 spherical geodesic area from complete supplied polygons',
                    connectivityRecalculated: false, created: new Date().toISOString(), ...result };
                const url = URL.createObjectURL(new Blob([JSON.stringify(output)], { type: 'application/json' }));
                const link = document.createElement('a'); link.href = url; link.download = 'development-scenario.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
        }
        button.addEventListener('click', open);
        panel.querySelectorAll('[data-shape]').forEach(el => el.addEventListener('click', () => startDrawing(el.dataset.shape)));
        get('development-width').addEventListener('change', () => { if (feature) handleFeature({ features: [feature] }); });
        get('development-analyse').addEventListener('click', () => {
            if (!ready || !feature || busy || drawing) return;
            clearResult(); busy = true; updateActions(); status('Calculating forest changes…');
            worker.postMessage({ type: 'analyse', job, feature, widthM: get('development-width').value });
        });
        get('development-finish').addEventListener('click', () => { if (draw) draw.changeMode('simple_select'); });
        get('development-cancel').addEventListener('click', () => {
            if (draw) { draw.changeMode('simple_select'); draw.deleteAll(); }
            feature = null; drawing = false; clearResult(); updateActions(); status('Drawing cancelled. Choose a shape to start again.');
        });
        get('development-reset').addEventListener('click', () => {
            if (draw) { draw.changeMode('simple_select'); draw.deleteAll(); }
            feature = null; drawing = false; clearResult(); updateActions(); status('Choose a shape to draw another footprint.');
        });
        get('development-close').addEventListener('click', close);
        map.on('style.load', () => { if (active) { const layer = findPatchLayer(); patchLayer = layer && layer.id; applyMapView(); } });
    });
})();

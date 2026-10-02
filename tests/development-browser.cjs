/* Real Mapbox GL/Draw and Web Worker integration, with an offline fixture style.
 * Install Playwright to run. SCENARIO_BROWSER_EXECUTABLE and SCENARIO_MAPBOX_JS
 * optionally select a local Chromium binary and a cached Mapbox GL 3.1.2 script.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { chromium } = require('playwright');
const turf = require('../vendor/turf-6.5.0.min.js');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
    const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(filename, (error, data) => {
        if (error) { res.writeHead(404); res.end(); return; }
        const type = filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.gz') ? 'application/gzip' : 'application/json';
        res.writeHead(200, { 'Content-Type': type }); res.end(data);
    });
});
async function run() {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ headless: true,
        ...(process.env.SCENARIO_BROWSER_EXECUTABLE ? { executablePath: process.env.SCENARIO_BROWSER_EXECUTABLE } : {}),
        args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    try {
        for (const landscape of ['kuantan', 'klang-valley']) {
            const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data', landscape + '-patches.geojson.gz'))));
            const patch = data.features.find(f => turf.area(f) > 20000 && turf.area(f) < 100000 && f.geometry.coordinates.length === 1);
            const bbox = turf.bbox(patch), cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
            const layer = landscape === 'kuantan' ? 'Kuantan Forest Patches' : 'Klang Valley Forest Patches';
            const style = { version: 8, sources: { forest: { type: 'geojson', data: turf.featureCollection([patch]) } }, layers: [
                { id: 'background', type: 'background', paint: { 'background-color': '#eef1e9' } },
                { id: layer, type: 'fill', source: 'forest', paint: { 'fill-color': '#5aaf64' } }
            ] };
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.stack));
            await page.route('**/*', async route => {
                const url = route.request().url();
                if (url.startsWith(origin)) return route.continue();
                if (url.includes('/mapbox-gl.js')) {
                    if (process.env.SCENARIO_MAPBOX_JS) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.SCENARIO_MAPBOX_JS, 'utf8') + '\nmapboxgl.Map.prototype.setTerrain = function () { return this; };' });
                    return route.continue();
                }
                if (url.includes('/mapbox-gl.css') && process.env.SCENARIO_MAPBOX_CSS) return route.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.SCENARIO_MAPBOX_CSS)});
                if (url.includes('/styles/v1/')) return route.fulfill({ json: style });
                if (url.includes('mapbox-terrain-dem-v1')) return route.fulfill({ json: { tilejson:'2.2.0', tiles:[], minzoom:0, maxzoom:0 } });
                return route.fulfill({ status: 200, body: '' });
            });
            await page.addInitScript(() => localStorage.setItem('hasVisited', '1'));
            await page.goto(origin + '/' + landscape + '-map.html', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window._mapInstance && window._mapInstance.isStyleLoaded(), { timeout: 20000 });
            await page.evaluate(([x, y]) => { window._mapInstance.setTerrain(null); window._mapInstance.jumpTo({ center:[x,y], zoom:16 }); }, [cx, cy]);
            await page.waitForTimeout(100);
            const previousFilter = await page.evaluate(layerId => window._mapInstance.getFilter(layerId) || null, layer);
            await page.locator('#development-toggle').click();
            await page.waitForFunction(() => /forest patches loaded/.test(document.getElementById('development-status').textContent), { timeout: 20000 });
            async function clickCoordinate(coordinate) {
                const point = await page.evaluate(c => {
                    const p = window._mapInstance.project(c), box = window._mapInstance.getContainer().getBoundingClientRect();
                    return { x:p.x + box.left, y:p.y + box.top };
                }, coordinate);
                await page.mouse.click(point.x, point.y);
            }
            async function calculate() {
                assert.equal(await page.locator('#development-analyse').isEnabled(), true);
                await page.locator('#development-analyse').click();
                await page.waitForFunction(() => /Scenario calculated/.test(document.getElementById('development-status').textContent), null, { timeout: 10000 });
                assert.equal(await page.locator('#development-results').isVisible(), true);
            }
            await page.locator('[data-shape="rectangle"]').click();
            await clickCoordinate([cx - 0.00004, bbox[1] - 0.0001]);
            await clickCoordinate([cx + 0.00004, bbox[3] + 0.0001]);
            assert.equal(await page.locator('#development-analyse').isEnabled(), true);
            await calculate();
            assert.ok(await page.evaluate(() => window._mapInstance.getSource('development-loss')._data.features.length > 0));
            await page.locator('[data-view="before"]').click();
            assert.equal(await page.evaluate(() => window._mapInstance.getSource('development-loss')._data.features.length), 0);
            assert.ok(await page.evaluate(() => window._mapInstance.getSource('development-forest')._data.features.length > 0));
            await page.locator('[data-view="scenario"]').click();
            const download = page.waitForEvent('download'); await page.locator('#development-export').click();
            assert.equal((await download).suggestedFilename(), 'development-scenario.json');
            await page.waitForFunction(() => /Baseline high-flow cells touched:/.test(document.getElementById('development-connectivity-summary').textContent), null, { timeout:20000 });
            // Select known native-grid cells near each landscape centre, using
            // both complete resistance models rather than the fixture map tiles.
            const connectionMeta = JSON.parse(fs.readFileSync(path.join(root, 'data/connectivity', landscape + '.json')));
            const connectionEngine = require('../connectivity-engine.js');
            const costs = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(root, 'data/connectivity', connectionMeta.resistance.file))));
            const nativeGrid = connectionEngine.prepare(connectionMeta.resistance, costs), cm = connectionMeta.resistance;
            const nativeRow = Math.floor(cm.height/2), nativeCol = Math.floor(cm.width/2);
            const startCell = nativeRow * cm.width + nativeCol - 40, endCell = nativeRow * cm.width + nativeCol + 40;
            const startPoint = connectionEngine.coordinateAt(nativeGrid, startCell), endPoint = connectionEngine.coordinateAt(nativeGrid, endCell);
            const baselinePath = connectionEngine.findPath(nativeGrid, startCell, endCell);
            const middle = baselinePath.indices[Math.floor(baselinePath.indices.length/2)], mx = middle % cm.width, my = Math.floor(middle/cm.width);
            const developmentCorners = [[mx-10,my-20],[mx+11,my+21]].map(([x,y]) => nativeGrid.projection.inverse([cm.originX+x*cm.cellWidth,cm.originY-y*cm.cellHeight]));
            await page.locator('[data-open-connectivity]').click();
            await page.locator('#connection-start').waitFor({state:'visible'});
            await page.waitForFunction(() => !document.getElementById('connection-start').disabled);
            await page.evaluate(([a,b]) => window._mapInstance.jumpTo({center:[(a[0]+b[0])/2,(a[1]+b[1])/2],zoom:14.5}), [startPoint,endPoint]);
            await page.locator('#connection-start').click(); await clickCoordinate(startPoint);
            await page.locator('#connection-end').click(); await clickCoordinate(endPoint);
            try {
                await page.waitForFunction(() => /Path assessment calculated/.test(document.getElementById('connection-status').textContent), null, {timeout:20000});
            } catch (error) {
                console.error('Connection state',await page.evaluate(()=>({status:document.getElementById('connection-status').textContent,locations:document.getElementById('connection-locations').textContent,assessment:window._connectivityExplorer.assessment,development:document.getElementById('development-status').textContent})),errors);
                throw error;
            }
            const assessedCost = await page.evaluate(() => window._connectivityExplorer.assessment.baseline.cost);
            assert.ok(Math.abs(assessedCost-baselinePath.cost)<1e-8);
            await page.locator('#connection-flow').check();
            assert.equal(await page.evaluate(() => window._mapInstance.getLayoutProperty('connection-high-flow-raster','visibility')), 'visible');
            const routeDownload = page.waitForEvent('download'); await page.locator('#connection-export').click();
            assert.equal((await routeDownload).suggestedFilename(), 'connectivity-assessment.json');
            await page.evaluate(([a,b]) => window._mapInstance.jumpTo({center:[(a[0]+b[0])/2,(a[1]+b[1])/2],zoom:14.5}), developmentCorners);
            await page.locator('[data-shape="rectangle"]').click();
            await clickCoordinate(developmentCorners[0]); await clickCoordinate(developmentCorners[1]); await calculate();
            try {
                await page.waitForFunction(() => {
                    const a=window._connectivityExplorer.assessment;
                    return a && a.scenario && a.scenario.status==='found' && a.scenario.cost>=a.baseline.cost &&
                        JSON.stringify(a.scenario.geometry)!==JSON.stringify(a.baseline.geometry);
                }, null, {timeout:20000});
            } catch(error) {
                console.error('Reroute state',await page.evaluate(()=>({status:document.getElementById('connection-status').textContent,
                    locations:document.getElementById('connection-locations').textContent,assessment:window._connectivityExplorer.assessment,
                    footprint:window._developmentScenario.footprint})),errors); throw error;
            }
            assert.ok(await page.evaluate(() => window._mapInstance.getSource('connection-scenario')._data.features.length>0));
            await page.locator('[data-view="before"]').click();
            assert.equal(await page.evaluate(() => window._mapInstance.getSource('connection-scenario')._data.features.length), 0);
            await page.locator('[data-view="scenario"]').click();
            await page.locator('#connection-fit').click();
            await page.waitForFunction(() => !window._mapInstance.isMoving());
            if (process.env.SCENARIO_SCREENSHOT_DIR) await page.screenshot({ path:path.join(process.env.SCENARIO_SCREENSHOT_DIR, landscape + '-connectivity.png') });
            await page.locator('#connection-close').click();
            assert.equal(await page.evaluate(() => window._mapInstance.getSource('connection-existing')._data.features.length), 0);
            await page.locator('#development-reset').click();
            await page.waitForFunction(() => !window._connectivityExplorer.assessment?.hasDevelopment, null, {timeout:20000});
            await page.evaluate(([x,y]) => window._mapInstance.jumpTo({center:[x,y],zoom:16}), [cx,cy]);
            if (process.env.SCENARIO_SCREENSHOT_DIR) await page.screenshot({ path:path.join(process.env.SCENARIO_SCREENSHOT_DIR, landscape + '-scenario.png') });
            await page.locator('[data-shape="line"]').click();
            await clickCoordinate([cx, bbox[1] - 0.0001]);
            await clickCoordinate([cx, bbox[3] + 0.0001]);
            if (await page.locator('#development-finish').isVisible()) await page.locator('#development-finish').click();
            await calculate();
            await page.locator('#development-width').fill('60'); await page.locator('#development-width').press('Tab');
            assert.equal(await page.locator('#development-results').isVisible(), false);
            await calculate();
            await page.locator('[data-shape="polygon"]').click();
            for (const c of [[cx-0.0002,bbox[1]-0.0001],[cx+0.0002,bbox[1]-0.0001],[cx+0.0002,bbox[3]+0.0001],[cx-0.0002,bbox[3]+0.0001]]) await clickCoordinate(c);
            if (await page.locator('#development-finish').isVisible()) await page.locator('#development-finish').click(); await calculate();
            await page.locator('#development-reset').click();
            assert.equal(await page.locator('#development-results').isVisible(), false);
            assert.equal(await page.locator('#development-analyse').isEnabled(), false);
            await page.locator('#development-close').click();
            assert.equal(await page.locator('#development-panel').isVisible(), false);
            assert.equal(await page.locator('#info-panel-section').isVisible(), true);
            assert.equal(await page.locator('#basemap-toggle').isEnabled(), true);
            assert.deepEqual(await page.evaluate(layerId => window._mapInstance.getFilter(layerId) || null, layer), previousFilter);
            await page.locator('#development-toggle').click(); await page.locator('[data-shape="rectangle"]').click();
            await page.locator('#development-cancel').click(); assert.equal(await page.locator('#development-analyse').isEnabled(), false);
            await page.locator('#development-close').click();
            assert.deepEqual(errors, []);
            console.log(landscape + ': drawing regression, native-grid path, development rerouting, baseline flow exposure, flow overlay, exports, before/after, reset, and controls passed');
            await page.close();
        }
    } finally { await browser.close(); server.close(); }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

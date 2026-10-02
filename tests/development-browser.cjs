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
    if (!filename.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(filename, (error, data) => {
        if (error) {
            res.writeHead(404);
            res.end();
            return;
        }
        const type = filename.endsWith('.js')
            ? 'application/javascript'
            : filename.endsWith('.css')
              ? 'text/css'
              : filename.endsWith('.html')
                ? 'text/html'
                : filename.endsWith('.gz')
                  ? 'application/gzip'
                  : 'application/json';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
    });
});
async function run() {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.SCENARIO_BROWSER_EXECUTABLE
            ? { executablePath: process.env.SCENARIO_BROWSER_EXECUTABLE }
            : {}),
        args: [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
        ],
    });
    try {
        const home = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await home.route('**/*', (route) => {
            const url = route.request().url();
            if (process.env.SCENARIO_PIXEL_FONT && url.includes('fonts.googleapis.com'))
                return route.fulfill({
                    contentType: 'text/css',
                    body: '@font-face {font-family:"Press Start 2P";src:url(https://test-font.invalid/pixel.ttf)}',
                });
            if (process.env.SCENARIO_PIXEL_FONT && url.includes('test-font.invalid'))
                return route.fulfill({
                    contentType: 'font/ttf',
                    body: fs.readFileSync(process.env.SCENARIO_PIXEL_FONT),
                });
            return url.startsWith(origin)
                ? route.continue()
                : route.fulfill({ status: 200, body: '' });
        });
        await home.goto(origin + '/index.html');
        await home.evaluate(() => document.fonts.ready);
        assert.equal(await home.locator('[data-task]').count(), 0);
        assert.equal(await home.locator('.development-link').count(), 0);
        assert.equal(await home.locator('#home-about-content').isVisible(), false);
        await home.locator('#home-about-toggle').click();
        assert.equal(await home.locator('#home-about-content').isVisible(), true);
        assert.equal(
            await home.locator('#home-about-toggle').getAttribute('aria-expanded'),
            'true'
        );
        await home.locator('#home-about-toggle').click();
        assert.equal(await home.locator('#home-about-content').isVisible(), false);
        assert.equal(
            await home.locator('.map-link').first().getAttribute('href'),
            'kuantan-map.html'
        );
        assert.equal(
            await home.locator('.map-link').nth(1).getAttribute('href'),
            'klang-valley-map.html'
        );
        const aboutText = (await home.locator('#home-about-content').textContent()).replace(
            /\s+/g,
            ' '
        );
        assert.doesNotMatch(aboutText, /Kuantan|Klang Valley/);
        assert.match(aboutText, /More cities will be added in future updates/);
        for (const viewport of [
            { width: 1366, height: 768 },
            { width: 1280, height: 720 },
            { width: 1024, height: 768 },
        ]) {
            await home.setViewportSize(viewport);
            assert.equal(
                await home.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
                true,
                'Desktop homepage should fit vertically'
            );
            const credits = await home.locator('.site-footer').boundingBox();
            assert.ok(
                credits.y + credits.height <= viewport.height,
                'Credits should be visible without scrolling'
            );
        }
        await home.setViewportSize({ width: 1366, height: 768 });
        if (process.env.SCENARIO_SCREENSHOT_DIR)
            await home.screenshot({
                path: path.join(process.env.SCENARIO_SCREENSHOT_DIR, 'homepage-desktop.png'),
                fullPage: true,
            });
        await home.setViewportSize({ width: 390, height: 844 });
        await home.locator('#mobile-popup button').click();
        await home.setViewportSize({ width: 391, height: 844 });
        assert.equal(await home.locator('#mobile-popup').isVisible(), false);
        assert.equal(
            await home.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true
        );
        if (process.env.SCENARIO_SCREENSHOT_DIR)
            await home.screenshot({
                path: path.join(process.env.SCENARIO_SCREENSHOT_DIR, 'homepage-mobile.png'),
                fullPage: true,
            });
        await home.close();
        if (process.env.SCENARIO_HOME_ONLY) return;
        for (const landscape of ['kuantan', 'klang-valley']) {
            const data = JSON.parse(
                zlib.gunzipSync(
                    fs.readFileSync(path.join(root, 'data', landscape + '-patches.geojson.gz'))
                )
            );
            const patch = data.features.find(
                (f) =>
                    turf.area(f) > 20000 &&
                    turf.area(f) < 100000 &&
                    f.geometry.coordinates.length === 1
            );
            const bbox = turf.bbox(patch),
                cx = (bbox[0] + bbox[2]) / 2,
                cy = (bbox[1] + bbox[3]) / 2;
            const layer =
                landscape === 'kuantan' ? 'Kuantan Forest Patches' : 'Klang Valley Forest Patches';
            const style = {
                version: 8,
                sources: { forest: { type: 'geojson', data: turf.featureCollection([patch]) } },
                layers: [
                    {
                        id: 'background',
                        type: 'background',
                        paint: { 'background-color': '#eef1e9' },
                    },
                    {
                        id: layer,
                        type: 'fill',
                        source: 'forest',
                        paint: { 'fill-color': '#5aaf64' },
                    },
                ],
            };
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.stack));
            await page.route('**/*', async (route) => {
                const url = route.request().url();
                if (url.startsWith(origin)) return route.continue();
                if (url.includes('/mapbox-gl.js')) {
                    if (process.env.SCENARIO_MAPBOX_JS)
                        return route.fulfill({
                            contentType: 'application/javascript',
                            body:
                                fs.readFileSync(process.env.SCENARIO_MAPBOX_JS, 'utf8') +
                                '\nmapboxgl.Map.prototype.setTerrain = function () { return this; };',
                        });
                    return route.continue();
                }
                if (url.includes('/mapbox-gl.css') && process.env.SCENARIO_MAPBOX_CSS)
                    return route.fulfill({
                        contentType: 'text/css',
                        body: fs.readFileSync(process.env.SCENARIO_MAPBOX_CSS),
                    });
                if (url.includes('/styles/v1/')) return route.fulfill({ json: style });
                if (url.includes('mapbox-terrain-dem-v1'))
                    return route.fulfill({
                        json: { tilejson: '2.2.0', tiles: [], minzoom: 0, maxzoom: 0 },
                    });
                return route.fulfill({ status: 200, body: '' });
            });
            await page.addInitScript(() => localStorage.setItem('hasVisited', '1'));
            await page.goto(origin + '/' + landscape + '-map.html', {
                waitUntil: 'domcontentloaded',
            });
            await page.waitForFunction(
                () => window._mapInstance && window._mapInstance.isStyleLoaded(),
                { timeout: 20000 }
            );
            await page.evaluate(
                ([x, y]) => {
                    window._mapInstance.setTerrain(null);
                    window._mapInstance.jumpTo({ center: [x, y], zoom: 16 });
                },
                [cx, cy]
            );
            await page.waitForTimeout(100);
            await page.locator('#loading-indicator').waitFor({ state: 'hidden' });
            const helpText = (await page.locator('#howto-modal').textContent()).replace(
                /\s+/g,
                ' '
            );
            assert.doesNotMatch(
                helpText,
                /Connectivity potential rating|connectivity rating|High \(cyan\)|Barrier \(dark purple\)/
            );
            assert.match(helpText, /future corridor opportunity before one is established/);
            // Exploration tools operate on the actual map and WebGL canvas.
            assert.equal(await page.locator('#patch-id-input').count(), 0);
            await page.locator('#measurement-tools > summary').click();
            await page.locator('#measure-distance').click();
            await page.waitForFunction(() => window._mapTools.measuring);
            const measurePoints = [
                [cx, cy],
                [cx + 0.001, cy],
                [cx + 0.001, cy + 0.001],
            ];
            await page.evaluate(
                (coords) =>
                    coords.forEach((c) =>
                        window._mapInstance.fire('click', {
                            lngLat: mapboxgl.LngLat.convert(c),
                            point: window._mapInstance.project(c),
                        })
                    ),
                measurePoints
            );
            await page.locator('#measure-finish').click();
            const expectedLength =
                turf.length(turf.lineString(measurePoints), { units: 'kilometers' }) * 1000;
            assert.ok(
                Math.abs(
                    (await page.evaluate(() => window._mapTools.measurement.value)) - expectedLength
                ) < 0.01
            );
            assert.equal(await page.evaluate(() => window._mapTools.measuring), false);
            await page.locator('#measure-area').click();
            await page.waitForFunction(() => window._mapTools.measuring);
            await page.evaluate(
                (coords) =>
                    coords.forEach((c) =>
                        window._mapInstance.fire('click', {
                            lngLat: mapboxgl.LngLat.convert(c),
                            point: window._mapInstance.project(c),
                        })
                    ),
                measurePoints
            );
            await page.locator('#measure-finish').click();
            const expectedArea =
                turf.area(turf.polygon([measurePoints.concat([measurePoints[0]])])) / 10000;
            assert.ok(
                Math.abs(
                    (await page.evaluate(() => window._mapTools.measurement.value)) - expectedArea
                ) < 0.001
            );
            await page.locator('#measure-clear').click();
            assert.equal(await page.evaluate(() => window._mapTools.measurement), null);
            // Too few points and a crossing boundary cannot produce an area result.
            await page.locator('#measure-area').click();
            await page.waitForFunction(() => window._mapTools.measuring);
            await page.locator('#measure-finish').click();
            assert.match(await page.locator('#measurement-status').textContent(), /at least 3/);
            await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => window._mapTools.measuring), false);
            const cross = [
                [cx, cy],
                [cx + 0.001, cy + 0.001],
                [cx + 0.001, cy],
                [cx, cy + 0.001],
            ];
            await page.locator('#measure-area').click();
            await page.waitForFunction(() => window._mapTools.measuring);
            await page.evaluate(
                (coords) =>
                    coords.forEach((c) =>
                        window._mapInstance.fire('click', {
                            lngLat: mapboxgl.LngLat.convert(c),
                            point: window._mapInstance.project(c),
                        })
                    ),
                cross
            );
            await page.locator('#measure-finish').click();
            assert.match(await page.locator('#measurement-status').textContent(), /crosses itself/);
            await page.locator('#measure-clear').click();
            const selectPatch = (p) =>
                page.evaluate((props) => {
                    window._lastPatchLngLat = window._mapInstance.getCenter();
                    document.dispatchEvent(
                        new CustomEvent('forestconnect:patch-selected', { detail: props })
                    );
                }, p);
            const props = {
                id: 1,
                Tier: patch.properties.Tier,
                area: 100,
                core: 60,
                enn: 250,
                mean_flow: 125,
            };
            for (let i = 1; i <= 3; i++) {
                // Simulate the existing patch-details selection event, including replacement of its content.
                await page.evaluate(
                    () =>
                        (document.getElementById('patch-info-content').innerHTML = 'Selected patch')
                );
                await selectPatch({ ...props, id: i, area: 100 + i });
                await page.locator('#patch-compare-add').click();
            }
            assert.equal(await page.evaluate(() => window._mapTools.comparisonCount), 3);
            assert.equal(await page.locator('.comparison-marker').count(), 3);
            assert.match(await page.locator('#patch-comparison-table').textContent(), /101/);
            await page.evaluate(
                () => (document.getElementById('patch-info-content').innerHTML = 'Selected patch')
            );
            await selectPatch({ ...props, id: 4 });
            await page.locator('#patch-compare-add').click();
            assert.match(await page.locator('#comparison-status').textContent(), /up to three/);
            await page.locator('[data-remove-patch="2"]').click();
            assert.equal(await page.evaluate(() => window._mapTools.comparisonCount), 2);
            await page.locator('#comparison-clear').click();
            assert.equal(await page.locator('.comparison-marker').count(), 0);
            await page.locator('.tier-toggle').first().uncheck();
            await page.locator('#min-area-input').fill('50');
            await page.locator('#max-area-input').fill('150');
            await page.locator('#apply-area-filter-btn').click();
            assert.match(await page.locator('#active-filters-text').textContent(), /50 to 150 ha/);
            await page.locator('#max-area-input').fill('10');
            await page.locator('#apply-area-filter-btn').click();
            assert.deepEqual(
                await page.evaluate(() => [
                    window._forestExplorer.filters.min,
                    window._forestExplorer.filters.max,
                ]),
                [50, 150]
            );
            await page.locator('#filters-reset-all').click();
            assert.equal(await page.locator('.tier-toggle:checked').count(), 6);
            assert.deepEqual(
                await page.evaluate(() => [
                    window._forestExplorer.filters.min,
                    window._forestExplorer.filters.max,
                ]),
                [null, null]
            );
            for (const checkbox of await page.locator('.tier-toggle').all())
                await checkbox.uncheck();
            assert.match(
                await page.locator('#filter-empty-status').textContent(),
                /No tiers selected/
            );
            await page.locator('#filters-reset-all').click();
            await page.evaluate(() =>
                window._mapInstance.jumpTo({ center: window._mapInstance.getCenter(), zoom: 16 })
            );
            await page.waitForFunction(
                () => window._mapInstance.isStyleLoaded() && !window._mapInstance.isMoving()
            );
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#map-export').click();
            const mapDownload = await downloadPromise;
            assert.equal(mapDownload.suggestedFilename(), landscape + '-forest-map.png');
            const png = fs.readFileSync(await mapDownload.path());
            assert.equal(png.subarray(1, 4).toString(), 'PNG');
            assert.ok(
                png.length > 10000,
                'PNG should include a rendered map, not only an empty canvas'
            );
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await mapDownload.saveAs(
                    path.join(process.env.SCENARIO_SCREENSHOT_DIR, landscape + '-export.png')
                );
            await page.locator('#measurement-tools > summary').click();
            await page.evaluate(
                () =>
                    (document.getElementById('patch-info-content').textContent =
                        'Select a patch on the map.')
            );
            if (process.env.SCENARIO_TOOLS_ONLY) {
                assert.deepEqual(errors, []);
                await page.close();
                continue;
            }
            const previousFilter = await page.evaluate(
                (layerId) => window._mapInstance.getFilter(layerId) || null,
                layer
            );
            const interiorCandidates = [];
            for (let x = 1; x < 30; x++)
                for (let y = 1; y < 30; y++) {
                    const c = [
                        bbox[0] + ((bbox[2] - bbox[0]) * x) / 30,
                        bbox[1] + ((bbox[3] - bbox[1]) * y) / 30,
                    ];
                    if (turf.booleanPointInPolygon(turf.point(c), patch, { ignoreBoundary: true }))
                        interiorCandidates.push(c);
                }
            const patchPoint = interiorCandidates[Math.floor(interiorCandidates.length / 2)];
            assert.ok(turf.booleanPointInPolygon(turf.point(patchPoint), patch));
            await page.evaluate(
                (c) => window._mapInstance.jumpTo({ center: c, zoom: 17 }),
                patchPoint
            );
            await page.waitForTimeout(200);
            assert.ok(
                await page.evaluate(
                    ([c, layer]) =>
                        window._mapInstance.queryRenderedFeatures(window._mapInstance.project(c), {
                            layers: [layer],
                        }).length,
                    [patchPoint, layer]
                ),
                'Click target must be a rendered patch'
            );
            await page.evaluate(() => {
                const map = window._mapInstance,
                    fly = map.flyTo,
                    info = document.getElementById('info-panel-section'),
                    scroll = info.scrollIntoView;
                window._patchInspectionCalls = { fly: 0, scroll: 0 };
                map.flyTo = function (...args) {
                    window._patchInspectionCalls.fly++;
                    return fly.apply(this, args);
                };
                info.scrollIntoView = function (...args) {
                    window._patchInspectionCalls.scroll++;
                    return scroll.apply(this, args);
                };
            });
            await page.locator('#development-workflow-toggle').click();
            assert.equal(await page.locator('#development-toggle').isVisible(), false);
            assert.equal(await page.locator('#measure-distance').isEnabled(), false);
            assert.equal(await page.locator('#active-filter-summary').isVisible(), false);
            assert.equal(await page.locator('#connectivity-toggle').isVisible(), false);
            assert.equal(await page.locator('[data-workflow-step="forest"]').isEnabled(), false);
            assert.equal(await page.locator('[data-workflow-step="routes"]').isEnabled(), false);
            await page.waitForFunction(
                () =>
                    /forest patches loaded/.test(
                        document.getElementById('development-status').textContent
                    ),
                { timeout: 20000 }
            );
            async function clickCoordinate(coordinate) {
                const point = await page.evaluate((c) => {
                    const p = window._mapInstance.project(c),
                        box = window._mapInstance.getContainer().getBoundingClientRect();
                    return { x: p.x + box.left, y: p.y + box.top };
                }, coordinate);
                assert.equal(
                    await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
                    'CANVAS',
                    'Map click must reach the canvas'
                );
                await page.mouse.click(point.x, point.y);
            }
            async function calculate() {
                assert.equal(await page.locator('#development-analyse').isEnabled(), true);
                await page.locator('#development-analyse').click();
                await page.waitForFunction(
                    () =>
                        /Scenario calculated/.test(
                            document.getElementById('development-status').textContent
                        ),
                    null,
                    { timeout: 10000 }
                );
                assert.equal(await page.locator('#development-results').isVisible(), true);
                assert.equal(await page.evaluate(() => window._developmentWorkflow.step), 'forest');
                assert.equal(await page.locator('#development-editor').isVisible(), false);
                assert.equal(await page.locator('#connectivity-panel').isVisible(), false);
                assert.equal(
                    await page
                        .locator('[data-workflow-step="forest"]')
                        .getAttribute('aria-current'),
                    'step'
                );
            }
            // Vertex and completed-shape editing clicks on rendered patches
            // must not inspect them or steal the sidebar. Exercise all shapes.
            await page.evaluate(
                (b) => window._mapInstance.fitBounds(b, { padding: 120, maxZoom: 17, duration: 0 }),
                bbox
            );
            await page.waitForFunction(() => !window._mapInstance.isMoving());
            await page.evaluate(() => {
                window._patchInspectionCalls = { fly: 0, scroll: 0 };
            });
            const otherPoint = interiorCandidates.find(
                (c) =>
                    Math.abs(c[0] - patchPoint[0]) > 0.00005 &&
                    Math.abs(c[1] - patchPoint[1]) > 0.00005
            );
            const thirdPoint = interiorCandidates.reduce((best, c) => {
                const area = (p) =>
                    Math.abs(
                        (otherPoint[0] - patchPoint[0]) * (p[1] - patchPoint[1]) -
                            (otherPoint[1] - patchPoint[1]) * (p[0] - patchPoint[0])
                    );
                return !best || area(c) > area(best) ? c : best;
            }, null);
            const drawPoints = [patchPoint, otherPoint, thirdPoint];
            const camera = await page.evaluate(() => ({
                center: window._mapInstance.getCenter().toArray(),
                zoom: window._mapInstance.getZoom(),
            }));
            for (const shape of ['rectangle', 'line', 'polygon']) {
                await page.locator('[data-shape="' + shape + '"]').click();
                for (const point of drawPoints.slice(0, shape === 'polygon' ? 3 : 2)) {
                    assert.ok(
                        await page.evaluate(
                            ([c, layer]) =>
                                window._mapInstance.queryRenderedFeatures(
                                    window._mapInstance.project(c),
                                    { layers: [layer] }
                                ).length,
                            [point, layer]
                        )
                    );
                    await clickCoordinate(point);
                }
                if (await page.locator('#development-finish').isVisible())
                    await page.locator('#development-finish').click();
                assert.equal(
                    await page.locator('#development-analyse').isEnabled(),
                    true,
                    shape + ' must finish'
                );
                await clickCoordinate(patchPoint);
                await page.waitForTimeout(120);
                assert.deepEqual(
                    await page.evaluate(() => window._patchInspectionCalls),
                    { fly: 0, scroll: 0 },
                    shape + ' must not inspect a patch'
                );
                assert.deepEqual(
                    await page.evaluate(() => ({
                        center: window._mapInstance.getCenter().toArray(),
                        zoom: window._mapInstance.getZoom(),
                    })),
                    camera
                );
                await page.locator('#workflow-reset').click();
            }
            await page.evaluate(
                ([x, y]) => window._mapInstance.jumpTo({ center: [x, y], zoom: 16 }),
                [cx, cy]
            );
            // An outside footprint leaves the real patch layer visible, so
            // marker ownership is checked against the actual inspection handler.
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('[data-shape="rectangle"]').click();
            await clickCoordinate([bbox[2] + 0.00005, cy - 0.00002]);
            await clickCoordinate([bbox[2] + 0.0001, cy + 0.00002]);
            await calculate();
            assert.ok(
                await page.evaluate(
                    ([c, layer]) =>
                        window._mapInstance.queryRenderedFeatures(window._mapInstance.project(c), {
                            layers: [layer],
                        }).length,
                    [patchPoint, layer]
                )
            );
            const savedFootprint = await page.evaluate(() => window._developmentScenario.footprint);
            await page.locator('[data-workflow-step="routes"]').click();
            await page.waitForFunction(() => !document.getElementById('connection-start').disabled);
            await page.locator('#connection-start').click();
            const selectionPoint = await page.evaluate((c) => {
                const p = window._mapInstance.project(c),
                    b = window._mapInstance.getContainer().getBoundingClientRect();
                return { x: p.x + b.left, y: p.y + b.top };
            }, patchPoint);
            await page.mouse.click(selectionPoint.x, selectionPoint.y);
            await page.waitForTimeout(120);
            assert.deepEqual(
                await page.evaluate(() => window._patchInspectionCalls),
                { fly: 0, scroll: 0 },
                'Marker placement on a patch must not inspect, zoom, or scroll'
            );
            assert.equal(
                await page.evaluate(() => window._connectivityExplorer.selectedPoint),
                'B'
            );
            assert.equal(await page.locator('#connection-cancel').isVisible(), true);
            await page.locator('#connection-cancel').click();
            // Keep the tool open without a placement in progress: its map clicks
            // still belong to the tool and cannot open patch inspection.
            await page.mouse.click(selectionPoint.x, selectionPoint.y);
            await page.waitForTimeout(120);
            assert.deepEqual(await page.evaluate(() => window._patchInspectionCalls), {
                fly: 0,
                scroll: 0,
            });
            assert.equal(await page.evaluate(() => window._lastPatchProps), undefined);
            assert.equal(await page.locator('#forest-editing-cue').isVisible(), true);
            await page.locator('#connection-reset').click();
            await page.locator('#connection-close').click();
            assert.equal(await page.evaluate(() => window._developmentWorkflow.step), 'forest');
            assert.deepEqual(
                await page.evaluate(() => window._developmentScenario.footprint),
                savedFootprint
            );
            await page.locator('#workflow-reset').click();
            assert.equal(await page.locator('[data-workflow-step="forest"]').isEnabled(), false);
            assert.equal(await page.locator('[data-workflow-step="routes"]').isEnabled(), false);
            assert.equal(await page.locator('.connection-marker').count(), 0);
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('[data-shape="rectangle"]').click();
            await clickCoordinate([cx - 0.00004, bbox[1] - 0.0001]);
            await clickCoordinate([cx + 0.00004, bbox[3] + 0.0001]);
            assert.equal(await page.locator('#development-analyse').isEnabled(), true);
            await calculate();
            assert.ok(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('development-loss')._data.features.length > 0
                )
            );
            await page.locator('[data-guide-view="before"]').click();
            assert.equal(
                await page.evaluate(
                    () => window._mapInstance.getSource('development-loss')._data.features.length
                ),
                0
            );
            assert.ok(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('development-forest')._data.features.length >
                        0
                )
            );
            await page.locator('[data-guide-view="scenario"]').click();
            const download = page.waitForEvent('download');
            await page.locator('#development-export').click();
            assert.equal((await download).suggestedFilename(), 'development-scenario.json');
            try {
                await page.waitForFunction(
                    () =>
                        /Baseline high-flow cells touched:/.test(
                            document.getElementById('development-connectivity-summary').textContent
                        ),
                    null,
                    { timeout: 20000 }
                );
            } catch (error) {
                console.error(
                    'Initial exposure state',
                    await page.evaluate(() => ({
                        summary: document.getElementById('development-connectivity-summary')
                            .textContent,
                        status: document.getElementById('connection-status').textContent,
                        assessment: window._connectivityExplorer.assessment,
                    })),
                    errors
                );
                throw error;
            }
            // Select known native-grid cells near each landscape centre, using
            // both complete resistance models rather than the fixture map tiles.
            const connectionMeta = JSON.parse(
                fs.readFileSync(path.join(root, 'data/connectivity', landscape + '.json'))
            );
            const connectionEngine = require('../connectivity-engine.js');
            const costs = new Uint8Array(
                zlib.gunzipSync(
                    fs.readFileSync(
                        path.join(root, 'data/connectivity', connectionMeta.resistance.file)
                    )
                )
            );
            const nativeGrid = connectionEngine.prepare(connectionMeta.resistance, costs),
                cm = connectionMeta.resistance;
            const nativeRow = Math.floor(cm.height / 2),
                nativeCol = Math.floor(cm.width / 2);
            const startCell = nativeRow * cm.width + nativeCol - 40,
                endCell = nativeRow * cm.width + nativeCol + 40;
            const startPoint = connectionEngine.coordinateAt(nativeGrid, startCell),
                endPoint = connectionEngine.coordinateAt(nativeGrid, endCell);
            const baselinePath = connectionEngine.findPath(nativeGrid, startCell, endCell);
            const middle = baselinePath.indices[Math.floor(baselinePath.indices.length / 2)],
                mx = middle % cm.width,
                my = Math.floor(middle / cm.width);
            const developmentCorners = [
                [mx - 10, my - 20],
                [mx + 11, my + 21],
            ].map(([x, y]) =>
                nativeGrid.projection.inverse([
                    cm.originX + x * cm.cellWidth,
                    cm.originY - y * cm.cellHeight,
                ])
            );
            await page.locator('[data-open-connectivity]').click();
            await page.locator('#connection-start').waitFor({ state: 'visible' });
            await page.waitForFunction(() => !document.getElementById('connection-start').disabled);
            await page.evaluate(
                ([a, b]) =>
                    window._mapInstance.jumpTo({
                        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                        zoom: 14.5,
                    }),
                [startPoint, endPoint]
            );
            await page.locator('#connection-start').click();
            await clickCoordinate(startPoint);
            await page.locator('#connection-end').click();
            await clickCoordinate(endPoint);
            try {
                await page.waitForFunction(
                    () =>
                        /Comparison ready/.test(
                            document.getElementById('connection-status').textContent
                        ),
                    null,
                    { timeout: 20000 }
                );
            } catch (error) {
                console.error(
                    'Connection state',
                    await page.evaluate(() => ({
                        status: document.getElementById('connection-status').textContent,
                        locations: document.getElementById('connection-locations').textContent,
                        assessment: window._connectivityExplorer.assessment,
                        development: document.getElementById('development-status').textContent,
                    })),
                    errors
                );
                throw error;
            }
            const assessedCost = await page.evaluate(
                () => window._connectivityExplorer.assessment.baseline.cost
            );
            assert.ok(Math.abs(assessedCost - baselinePath.cost) < 1e-8);
            await page.locator('#connection-flow').check();
            assert.equal(
                await page.evaluate(() =>
                    window._mapInstance.getLayoutProperty(
                        'connection-high-flow-raster',
                        'visibility'
                    )
                ),
                'visible'
            );
            const routeDownload = page.waitForEvent('download');
            await page.locator('#connection-export').click();
            assert.equal((await routeDownload).suggestedFilename(), 'connectivity-assessment.json');
            await page.evaluate(
                ([a, b]) =>
                    window._mapInstance.jumpTo({
                        center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                        zoom: 14.5,
                    }),
                developmentCorners
            );
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('[data-shape="rectangle"]').click();
            await clickCoordinate(developmentCorners[0]);
            await clickCoordinate(developmentCorners[1]);
            await calculate();
            try {
                await page.locator('[data-workflow-step="routes"]').click();
                await page.waitForFunction(
                    () => {
                        const a = window._connectivityExplorer.assessment;
                        return (
                            a &&
                            a.scenario &&
                            a.scenario.status === 'found' &&
                            a.scenario.cost >= a.baseline.cost &&
                            JSON.stringify(a.scenario.geometry) !==
                                JSON.stringify(a.baseline.geometry)
                        );
                    },
                    null,
                    { timeout: 20000 }
                );
            } catch (error) {
                console.error(
                    'Reroute state',
                    await page.evaluate(() => ({
                        status: document.getElementById('connection-status').textContent,
                        locations: document.getElementById('connection-locations').textContent,
                        assessment: window._connectivityExplorer.assessment,
                        footprint: window._developmentScenario.footprint,
                    })),
                    errors
                );
                throw error;
            }
            assert.ok(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('connection-scenario')._data.features.length >
                        0
                )
            );
            assert.ok(
                await page.evaluate(() => {
                    const layers = window._mapInstance.getStyle().layers;
                    const lastFill = layers.reduce(
                        (last, l, i) =>
                            l.type === 'fill' && /^(development-|gl-draw)/.test(l.id) ? i : last,
                        -1
                    );
                    return [
                        'connection-existing-halo',
                        'connection-scenario-line',
                        'connection-existing-line',
                    ].every((id) => layers.findIndex((l) => l.id === id) > lastFill);
                }),
                'Routes must stay above filled overlays even when Connections opens first'
            );
            assert.equal(await page.locator('.connection-marker').count(), 2);
            assert.deepEqual(await page.locator('.connection-marker').allTextContents(), [
                'A',
                'B',
            ]);
            assert.deepEqual(
                await page
                    .locator('.connection-route-card:not(.connection-resistance-reference) h4')
                    .allTextContents(),
                ['Before development', 'With development']
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /Potential corridor opportunity obstructed/
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /even if no corridor exists there yet/
            );
            const reference = page.locator('.connection-resistance-reference');
            assert.match(await reference.innerText(), /before-development route to 100/);
            assert.deepEqual(
                await reference.locator('.connection-metric strong').allTextContents(),
                [
                    '100',
                    (
                        100 *
                        (await page.evaluate(
                            () =>
                                window._connectivityExplorer.assessment.scenario.cost /
                                window._connectivityExplorer.assessment.baseline.cost
                        ))
                    ).toLocaleString('en-GB', { maximumFractionDigits: 2 }),
                ]
            );
            assert.match(await reference.innerText(), /20% more resistance/);
            const blockedBaselineCells = await page.evaluate(
                () => window._connectivityExplorer.assessment.baselineCellsBlocked
            );
            const scenarioMask = connectionEngine.footprintMask(
                cm,
                await page.evaluate(() => window._developmentScenario.footprint)
            );
            assert.equal(
                blockedBaselineCells,
                baselinePath.indices.filter((index) => scenarioMask.mask[index]).length
            );
            assert.ok(blockedBaselineCells > 0);
            // Surround A with a ring while keeping its cell clear. This tests a
            // genuinely unreachable scenario rather than a covered endpoint.
            const aCol = startCell % cm.width,
                aRow = Math.floor(startCell / cm.width);
            const ring = (radius) =>
                [
                    [-radius, -radius],
                    [radius, -radius],
                    [radius, radius],
                    [-radius, radius],
                    [-radius, -radius],
                ].map(([dx, dy]) =>
                    nativeGrid.projection.inverse([
                        cm.originX + (aCol + 0.5 + dx) * cm.cellWidth,
                        cm.originY - (aRow + 0.5 + dy) * cm.cellHeight,
                    ])
                );
            const barrierRing = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [ring(7), ring(3).reverse()] },
            };
            const actualFootprint = await page.evaluate(
                () => window._developmentScenario.footprint
            );
            await page.evaluate(
                (footprint) =>
                    document.dispatchEvent(
                        new CustomEvent('forestconnect:development', {
                            detail: { active: true, drawing: false, footprint, view: 'scenario' },
                        })
                    ),
                barrierRing
            );
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.scenario?.status === 'unreachable',
                null,
                { timeout: 20000 }
            );
            assert.deepEqual(
                await page.evaluate(() => window._connectivityExplorer.assessment.blockedEndpoints),
                []
            );
            assert.match(
                await page.locator('.connection-resistance-reference').innerText(),
                /No comparison score: no route was found/
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /Potential connection blocked under this model/
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /could sever an opportunity for a future corridor/
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /No alternative route remains under this model/
            );
            await page.evaluate(
                (footprint) =>
                    document.dispatchEvent(
                        new CustomEvent('forestconnect:development', {
                            detail: { active: true, drawing: false, footprint, view: 'scenario' },
                        })
                    ),
                actualFootprint
            );
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.scenario?.status === 'found',
                null,
                { timeout: 20000 }
            );
            assert.ok(await page.locator('#connection-map-legend').isVisible());
            assert.match(
                await page.locator('#connection-map-legend').innerText(),
                /With development/
            );
            await page.locator('[data-guide-view="before"]').click();
            assert.equal(
                await page.evaluate(
                    () => window._mapInstance.getSource('connection-scenario')._data.features.length
                ),
                0
            );
            assert.doesNotMatch(
                await page.locator('#connection-map-legend').innerText(),
                /With development/
            );
            await page.locator('[data-guide-view="scenario"]').click();
            await page.locator('#connection-fit').click();
            await page.waitForFunction(() => !window._mapInstance.isMoving());
            // Export the scenario view as well as the earlier patch explorer view.
            await page.locator('#measurement-tools > summary').click();
            const scenarioDownloadPromise = page.waitForEvent('download');
            await page.locator('#map-export').click();
            const scenarioDownload = await scenarioDownloadPromise;
            assert.equal(scenarioDownload.suggestedFilename(), landscape + '-forest-map.png');
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await scenarioDownload.saveAs(
                    path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-scenario-export.png'
                    )
                );
            await page.locator('#measurement-tools > summary').click();
            // Check actual computed contrast, including nested result text and
            // expanded method details, against the ancestor background.
            async function verifyContrast() {
                const failures = await page.evaluate(() => {
                    const rgb = (color) => color.match(/[\d.]+/g).map(Number);
                    const luminance = (color) =>
                        rgb(color)
                            .slice(0, 3)
                            .map((n) => {
                                const c = n / 255;
                                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
                            })
                            .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
                    const failures = [];
                    document
                        .querySelectorAll(
                            '#development-panel h3, #development-panel p, #development-panel summary, .development-metric span, .development-metric strong, #connectivity-panel h3, #connectivity-panel h4, #connectivity-panel p, #connectivity-panel li, #connectivity-panel label, #connectivity-panel summary, .connection-metric span, .connection-metric strong, .connection-outcome strong, #connection-map-legend strong, #connection-map-legend p, .connection-legend-row, #forest-editing-cue, #development-workflow h3, #workflow-guidance, .workflow-steps button, #workflow-map-view button, .map-tool-section summary, .map-tool-body p, .map-tool-body button, #patch-compare-add'
                        )
                        .forEach((el) => {
                            if (!el.getClientRects().length) return;
                            let ancestor = el,
                                bg;
                            while (ancestor) {
                                const color = getComputedStyle(ancestor).backgroundColor,
                                    c = rgb(color);
                                if (c.length === 3 || c[3] === 1) {
                                    bg = color;
                                    break;
                                }
                                ancestor = ancestor.parentElement;
                            }
                            if (!bg) bg = 'rgb(255,255,255)';
                            const a = luminance(getComputedStyle(el).color),
                                b = luminance(bg),
                                contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                            if (contrast < 4.5)
                                failures.push({
                                    text: el.textContent.slice(0, 60),
                                    contrast,
                                    color: getComputedStyle(el).color,
                                    bg,
                                });
                        });
                    return failures;
                });
                assert.deepEqual(failures, []);
            }
            await page.evaluate(() =>
                document
                    .querySelectorAll('#connectivity-panel details, #development-results details')
                    .forEach((el) => (el.open = true))
            );
            await verifyContrast();
            await page.locator('#dark-mode-toggle').click();
            await verifyContrast();
            assert.doesNotMatch(
                await page.locator('#connectivity-panel').innerText(),
                /Omniscape has not|not been rerun|Flow has not been recalculated/
            );
            await page.locator('.connection-outcome').scrollIntoViewIfNeeded();
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-comparison-dark.png'
                    ),
                });
            await page.locator('#dark-mode-toggle').click();
            await page.evaluate(() =>
                document
                    .querySelectorAll('#connectivity-panel details, #development-results details')
                    .forEach((el) => (el.open = false))
            );
            await page.locator('.connection-outcome').scrollIntoViewIfNeeded();
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-connectivity.png'
                    ),
                });
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('#connection-fit').click();
            await page.waitForFunction(() => !window._mapInstance.isMoving());
            assert.equal(
                await page.evaluate(() =>
                    document.getElementById('sidebar').classList.contains('collapsed')
                ),
                true
            );
            const legendBounds = await page.locator('#connection-map-legend').boundingBox();
            const collapsedBounds = await page.locator('#sidebar').boundingBox();
            assert.ok(
                legendBounds.x >= collapsedBounds.width &&
                    legendBounds.x + legendBounds.width <= 390
            );
            const barBounds = await page.locator('#map-top-bar').boundingBox();
            assert.ok(barBounds.x >= collapsedBounds.width && barBounds.x + barBounds.width <= 390);
            assert.ok(legendBounds.y >= 0 && legendBounds.y + legendBounds.height <= 844);
            assert.equal(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth
                ),
                true
            );
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-comparison-mobile.png'
                    ),
                });
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.locator('#toggle-sidebar-btn').click();
            // A covered endpoint has no orange route and must not be described
            // as an available before/with-development comparison.
            const coveredPoint = connectionEngine.coordinateAt(nativeGrid, middle);
            await page.evaluate(
                (c) => window._mapInstance.jumpTo({ center: c, zoom: 14.5 }),
                coveredPoint
            );
            await page.locator('#connection-start').click();
            await clickCoordinate(coveredPoint);
            await page.waitForFunction(
                () =>
                    window._connectivityExplorer.assessment?.scenario?.status ===
                    'endpoint-blocked',
                null,
                { timeout: 20000 }
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /Move A to compare routes/
            );
            assert.match(
                await page.locator('.connection-outcome').innerText(),
                /30 m model cell containing A/
            );
            const blockedAssessment = await page.evaluate(
                () => window._connectivityExplorer.assessment
            );
            assert.deepEqual(blockedAssessment.blockedEndpoints, ['A']);
            assert.equal(
                blockedAssessment.blockedEndpointCells.features[0].properties.cellIndex,
                middle
            );
            const expectedCell = [
                [mx, my],
                [mx + 1, my],
                [mx + 1, my + 1],
                [mx, my + 1],
                [mx, my],
            ].map(([x, y]) =>
                nativeGrid.projection.inverse([
                    cm.originX + x * cm.cellWidth,
                    cm.originY - y * cm.cellHeight,
                ])
            );
            assert.deepEqual(
                blockedAssessment.blockedEndpointCells.features[0].geometry.coordinates,
                [expectedCell]
            );
            assert.equal(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('connection-blocked-cells')._data.features
                            .length
                ),
                1
            );
            assert.deepEqual(await page.locator('.connection-marker-blocked').allTextContents(), [
                'A',
            ]);
            await page.locator('[data-guide-view="before"]').click();
            assert.equal(await page.locator('.connection-marker-blocked').count(), 0);
            assert.equal(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('connection-blocked-cells')._data.features
                            .length
                ),
                0
            );
            await page.locator('[data-guide-view="scenario"]').click();
            const otherCoveredPoint = connectionEngine.coordinateAt(nativeGrid, middle + 1);
            await page.locator('#connection-end').click();
            await clickCoordinate(otherCoveredPoint);
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.blockedEndpoints?.length === 2,
                null,
                { timeout: 20000 }
            );
            assert.match(await page.locator('.connection-outcome').innerText(), /Move A and B/);
            await page.evaluate(
                (c) => window._mapInstance.jumpTo({ center: c, zoom: 14.5 }),
                endPoint
            );
            await page.locator('[data-move-endpoint="B"]').click();
            await clickCoordinate(endPoint);
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.blockedEndpoints?.length === 1,
                null,
                { timeout: 20000 }
            );
            assert.equal(
                await page.evaluate(
                    () => window._mapInstance.getSource('connection-scenario')._data.features.length
                ),
                0
            );
            assert.doesNotMatch(
                await page.locator('#connection-map-legend').innerText(),
                /With development/
            );
            await page.evaluate(
                (c) => window._mapInstance.jumpTo({ center: c, zoom: 14.5 }),
                startPoint
            );
            await page.locator('[data-move-endpoint="A"]').click();
            await clickCoordinate(startPoint);
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.scenario?.status === 'found',
                null,
                { timeout: 20000 }
            );
            assert.equal(
                await page.evaluate(
                    () =>
                        window._mapInstance.getSource('connection-blocked-cells')._data.features
                            .length
                ),
                0
            );
            assert.equal(await page.locator('.connection-marker-blocked').count(), 0);
            await page.locator('#connection-close').click();
            assert.equal(
                await page.evaluate(
                    () => window._mapInstance.getSource('connection-existing')._data.features.length
                ),
                0
            );
            assert.equal(await page.locator('.connection-marker').count(), 0);
            assert.equal(await page.locator('#connection-map-legend').isVisible(), false);
            const preserved = await page.evaluate(() => window._developmentScenario.footprint);
            await page.locator('[data-workflow-step="routes"]').click();
            await page.waitForFunction(
                () => window._connectivityExplorer.assessment?.scenario?.status === 'found',
                null,
                { timeout: 20000 }
            );
            await page.locator('#connection-development').click();
            assert.equal(await page.evaluate(() => window._developmentWorkflow.step), 'draw');
            assert.deepEqual(
                await page.evaluate(() => window._developmentScenario.footprint),
                preserved
            );
            assert.equal(await page.locator('#connectivity-panel').isVisible(), false);
            await page.evaluate(
                ([x, y]) => window._mapInstance.jumpTo({ center: [x, y], zoom: 16 }),
                [cx, cy]
            );
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-scenario.png'
                    ),
                });
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('[data-shape="line"]').click();
            await clickCoordinate([cx, bbox[1] - 0.0001]);
            await clickCoordinate([cx, bbox[3] + 0.0001]);
            if (await page.locator('#development-finish').isVisible())
                await page.locator('#development-finish').click();
            await calculate();
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('#development-width').fill('60');
            await page.locator('#development-width').press('Tab');
            assert.equal(await page.locator('#development-results').isVisible(), false);
            await calculate();
            await page.locator('[data-workflow-step="draw"]').click();
            await page.locator('[data-shape="polygon"]').click();
            for (const c of [
                [cx - 0.0002, bbox[1] - 0.0001],
                [cx + 0.0002, bbox[1] - 0.0001],
                [cx + 0.0002, bbox[3] + 0.0001],
                [cx - 0.0002, bbox[3] + 0.0001],
            ])
                await clickCoordinate(c);
            if (await page.locator('#development-finish').isVisible())
                await page.locator('#development-finish').click();
            await calculate();
            await page.locator('#workflow-reset').click();
            assert.equal(await page.locator('#development-results').isVisible(), false);
            assert.equal(await page.locator('#development-analyse').isEnabled(), false);
            await page.locator('#workflow-exit').click();
            assert.equal(await page.locator('#development-workflow').isVisible(), false);
            assert.equal(
                await page.locator('#development-workflow-toggle').textContent(),
                'Test a development'
            );
            assert.equal(await page.evaluate(() => window._connectivityExplorer.active), false);
            assert.equal(await page.locator('#development-panel').isVisible(), false);
            assert.equal(await page.locator('#info-panel-section').isVisible(), true);
            assert.equal(await page.locator('#basemap-toggle').isEnabled(), true);
            assert.deepEqual(
                await page.evaluate(
                    (layerId) => window._mapInstance.getFilter(layerId) || null,
                    layer
                ),
                previousFilter
            );
            await page.locator('#development-workflow-toggle').click();
            await page.locator('[data-shape="rectangle"]').click();
            await page.locator('#development-cancel').click();
            assert.equal(await page.locator('#development-analyse').isEnabled(), false);
            await page.locator('#workflow-exit').click();
            // Ordinary patch inspection resumes only after both tools are closed.
            await page.evaluate(() => {
                window._patchInspectionCalls = { fly: 0, scroll: 0 };
            });
            await page.evaluate(
                (c) => window._mapInstance.jumpTo({ center: c, zoom: 17 }),
                patchPoint
            );
            await page.waitForTimeout(200);
            assert.equal(await page.locator('#forest-editing-cue').isVisible(), false);
            await clickCoordinate(patchPoint);
            await page.waitForTimeout(120);
            assert.deepEqual(await page.evaluate(() => window._patchInspectionCalls), {
                fly: 1,
                scroll: 1,
            });
            assert.ok(await page.evaluate(() => window._lastPatchProps));
            assert.equal(await page.locator('.patch-at-glance').isVisible(), true);
            assert.equal(await page.locator('#patch-compare-add').isVisible(), true);
            await page.locator('#patch-compare-add').click();
            assert.equal(await page.evaluate(() => window._mapTools.comparisonCount), 1);
            assert.equal(await page.locator('#stats-section').getAttribute('open'), null);
            // A pending inspection scroll is cancelled if the user opens a tool.
            await page.waitForFunction(() => !window._mapInstance.isMoving());
            await page.evaluate((c) => {
                const map = window._mapInstance,
                    p = map.project(c);
                map.fire('click', {
                    point: p,
                    lngLat: mapboxgl.LngLat.convert(c),
                    originalEvent: { target: map.getCanvas() },
                });
                document.getElementById('development-workflow-toggle').click();
            }, patchPoint);
            await page.waitForTimeout(120);
            assert.equal(await page.evaluate(() => window._patchInspectionCalls.scroll), 1);
            assert.deepEqual(errors, []);
            console.log(
                landscape +
                    ': drawing regression, native-grid path, development rerouting, baseline flow exposure, flow overlay, exports, before/after, reset, and controls passed'
            );
            await page.goto(origin + '/' + landscape + '-map.html?task=development', {
                waitUntil: 'domcontentloaded',
            });
            await page.waitForFunction(
                () => window._developmentWorkflow?.active && window._developmentScenario?.active,
                { timeout: 20000 }
            );
            await page.waitForFunction(
                () =>
                    /forest patches loaded/.test(
                        document.getElementById('development-status').textContent
                    ),
                { timeout: 20000 }
            );
            assert.equal(await page.locator('#onboarding-overlay').isVisible(), false);
            assert.equal(await page.evaluate(() => window._developmentWorkflow.step), 'draw');
            await page.locator('#workflow-exit').click();
            assert.equal(await page.locator('#info-panel-section').isVisible(), true);
            await page.setViewportSize({ width: 390, height: 844 });
            if (await page.locator('#sidebar').evaluate((el) => el.classList.contains('collapsed')))
                await page.locator('#toggle-sidebar-btn').click();
            await page.locator('#measurement-tools > summary').click();
            await page.locator('#measure-distance').click();
            await page.waitForFunction(() => window._mapTools.measuring);
            await page.evaluate(
                (coords) =>
                    coords.forEach((c) =>
                        window._mapInstance.fire('click', {
                            lngLat: mapboxgl.LngLat.convert(c),
                            point: window._mapInstance.project(c),
                        })
                    ),
                measurePoints
            );
            await page.locator('#measure-finish').click();
            assert.ok(
                Math.abs(
                    (await page.evaluate(() => window._mapTools.measurement.value)) - expectedLength
                ) < 0.01
            );
            assert.equal(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
                true
            );
            await page.locator('#dark-mode-toggle').click();
            await verifyContrast();
            await page.locator('#loading-indicator').waitFor({ state: 'hidden' });
            await page.locator('#measurement-tools').scrollIntoViewIfNeeded();
            if (process.env.SCENARIO_SCREENSHOT_DIR)
                await page.screenshot({
                    path: path.join(
                        process.env.SCENARIO_SCREENSHOT_DIR,
                        landscape + '-tools-mobile.png'
                    ),
                });
            await page.close();
        }
    } finally {
        await browser.close();
        server.close();
    }
}
run().catch((error) => {
    console.error(error);
    server.close();
    process.exitCode = 1;
});

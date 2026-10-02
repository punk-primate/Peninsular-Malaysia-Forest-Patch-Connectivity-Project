const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../connectivity-engine.js');
const proj4 = require('../vendor/proj4-2.12.1.js');
function fixture(width, height, values = null, cellWidth = 30, cellHeight = 30) {
    const costs = values ? Uint8Array.from(values) : new Uint8Array(width * height).fill(1);
    const meta = {
        width,
        height,
        cellWidth,
        cellHeight,
        originX: 0,
        originY: height * cellHeight,
        projection: 'EPSG:3857',
        minimum: 1,
        maximum: 100,
        threshold: 1.3,
    };
    return engine.prepare(meta, costs);
}
function polygon(grid, rings) {
    const m = grid.meta;
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Polygon',
            coordinates: rings.map((ring) =>
                ring.map(([x, y]) =>
                    proj4(m.projection, 'EPSG:4326', [
                        m.originX + x * m.cellWidth,
                        m.originY - y * m.cellHeight,
                    ])
                )
            ),
        },
    };
}
test('octile movement uses cell geometry and average endpoint resistance', () => {
    const grid = fixture(2, 2, [1, 2, 3, 4], 30, 40);
    const path = engine.findPath(grid, 0, 3);
    assert.equal(path.status, 'found');
    assert.equal(path.cost, 125);
    assert.deepEqual(path.indices, [0, 3]);
});
test('finite maximum resistance is traversable and explicitly measured', () => {
    const grid = fixture(3, 1, [1, 100, 1]);
    const path = engine.findPath(grid, 0, 2);
    assert.equal(path.cost, 3030);
    const summary = engine.describePath(grid, path);
    assert.ok(Math.abs(summary.highestResistanceM / summary.lengthM - 0.5) < 1e-8);
});
test('path bends around a high-cost area instead of drawing a straight line', () => {
    const grid = fixture(7, 5);
    for (let x = 1; x < 6; x++) grid.costs[2 * 7 + x] = 100;
    const path = engine.findPath(grid, 14, 20);
    assert.ok(path.indices.some((index) => Math.floor(index / 7) !== 2));
    assert.ok(path.cost < 300);
});
test('NoData and blocked-cell corners cannot be crossed diagonally', () => {
    const grid = fixture(2, 2, [1, 0, 0, 1]);
    assert.equal(engine.findPath(grid, 0, 3).status, 'unreachable');
    const full = fixture(2, 2),
        blocked = Uint8Array.from([0, 1, 1, 0]);
    assert.equal(engine.findPath(full, 0, 3, blocked).status, 'unreachable');
});
test('an impassable development reroutes the path or blocks its endpoint', () => {
    const grid = fixture(7, 5),
        mask = new Uint8Array(35);
    mask[17] = 1;
    const baseline = engine.findPath(grid, 14, 20),
        scenario = engine.findPath(grid, 14, 20, mask);
    assert.equal(scenario.status, 'found');
    assert.ok(scenario.cost > baseline.cost);
    assert.ok(!scenario.indices.includes(17));
    mask[14] = 1;
    assert.equal(engine.findPath(grid, 14, 20, mask).status, 'endpoint-blocked');
});
test('footprint rasterization retains holes and includes narrow boundary contacts', () => {
    const grid = fixture(8, 8);
    const f = polygon(grid, [
        [
            [0.2, 0.2],
            [7.8, 0.2],
            [7.8, 7.8],
            [0.2, 7.8],
            [0.2, 0.2],
        ],
        [
            [2.2, 2.2],
            [5.8, 2.2],
            [5.8, 5.8],
            [2.2, 5.8],
            [2.2, 2.2],
        ],
    ]);
    const mask = engine.footprintMask(grid.meta, f).mask;
    assert.equal(mask[3 * 8 + 3], 0);
    assert.equal(mask[0], 1);
    const narrow = polygon(grid, [
        [
            [3.99, 0.2],
            [4.01, 0.2],
            [4.01, 7.8],
            [3.99, 7.8],
            [3.99, 0.2],
        ],
    ]);
    const touched = engine.footprintMask(grid.meta, narrow).mask;
    assert.equal(touched[3 * 8 + 3], 1);
    assert.equal(touched[3 * 8 + 4], 1);
    assert.equal(touched[3 * 8 + 2], 0);
});
test('multipart footprints do not fill the gap between separate polygons', () => {
    const grid = fixture(8, 3);
    const left = polygon(grid, [
        [
            [0.2, 0.2],
            [0.8, 0.2],
            [0.8, 0.8],
            [0.2, 0.8],
            [0.2, 0.2],
        ],
    ]);
    const right = polygon(grid, [
        [
            [7.2, 2.2],
            [7.8, 2.2],
            [7.8, 2.8],
            [7.2, 2.8],
            [7.2, 2.2],
        ],
    ]);
    const footprint = {
        type: 'MultiPolygon',
        coordinates: [left.geometry.coordinates, right.geometry.coordinates],
    };
    const mask = engine.footprintMask(grid.meta, footprint).mask;
    assert.equal(mask[0], 1);
    assert.equal(mask[23], 1);
    assert.equal(mask[12], 0);
});
test('flow exposure counts valid and high cells without claiming flow recalculation', () => {
    const grid = fixture(3, 1),
        footprint = polygon(grid, [
            [
                [0.1, 0.1],
                [2.9, 0.1],
                [2.9, 0.9],
                [0.1, 0.9],
                [0.1, 0.1],
            ],
        ]);
    const exposure = engine.flowExposure(grid.meta, Uint8Array.from([3, 1, 0]), footprint);
    assert.equal(exposure.touchedCells, 3);
    assert.equal(exposure.validCells, 2);
    assert.equal(exposure.highCells, 1);
    assert.equal(exposure.highFlowRecalculated, false);
});
test('projection round-trip places locations in their native cell', () => {
    const meta = {
        width: 10,
        height: 10,
        originX: 250000,
        originY: 450000,
        cellWidth: 29.868,
        cellHeight: 29.868,
        projection: '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs',
        minimum: 1,
        maximum: 100,
    };
    const grid = engine.prepare(meta, new Uint8Array(100).fill(1));
    assert.equal(engine.cellAt(grid, engine.coordinateAt(grid, 56)), 56);
});
test('outside locations, coincident cells and search limits report errors', () => {
    const grid = fixture(5, 5);
    assert.throws(() => engine.cellAt(grid, [101, 3]), /outside/);
    assert.throws(() => engine.findPath(grid, 1, 1), /same grid cell/);
    assert.throws(() => engine.findPath(grid, 0, 24, null, null, 1), /does not establish/);
});
test('resistance source remains unchanged after baseline and development calculations', () => {
    const grid = fixture(5, 5),
        original = grid.costs.slice();
    const mask = new Uint8Array(25);
    mask[12] = 1;
    engine.findPath(grid, 10, 14);
    engine.findPath(grid, 10, 14, mask);
    assert.deepEqual(grid.costs, original);
});

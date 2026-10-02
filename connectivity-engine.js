/* Native-grid least-cost paths. No terrain, resistance or flow values are invented. */
(function (root, factory) {
    const api = factory(
        typeof module === 'object' && module.exports
            ? require('./vendor/proj4-2.12.1.js')
            : root.proj4
    );
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ConnectivityGeometry = api;
})(typeof self !== 'undefined' ? self : globalThis, function (proj4) {
    'use strict';
    function prepare(meta, costs) {
        if (
            !Number.isInteger(meta.width) ||
            !Number.isInteger(meta.height) ||
            meta.width < 1 ||
            meta.height < 1 ||
            !(meta.cellWidth > 0) ||
            !(meta.cellHeight > 0) ||
            costs.length !== meta.width * meta.height
        )
            throw new Error('Invalid resistance grid.');
        return {
            meta,
            costs,
            projection: proj4('EPSG:4326', meta.projection),
            distance: new Float64Array(costs.length),
            previous: new Int32Array(costs.length),
            closed: new Uint8Array(costs.length),
        };
    }
    function cellAt(grid, coordinate) {
        if (
            !Array.isArray(coordinate) ||
            coordinate.length !== 2 ||
            !coordinate.every(Number.isFinite)
        )
            throw new Error('Invalid map location.');
        const p = grid.projection.forward(coordinate),
            m = grid.meta;
        const x = Math.floor((p[0] - m.originX) / m.cellWidth),
            y = Math.floor((m.originY - p[1]) / m.cellHeight);
        if (x < 0 || y < 0 || x >= m.width || y >= m.height)
            throw new Error('A selected location is outside the supplied resistance map.');
        const index = y * m.width + x;
        if (!grid.costs[index])
            throw new Error(
                'A selected location has no resistance data. Choose a location inside the model.'
            );
        return index;
    }
    function coordinateAt(grid, index) {
        const m = grid.meta,
            x = index % m.width,
            y = Math.floor(index / m.width);
        return grid.projection.inverse([
            m.originX + (x + 0.5) * m.cellWidth,
            m.originY - (y + 0.5) * m.cellHeight,
        ]);
    }
    class Heap {
        constructor() {
            this.length = 0;
            this.ids = new Uint32Array(4096);
            this.fs = new Float64Array(4096);
            this.gs = new Float64Array(4096);
        }
        push(id, f, g) {
            if (this.length === this.ids.length) {
                ['ids', 'fs', 'gs'].forEach((key) => {
                    const array = new this[key].constructor(this[key].length * 2);
                    array.set(this[key]);
                    this[key] = array;
                });
            }
            let at = this.length++;
            while (at > 0) {
                const parent = (at - 1) >> 1;
                if (this.fs[parent] <= f) break;
                this.ids[at] = this.ids[parent];
                this.fs[at] = this.fs[parent];
                this.gs[at] = this.gs[parent];
                at = parent;
            }
            this.ids[at] = id;
            this.fs[at] = f;
            this.gs[at] = g;
        }
        pop() {
            const result = [this.ids[0], this.gs[0]],
                last = --this.length;
            if (!last) return result;
            const id = this.ids[last],
                f = this.fs[last],
                g = this.gs[last];
            let at = 0;
            while (at * 2 + 1 < last) {
                let child = at * 2 + 1;
                if (child + 1 < last && this.fs[child + 1] < this.fs[child]) child++;
                if (this.fs[child] >= f) break;
                this.ids[at] = this.ids[child];
                this.fs[at] = this.fs[child];
                this.gs[at] = this.gs[child];
                at = child;
            }
            this.ids[at] = id;
            this.fs[at] = f;
            this.gs[at] = g;
            return result;
        }
    }
    function findPath(grid, start, end, blocked = null, onProgress = null, maxExpanded = 2000000) {
        const m = grid.meta,
            costs = grid.costs;
        if (start === end)
            throw new Error(
                'The locations fall in the same grid cell. Select locations farther apart.'
            );
        if (blocked && (blocked[start] || blocked[end]))
            return { status: 'endpoint-blocked', expanded: 0 };
        const distance = grid.distance,
            previous = grid.previous,
            closed = grid.closed;
        distance.fill(Infinity);
        previous.fill(-1);
        closed.fill(0);
        const ex = end % m.width,
            ey = Math.floor(end / m.width),
            diagonal = Math.hypot(m.cellWidth, m.cellHeight);
        const heuristic = (index) => {
            const dx = Math.abs((index % m.width) - ex),
                dy = Math.abs(Math.floor(index / m.width) - ey),
                together = Math.min(dx, dy);
            return (
                (together * diagonal +
                    (dx - together) * m.cellWidth +
                    (dy - together) * m.cellHeight) *
                m.minimum
            );
        };
        const passable = (i) => costs[i] > 0 && !(blocked && blocked[i]);
        const heap = new Heap();
        distance[start] = 0;
        heap.push(start, heuristic(start), 0);
        let expanded = 0;
        while (heap.length) {
            const [index, g] = heap.pop();
            if (closed[index] || g !== distance[index]) continue;
            if (index === end) {
                const indices = [];
                let cursor = end;
                while (cursor !== -1) {
                    indices.push(cursor);
                    cursor = previous[cursor];
                }
                indices.reverse();
                return { status: 'found', indices, cost: g, expanded };
            }
            closed[index] = 1;
            expanded++;
            if (expanded >= maxExpanded)
                throw new Error(
                    'Search limit reached. Choose closer locations; this does not establish that no path exists.'
                );
            if (onProgress && expanded % 10000 === 0) onProgress(expanded);
            const x = index % m.width,
                y = Math.floor(index / m.width);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (
                        (!dx && !dy) ||
                        x + dx < 0 ||
                        x + dx >= m.width ||
                        y + dy < 0 ||
                        y + dy >= m.height
                    )
                        continue;
                    const next = index + dy * m.width + dx;
                    if (closed[next] || !passable(next)) continue;
                    // Prevent a diagonal path squeezing through the corner of a blocked cell.
                    if (dx && dy && (!passable(index + dx) || !passable(index + dy * m.width)))
                        continue;
                    const length = dx && dy ? diagonal : dx ? m.cellWidth : m.cellHeight;
                    const candidate = g + (length * (costs[index] + costs[next])) / 2;
                    if (candidate >= distance[next]) continue;
                    distance[next] = candidate;
                    previous[next] = index;
                    heap.push(next, candidate + heuristic(next), candidate);
                }
        }
        return { status: 'unreachable', expanded };
    }
    function geographicDistance(a, b) {
        const radians = Math.PI / 180,
            dy = (b[1] - a[1]) * radians,
            dx = (b[0] - a[0]) * radians;
        const h =
            Math.sin(dy / 2) ** 2 +
            Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dx / 2) ** 2;
        return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    function describePath(grid, path) {
        if (path.status !== 'found') return path;
        const coordinates = path.indices.map((index) => coordinateAt(grid, index));
        let lengthM = 0,
            highestResistanceM = 0;
        for (let i = 1; i < coordinates.length; i++) {
            const length = geographicDistance(coordinates[i - 1], coordinates[i]);
            lengthM += length;
            highestResistanceM +=
                (length *
                    ((grid.costs[path.indices[i - 1]] === grid.meta.maximum ? 1 : 0) +
                        (grid.costs[path.indices[i]] === grid.meta.maximum ? 1 : 0))) /
                2;
        }
        return {
            status: 'found',
            cost: path.cost,
            expanded: path.expanded,
            lengthM,
            highestResistanceM,
            cellCount: path.indices.length,
            geometry: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates },
            },
        };
    }
    function footprintMask(meta, feature) {
        const projection = proj4('EPSG:4326', meta.projection),
            mask = new Uint8Array(meta.width * meta.height);
        const geometry = feature.geometry || feature;
        if (!['Polygon', 'MultiPolygon'].includes(geometry.type))
            throw new Error('A polygon development footprint is required.');
        let outside = false;
        const mark = (x, y) => {
            if (x >= 0 && y >= 0 && x < meta.width && y < meta.height) mask[y * meta.width + x] = 1;
        };
        function segmentTouchesCell(a, b, x, y) {
            let enter = 0,
                exit = 1;
            for (let axis = 0; axis < 2; axis++) {
                const lower = axis ? y : x,
                    delta = b[axis] - a[axis];
                if (Math.abs(delta) < 1e-12) {
                    if (a[axis] < lower - 1e-9 || a[axis] > lower + 1 + 1e-9) return false;
                } else {
                    const first = (lower - a[axis]) / delta,
                        second = (lower + 1 - a[axis]) / delta;
                    enter = Math.max(enter, Math.min(first, second));
                    exit = Math.min(exit, Math.max(first, second));
                    if (enter > exit + 1e-9) return false;
                }
            }
            return true;
        }
        function boundary(a, b) {
            // Supercover grid traversal, including both sides of an aligned boundary.
            const dx = b[0] - a[0],
                dy = b[1] - a[1],
                steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
            // The small segments cross at most one grid boundary per axis.
            for (let i = 0; i < steps; i++) {
                const ax = a[0] + (dx * i) / steps,
                    ay = a[1] + (dy * i) / steps;
                const bx = a[0] + (dx * (i + 1)) / steps,
                    by = a[1] + (dy * (i + 1)) / steps;
                const x0 = Math.floor(Math.min(ax, bx) - 1e-9),
                    x1 = Math.floor(Math.max(ax, bx) + 1e-9);
                const y0 = Math.floor(Math.min(ay, by) - 1e-9),
                    y1 = Math.floor(Math.max(ay, by) + 1e-9);
                for (let y = y0; y <= y1; y++)
                    for (let x = x0; x <= x1; x++) if (segmentTouchesCell(a, b, x, y)) mark(x, y);
            }
        }
        const polygons =
            geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
        for (const polygon of polygons) {
            const rings = polygon.map((ring) =>
                ring.map((coordinate) => {
                    const p = projection.forward(coordinate),
                        x = (p[0] - meta.originX) / meta.cellWidth,
                        y = (meta.originY - p[1]) / meta.cellHeight;
                    if (x < 0 || y < 0 || x > meta.width || y > meta.height) outside = true;
                    return [x, y];
                })
            );
            const vertices = rings.flat(),
                ymin = Math.max(0, Math.floor(Math.min(...vertices.map((p) => p[1])))),
                ymax = Math.min(
                    meta.height - 1,
                    Math.floor(Math.max(...vertices.map((p) => p[1])))
                );
            for (let y = ymin; y <= ymax; y++) {
                const crossings = [],
                    line = y + 0.5;
                for (const ring of rings)
                    for (let i = 1; i < ring.length; i++) {
                        const a = ring[i - 1],
                            b = ring[i];
                        if ((a[1] <= line && b[1] > line) || (b[1] <= line && a[1] > line))
                            crossings.push(a[0] + ((line - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
                    }
                crossings.sort((a, b) => a - b);
                for (let i = 0; i + 1 < crossings.length; i += 2) {
                    const begin = Math.max(0, Math.ceil(crossings[i] - 0.5)),
                        finish = Math.min(meta.width - 1, Math.floor(crossings[i + 1] - 0.5));
                    if (finish >= begin)
                        mask.fill(1, y * meta.width + begin, y * meta.width + finish + 1);
                }
            }
            rings.forEach((ring) => {
                for (let i = 1; i < ring.length; i++) boundary(ring[i - 1], ring[i]);
            });
        }
        let touchedCells = 0;
        for (const value of mask) touchedCells += value;
        return { mask, touchedCells, outside };
    }
    function flowExposure(meta, flags, footprint) {
        if (flags.length !== meta.width * meta.height) throw new Error('Invalid flow grid.');
        const rasterized = footprintMask(meta, footprint);
        let validCells = 0,
            highCells = 0;
        for (let i = 0; i < flags.length; i++)
            if (rasterized.mask[i]) {
                if (flags[i] & 1) validCells++;
                if (flags[i] & 2) highCells++;
            }
        return {
            touchedCells: rasterized.touchedCells,
            validCells,
            highCells,
            outside: rasterized.outside,
            threshold: meta.threshold,
            highFlowRecalculated: false,
        };
    }
    return { prepare, cellAt, coordinateAt, findPath, describePath, footprintMask, flowExposure };
});

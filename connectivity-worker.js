/* Full native-grid routing and baseline flow exposure, off the UI thread. */
importScripts('vendor/proj4-2.12.1.js', 'connectivity-engine.js');
let metadata = null,
    grid = null,
    flags = null,
    baselineCache = null;
async function binary(url, expectedHash) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load model data (' + response.status + ').');
    let bytes = await response.arrayBuffer();
    const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
    if (signature[0] === 31 && signature[1] === 139) {
        if (typeof DecompressionStream === 'undefined')
            throw new Error('A current browser is required to open the model data.');
        bytes = await new Response(
            new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
        ).arrayBuffer();
    }
    const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (value) => value.toString(16).padStart(2, '0')
    ).join('');
    if (digest !== expectedHash)
        throw new Error('Model data failed its integrity check. Refresh the page and try again.');
    return new Uint8Array(bytes);
}
self.onmessage = async function (event) {
    const message = event.data;
    try {
        if (message.type === 'load') {
            const response = await fetch(message.url);
            if (!response.ok)
                throw new Error('Could not load model metadata (' + response.status + ').');
            const data = await response.json();
            if (data.version !== 1) throw new Error('Unsupported model data format.');
            const [costs, flowFlags] = await Promise.all([
                binary(new URL(data.resistance.file, message.url), data.resistance.sha256),
                binary(new URL(data.flow.file, message.url), data.flow.sha256),
            ]);
            if (flowFlags.length !== data.flow.width * data.flow.height)
                throw new Error('Invalid flow model data.');
            metadata = data;
            grid = ConnectivityGeometry.prepare(data.resistance, costs);
            flags = flowFlags;
            self.postMessage({ type: 'ready', metadata });
        } else if (message.type === 'analyse') {
            if (!grid) throw new Error('Model data is still loading.');
            const exposure = message.footprint
                ? ConnectivityGeometry.flowExposure(metadata.flow, flags, message.footprint)
                : null;
            let result = {
                exposure,
                baseline: null,
                scenario: null,
                hasDevelopment: !!message.footprint,
            };
            if (message.start && message.end) {
                const start = ConnectivityGeometry.cellAt(grid, message.start),
                    end = ConnectivityGeometry.cellAt(grid, message.end);
                const key = start + ':' + end;
                const progress = (phase) => (expanded) =>
                    self.postMessage({ type: 'progress', job: message.job, phase, expanded });
                if (!baselineCache || baselineCache.key !== key) {
                    const path = ConnectivityGeometry.findPath(
                        grid,
                        start,
                        end,
                        null,
                        progress('existing')
                    );
                    baselineCache = {
                        key,
                        path,
                        description: ConnectivityGeometry.describePath(grid, path),
                    };
                }
                result.baseline = baselineCache.description;
                result.snappedStart = ConnectivityGeometry.coordinateAt(grid, start);
                result.snappedEnd = ConnectivityGeometry.coordinateAt(grid, end);
                if (message.footprint) {
                    const blocked = ConnectivityGeometry.footprintMask(
                        metadata.resistance,
                        message.footprint
                    );
                    result.baselineCellsBlocked = (baselineCache.path.indices || []).reduce(
                        (count, index) => count + (blocked.mask[index] ? 1 : 0),
                        0
                    );
                    const endpoints = [
                        [start, 'A'],
                        [end, 'B'],
                    ].filter(([index]) => blocked.mask[index]);
                    result.blockedEndpoints = endpoints.map(([, label]) => label);
                    result.blockedEndpointCells = {
                        type: 'FeatureCollection',
                        features: endpoints.map(([index, label]) => {
                            const m = grid.meta,
                                x = index % m.width,
                                y = Math.floor(index / m.width);
                            const coordinates = [
                                [x, y],
                                [x + 1, y],
                                [x + 1, y + 1],
                                [x, y + 1],
                                [x, y],
                            ].map(([col, row]) =>
                                grid.projection.inverse([
                                    m.originX + col * m.cellWidth,
                                    m.originY - row * m.cellHeight,
                                ])
                            );
                            return {
                                type: 'Feature',
                                properties: { endpoint: label, cellIndex: index },
                                geometry: { type: 'Polygon', coordinates: [coordinates] },
                            };
                        }),
                    };
                    const path = ConnectivityGeometry.findPath(
                        grid,
                        start,
                        end,
                        blocked.mask,
                        progress('development')
                    );
                    result.scenario = ConnectivityGeometry.describePath(grid, path);
                    result.blockedCells = blocked.touchedCells;
                    result.outsideResistanceExtent = blocked.outside;
                    if (
                        result.baseline.status === 'found' &&
                        result.scenario.status === 'found' &&
                        result.scenario.cost + 1e-7 < result.baseline.cost
                    ) {
                        throw new Error(
                            'Scenario cost unexpectedly decreased. No comparison was accepted.'
                        );
                    }
                }
            }
            self.postMessage({ type: 'result', job: message.job, result });
        }
    } catch (error) {
        self.postMessage({ type: 'error', job: message.job, message: error.message });
    }
};

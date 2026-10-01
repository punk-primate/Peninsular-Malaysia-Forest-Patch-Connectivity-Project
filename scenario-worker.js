/* Keep complete-geometry calculations away from map drawing and UI events. */
importScripts('vendor/turf-6.5.0.min.js', 'vendor/polygon-clipping-0.15.7.min.js', 'scenario-engine.js');
let prepared = null;
self.onmessage = async function (event) {
    const message = event.data;
    try {
        if (message.type === 'load') {
            const response = await fetch(message.url);
            if (!response.ok) throw new Error('Could not load forest boundaries (' + response.status + ').');
            const bytes = await response.arrayBuffer();
            const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
            let json;
            if (signature[0] === 31 && signature[1] === 139) {
                if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open the compressed forest data. Please use a current browser.');
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                json = await new Response(stream).json();
            } else json = JSON.parse(new TextDecoder().decode(bytes));
            prepared = DevelopmentGeometry.prepare(json);
            self.postMessage({ type: 'ready', count: prepared.entries.length, baselineHa: prepared.totalAreaM2 / 10000 });
        } else if (message.type === 'analyse') {
            if (!prepared) throw new Error('Forest boundaries are still loading.');
            const footprint = DevelopmentGeometry.createFootprint(message.feature, message.widthM);
            let lastProgress = -1;
            const result = DevelopmentGeometry.analyse(prepared, footprint, fraction => {
                const percent = Math.floor(fraction * 100);
                if (percent >= lastProgress + 10) {
                    lastProgress = percent;
                    self.postMessage({ type: 'progress', job: message.job, percent });
                }
            });
            self.postMessage({ type: 'result', job: message.job, result });
        }
    } catch (error) { self.postMessage({ type: 'error', job: message.job, message: error.message }); }
};

/* Development footprint geometry and forest fragmentation.
 * Turf 6.5.0: geodesic area and metre buffers. polygon-clipping 0.15.7:
 * union/intersection/difference, including holes and multipart polygons.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(
            require('./vendor/turf-6.5.0.min.js'),
            require('./vendor/polygon-clipping-0.15.7.min.js')
        );
    } else root.DevelopmentGeometry = factory(root.turf, root.polygonClipping);
})(typeof self !== 'undefined' ? self : this, function (turf, clipping) {
    'use strict';
    const MIN_AREA_M2 = 0.01; // numerical tolerance, not a habitat-size threshold
    const collection = (features) => ({ type: 'FeatureCollection', features });
    const asFeature = (coordinates, properties = {}) =>
        coordinates.length
            ? {
                  type: 'Feature',
                  properties,
                  geometry: { type: 'MultiPolygon', coordinates },
              }
            : null;
    function coordinates(feature) {
        const g = feature.geometry;
        if (g.type === 'Polygon') return [g.coordinates];
        if (g.type === 'MultiPolygon') return g.coordinates;
        throw new Error('Forest data must contain polygons.');
    }
    function overlaps(a, b) {
        return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
    }
    // Count geometric components after union. Shared corner contacts remain
    // connected, matching the point-contact convention of the supplied patches.
    // Canonical union nodes intersections on both boundaries before this step.
    function componentGroups(polygons) {
        const parent = polygons.map((_, i) => i),
            vertices = new Map();
        function find(i) {
            while (parent[i] !== i) {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            return i;
        }
        polygons.forEach((polygon, i) => {
            polygon.forEach((ring) =>
                ring.forEach((point) => {
                    const key = point[0].toFixed(10) + ',' + point[1].toFixed(10);
                    if (vertices.has(key)) parent[find(i)] = find(vertices.get(key));
                    else vertices.set(key, i);
                })
            );
        });
        const groups = new Map();
        polygons.forEach((polygon, i) => {
            const key = find(i);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(polygon);
        });
        return Array.from(groups.values());
    }
    const componentCount = (polygons) => componentGroups(polygons).length;
    function createFootprint(feature, widthM) {
        let footprint;
        if (feature.geometry.type === 'LineString') {
            const width = Number(widthM);
            if (!Number.isFinite(width) || width < 1 || width > 10000)
                throw new Error('Enter a total width between 1 and 10,000 metres.');
            if (turf.length(feature, { units: 'meters' }) < 0.1)
                throw new Error('Draw a longer line.');
            footprint = turf.buffer(feature, width / 2, { units: 'meters', steps: 16 });
        } else {
            coordinates(feature);
            if (turf.kinks(feature).features.length)
                throw new Error('The footprint crosses itself. Redraw it without crossing edges.');
            footprint = feature;
        }
        if (!footprint) throw new Error('The footprint could not be created.');
        const canonical = asFeature(clipping.union(coordinates(footprint)));
        if (!canonical || turf.area(canonical) <= MIN_AREA_M2)
            throw new Error('Draw a footprint with a measurable area.');
        return canonical;
    }
    function prepare(data) {
        if (
            data.type !== 'FeatureCollection' ||
            !Array.isArray(data.features) ||
            !data.features.length
        )
            throw new Error('The forest dataset is empty or invalid.');
        const ids = new Set();
        let totalAreaM2 = 0;
        const entries = data.features.map((feature) => {
            const id = feature.properties && feature.properties.id;
            if (id == null || ids.has(String(id)))
                throw new Error('Forest patch IDs must be present and unique.');
            ids.add(String(id));
            coordinates(feature);
            const areaM2 = turf.area(feature);
            if (!Number.isFinite(areaM2) || areaM2 <= 0)
                throw new Error('Invalid area for patch ' + id + '.');
            totalAreaM2 += areaM2;
            return { feature, id, areaM2, bbox: turf.bbox(feature) };
        });
        return { entries, totalAreaM2, bbox: turf.bbox(data) };
    }
    function analyse(prepared, footprint, progress = () => {}) {
        const footprintCoords = coordinates(footprint),
            bbox = turf.bbox(footprint);
        const affected = [],
            beforeFeatures = [],
            lostFeatures = [],
            remainingFeatures = [];
        let lostAreaM2 = 0,
            affectedBeforeM2 = 0,
            affectedAfterM2 = 0,
            splitCount = 0,
            removedCount = 0,
            newFragments = 0;
        prepared.entries.forEach((entry, index) => {
            if (index % 100 === 0) progress(index / prepared.entries.length);
            if (!overlaps(entry.bbox, bbox)) return;
            try {
                const before = clipping.union(coordinates(entry.feature));
                const loss = clipping.intersection(before, footprintCoords);
                const lossFeature = asFeature(loss, { id: entry.id });
                if (!lossFeature || turf.area(lossFeature) <= MIN_AREA_M2) return;
                const remaining = clipping.difference(before, footprintCoords);
                const beforeArea = turf.area(asFeature(before));
                const afterFeature = asFeature(remaining, { id: entry.id });
                const afterArea = afterFeature ? turf.area(afterFeature) : 0;
                const lossArea = turf.area(lossFeature);
                if (Math.abs(beforeArea - afterArea - lossArea) > Math.max(0.1, beforeArea * 1e-8))
                    throw new Error('Area conservation check failed.');
                // Reject overlaps in the supplied patch geometry instead of quietly
                // changing the baseline when union normalises the geometry.
                if (Math.abs(beforeArea - entry.areaM2) > Math.max(1, entry.areaM2 * 1e-6))
                    throw new Error('The supplied polygon parts overlap.');
                const groupsBefore = componentGroups(before);
                const partsBefore = groupsBefore.length,
                    partsAfter = componentCount(remaining);
                // Count splits within each original connected component, so a
                // removed component cannot hide a split in another component.
                const additional =
                    groupsBefore.length === 1
                        ? Math.max(0, partsAfter - 1)
                        : groupsBefore.reduce((sum, group) => {
                              if (!overlaps(turf.bbox(asFeature(group)), bbox)) return sum;
                              const groupAfter = clipping.difference(group, footprintCoords);
                              return sum + Math.max(0, componentCount(groupAfter) - 1);
                          }, 0);
                const removed = afterArea <= MIN_AREA_M2;
                if (additional) splitCount++;
                if (removed) removedCount++;
                newFragments += additional;
                lostAreaM2 += lossArea;
                affectedBeforeM2 += beforeArea;
                affectedAfterM2 += afterArea;
                beforeFeatures.push(asFeature(before, { id: entry.id }));
                lostFeatures.push(lossFeature);
                if (afterFeature) remainingFeatures.push(afterFeature);
                affected.push({
                    id: entry.id,
                    tier: entry.feature.properties.Tier || '',
                    beforeHa: beforeArea / 10000,
                    lostHa: lossArea / 10000,
                    remainingHa: afterArea / 10000,
                    partsBefore,
                    partsAfter,
                    additionalFragments: additional,
                    completelyRemoved: removed,
                });
            } catch (error) {
                // A partial result must never be presented as a successful scenario.
                throw new Error('Could not calculate patch ' + entry.id + ': ' + error.message);
            }
        });
        progress(1);
        return {
            footprint,
            footprintHa: turf.area(footprint) / 10000,
            baselineHa: prepared.totalAreaM2 / 10000,
            remainingLandscapeHa: (prepared.totalAreaM2 - lostAreaM2) / 10000,
            lostHa: lostAreaM2 / 10000,
            affectedBeforeHa: affectedBeforeM2 / 10000,
            affectedRemainingHa: affectedAfterM2 / 10000,
            affected,
            splitCount,
            removedCount,
            newFragments,
            outsideDatasetExtent: !overlaps(prepared.bbox, bbox),
            baselineForest: collection(beforeFeatures),
            lostForest: collection(lostFeatures),
            remainingForest: collection(remainingFeatures),
        };
    }
    return { prepare, createFootprint, analyse, componentCount };
});

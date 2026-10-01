const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../scenario-engine.js');
const turf = require('../vendor/turf-6.5.0.min.js');
const rectangle = (west, south, east, north, id = 1) => turf.polygon([[[west,south],[east,south],[east,north],[west,north],[west,south]]], { id, Tier:'Tier 3 (Connected Fragments)' });
const patch = rectangle(101,3,101.01,3.01);
const analyse = (footprint, forests = [patch]) => geometry.analyse(geometry.prepare(turf.featureCollection(forests)), geometry.createFootprint(footprint));
const conserved = result => assert.ok(Math.abs(result.baselineHa - result.lostHa - result.remainingLandscapeHa) < 1e-6);
test('outside footprint produces no affected forest', () => {
    const result = analyse(rectangle(102,4,102.01,4.01));
    assert.equal(result.affected.length, 0); assert.equal(result.lostHa, 0); assert.equal(result.outsideDatasetExtent,true); conserved(result);
});
test('edge clipping removes forest without reporting a split', () => {
    const result = analyse(rectangle(101.009,2.99,101.02,3.02));
    assert.equal(result.affected.length,1); assert.equal(result.splitCount,0); assert.equal(result.affected[0].partsAfter,1); assert.ok(result.lostHa > 0); conserved(result);
});
test('cut through a patch creates two fragments', () => {
    const result = analyse(rectangle(101.004,2.99,101.006,3.02));
    assert.equal(result.splitCount,1); assert.equal(result.newFragments,1); assert.equal(result.affected[0].partsAfter,2); conserved(result);
});
test('complete removal is not reported as fragmentation', () => {
    const result = analyse(rectangle(100.99,2.99,101.02,3.02));
    assert.equal(result.removedCount,1); assert.equal(result.splitCount,0); assert.equal(result.remainingLandscapeHa,0); assert.equal(result.remainingForest.features.length,0); conserved(result);
});
test('holes stay nonforest, and interior clearance creates a hole rather than a split', () => {
    const outer=patch.geometry.coordinates[0], hole=rectangle(101.003,3.003,101.007,3.007).geometry.coordinates[0];
    const holed=turf.polygon([outer,hole],{id:1});
    assert.equal(analyse(rectangle(101.004,3.004,101.006,3.006),[holed]).affected.length,0);
    const result=analyse(rectangle(101.004,3.004,101.006,3.006));
    assert.equal(result.splitCount,0); assert.equal(result.remainingForest.features[0].geometry.coordinates[0].length,2); conserved(result);
});
test('pre-existing disconnected multipart polygons are not new fragmentation', () => {
    const second=rectangle(101.02,3,101.03,3.01);
    const multi=turf.multiPolygon([patch.geometry.coordinates,second.geometry.coordinates],{id:1});
    const result=analyse(rectangle(101.029,2.99,101.04,3.02),[multi]);
    assert.equal(result.affected[0].partsBefore,2); assert.equal(result.affected[0].partsAfter,2); assert.equal(result.splitCount,0);
});
test('removing one component does not conceal a split in a different component', () => {
    const second=rectangle(101.003,3.02,101.007,3.03);
    const multi=turf.multiPolygon([patch.geometry.coordinates,second.geometry.coordinates],{id:1});
    const result=analyse(rectangle(101.002,2.99,101.008,3.04),[multi]);
    assert.equal(result.affected[0].partsBefore,2); assert.equal(result.affected[0].partsAfter,2); assert.equal(result.splitCount,1); assert.equal(result.newFragments,1); conserved(result);
});
test('corner contacts count as connected until removed', () => {
    const first=rectangle(101,3,101.01,3.01), second=rectangle(101.01,3.01,101.02,3.02);
    const multi=turf.multiPolygon([first.geometry.coordinates,second.geometry.coordinates],{id:1});
    const result=analyse(rectangle(101.009,3.009,101.011,3.011),[multi]);
    assert.equal(result.affected[0].partsBefore,1); assert.equal(result.affected[0].partsAfter,2); assert.equal(result.splitCount,1);
});
test('line width is total width, with half-width buffers on each side', () => {
    const line=turf.lineString([[101.005,2.995],[101.005,3.015]]);
    const small=geometry.createFootprint(line,20), large=geometry.createFootprint(line,40);
    const a=geometry.analyse(geometry.prepare(turf.featureCollection([patch])),small);
    const b=geometry.analyse(geometry.prepare(turf.featureCollection([patch])),large);
    assert.ok(Math.abs(b.lostHa/a.lostHa-2)<0.002); assert.equal(a.splitCount,1); conserved(a);
    assert.throws(()=>geometry.createFootprint(line,0),/width/);
});
test('self-crossing footprints and duplicate IDs are rejected', () => {
    const crossing=turf.polygon([[[101,3],[101.01,3.01],[101,3.01],[101.01,3],[101,3]]]);
    assert.throws(()=>geometry.createFootprint(crossing),/crosses itself/);
    assert.throws(()=>geometry.prepare(turf.featureCollection([patch,patch])),/unique/);
});
test('input data is unchanged and all loss/remaining geometry is retained', () => {
    const original=JSON.stringify(patch), result=analyse(rectangle(101.004,2.99,101.006,3.02));
    assert.equal(JSON.stringify(patch),original); assert.equal(result.baselineForest.features.length,1);
    assert.ok(Math.abs(turf.area(result.lostForest)/10000-result.lostHa)<1e-6);
    assert.ok(Math.abs(turf.area(result.remainingForest)/10000-result.affectedRemainingHa)<1e-6);
});

"""Independent SciPy/Shapely checks of routing and touched-cell rasterization.

Run: python tests/verify-connectivity-reference.py
Requires numpy, scipy, shapely and pyproj, plus Node. Uses committed model grids.
"""
import base64
import gzip
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from shapely.geometry import Polygon, box
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
NODE = r"""
const fs=require('fs'),engine=require('./connectivity-engine');
const data=JSON.parse(fs.readFileSync(0,'utf8'));
const costs=new Uint8Array(Buffer.from(data.costs,'base64'));
const grid=engine.prepare(data.meta,costs);
const blocked=engine.footprintMask(data.meta,data.footprint);
const baseline=engine.findPath(grid,data.start,data.end);
const scenario=engine.findPath(grid,data.start,data.end,blocked.mask);
console.log(JSON.stringify({baseline,scenario,mask:Buffer.from(blocked.mask).toString('base64')}));
"""


def reference_cost(costs, blocked, start, end, dx, dy):
    height, width = costs.shape
    allowed = (costs > 0) & ~blocked
    sources, destinations, weights = [], [], []
    indices = np.arange(costs.size).reshape(costs.shape)
    for row_step, col_step in [(0, 1), (1, 0), (1, 1), (1, -1)]:
        y0, y1 = max(0, -row_step), min(height, height-row_step)
        x0, x1 = max(0, -col_step), min(width, width-col_step)
        first = np.s_[y0:y1, x0:x1]
        second = np.s_[y0+row_step:y1+row_step, x0+col_step:x1+col_step]
        valid = allowed[first] & allowed[second]
        if row_step and col_step:
            valid &= allowed[y0:y1, x0+col_step:x1+col_step] & allowed[y0+row_step:y1+row_step, x0:x1]
        a, b = indices[first][valid], indices[second][valid]
        weight = (costs[first][valid].astype(float)+costs[second][valid].astype(float))/2*np.hypot(col_step*dx, row_step*dy)
        sources.extend([a,b]);destinations.extend([b,a]);weights.extend([weight,weight])
    graph=coo_matrix((np.concatenate(weights),(np.concatenate(sources),np.concatenate(destinations))),shape=(costs.size,costs.size)).tocsr()
    return float(dijkstra(graph,directed=False,indices=start)[end])


for slug in ['kuantan','klang-valley']:
    metadata=json.loads((ROOT/'data/connectivity'/f'{slug}.json').read_text())
    native=metadata['resistance']
    original=np.frombuffer(gzip.decompress((ROOT/'data/connectivity'/native['file']).read_bytes()),dtype=np.uint8).reshape(native['height'],native['width'])
    # Independently verify exact optimal costs on a native-grid subset.
    top=native['height']//2-65;left=native['width']//2-65
    costs=original[top:top+131,left:left+131].copy()
    meta=dict(native,width=131,height=131,originX=native['originX']+left*native['cellWidth'],originY=native['originY']-top*native['cellHeight'])
    forward=Transformer.from_crs(4326,native['crs'],always_xy=True)
    inverse=Transformer.from_crs(native['crs'],4326,always_xy=True)
    # Tilted, subcell boundary and a hole exercise touched-cell classification.
    native_rings=[[(60.25,52.2),(70.7,55.3),(72.1,81.6),(58.4,77.9),(60.25,52.2)],
                  [(63.2,60.2),(67.8,60.2),(67.8,67.8),(63.2,67.8),(63.2,60.2)]]
    rings=[[inverse.transform(meta['originX']+x*meta['cellWidth'],meta['originY']-y*meta['cellHeight']) for x,y in ring] for ring in native_rings]
    footprint={'type':'Polygon','coordinates':rings}
    start=65*131+20;end=65*131+110
    payload=dict(meta=meta,costs=base64.b64encode(costs.tobytes()).decode(),footprint=footprint,start=start,end=end)
    result=json.loads(subprocess.run(['node','-e',NODE],input=json.dumps(payload),text=True,capture_output=True,cwd=ROOT,check=True).stdout)
    pixel_rings=[]
    for ring in rings:
        xy=[forward.transform(*p) for p in ring]
        pixel_rings.append([((x-meta['originX'])/meta['cellWidth'],(meta['originY']-y)/meta['cellHeight']) for x,y in xy])
    shape=Polygon(pixel_rings[0],pixel_rings[1:]).buffer(1e-9)
    reference_mask=np.zeros(costs.shape,dtype=bool)
    for y in range(131):
        for x in range(131):reference_mask[y,x]=shape.intersects(box(x,y,x+1,y+1))
    actual_mask=np.frombuffer(base64.b64decode(result['mask']),dtype=np.uint8).reshape(costs.shape)>0
    assert np.array_equal(reference_mask,actual_mask),f'{slug}: touched mask differs from Shapely in {np.count_nonzero(reference_mask!=actual_mask)} cells'
    for name,blocked in [('baseline',np.zeros(costs.shape,dtype=bool)),('scenario',reference_mask)]:
        expected=reference_cost(costs,blocked,start,end,meta['cellWidth'],meta['cellHeight'])
        actual=result[name]
        if np.isfinite(expected):assert actual['status']=='found' and np.isclose(expected,actual['cost'],rtol=1e-12,atol=1e-6),(slug,name,expected,actual)
        else:assert actual['status']=='unreachable'
    print(json.dumps(dict(landscape=slug,maskMatchesShapely=True,baselineMatchesSciPy=True,scenarioMatchesSciPy=True)),flush=True)

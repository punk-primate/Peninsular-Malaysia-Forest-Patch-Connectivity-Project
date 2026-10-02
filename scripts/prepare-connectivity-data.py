"""Prepare lossless native resistance grids and high-flow masks from supplied GeoTIFFs.

Usage: python scripts/prepare-connectivity-data.py --input-dir /path/to/uploads
Requires numpy, rasterio, pyproj and Pillow. Source TIFFs are never modified.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.warp import calculate_default_transform, reproject, Resampling


def grid_metadata(src):
    if src.transform.b != 0 or src.transform.d != 0:
        raise ValueError('Rotated grids require a separate implementation.')
    return dict(width=src.width, height=src.height, crs=str(src.crs),
                projection=src.crs.to_proj4(), originX=src.transform.c,
                originY=src.transform.f, cellWidth=src.transform.a,
                cellHeight=-src.transform.e)


def packed(filename, array):
    raw = np.ascontiguousarray(array, dtype=np.uint8).tobytes()
    filename.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    return hashlib.sha256(raw).hexdigest()


def prepare(input_dir, output_dir, label, slug):
    output_dir.mkdir(parents=True, exist_ok=True)
    provenance = {}
    for kind in ['Resistance', 'cum_currmap', 'flow_potential', 'normalized_cum_currmap']:
        filename = input_dir / (label + '_' + kind + '.tif')
        provenance[kind] = dict(file=filename.name, sha256=hashlib.sha256(filename.read_bytes()).hexdigest())
    with rasterio.open(input_dir / (label + '_Resistance.tif')) as src:
        resistance = src.read(1, masked=True)
        values = resistance.compressed()
        if not np.all(np.isfinite(values)) or np.any(values <= 0) or np.any(values > 255) or np.any(values != np.floor(values)):
            raise ValueError('This lossless byte format requires positive integer resistances up to 255.')
        costs = resistance.filled(0).astype(np.uint8)
        resistance_meta = grid_metadata(src)
        resistance_meta.update(file=slug+'-resistance.bin.gz',
                               sha256=packed(output_dir/(slug+'-resistance.bin.gz'), costs),
                               minimum=int(values.min()), maximum=int(values.max()),
                               values=np.unique(values).astype(int).tolist(),
                               validCells=int((costs > 0).sum()))
    with rasterio.open(input_dir / (label + '_normalized_cum_currmap.tif')) as src:
        normalized = src.read(1, masked=True)
        valid = ~np.ma.getmaskarray(normalized) & np.isfinite(normalized.data) & (normalized.data >= 0)
        positive = valid & (normalized.data > 0)
        threshold = float(np.quantile(normalized.data[positive], .9))
        high = positive & (normalized.data >= threshold)
        flags = valid.astype(np.uint8) | (high.astype(np.uint8) * 2)
        flow_meta = grid_metadata(src)
        flow_meta.update(file=slug+'-flow-flags.bin.gz',
                         sha256=packed(output_dir/(slug+'-flow-flags.bin.gz'), flags),
                         positiveCells=int(positive.sum()), validCells=int(valid.sum()),
                         highCells=int(high.sum()), threshold=threshold,
                         percentile=90, label='High-flow areas in supplied normalized current (top 10% of positive cells)')
        # Reproject only the display mask. Analysis retains every native cell.
        transform, width, height = calculate_default_transform(src.crs, 'EPSG:3857', src.width, src.height, *src.bounds, resolution=90)
        display = np.zeros((height, width), dtype=np.uint8)
        reproject(high.astype(np.uint8), display, src_transform=src.transform, src_crs=src.crs,
                  dst_transform=transform, dst_crs='EPSG:3857', resampling=Resampling.max)
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[display > 0] = [32, 111, 211, 135]
        Image.fromarray(rgba).save(output_dir/(slug+'-high-flow.png'), optimize=True)
        inverse = Transformer.from_crs(3857, 4326, always_xy=True)
        corners = [(transform.c, transform.f), (transform.c+width*transform.a, transform.f),
                   (transform.c+width*transform.a, transform.f+height*transform.e), (transform.c, transform.f+height*transform.e)]
        flow_meta['display'] = dict(file=slug+'-high-flow.png', coordinates=[list(inverse.transform(*p)) for p in corners],
                                    resolutionM=90, resampling='maximum; display only')
        norm_transform, norm_crs, norm_shape = src.transform, src.crs, src.shape
    with rasterio.open(input_dir/(label+'_cum_currmap.tif')) as src:
        if src.transform != norm_transform or src.crs != norm_crs or src.shape != norm_shape:
            raise ValueError('Current and normalized current grids differ.')
        current = src.read(1, masked=True)
    with rasterio.open(input_dir/(label+'_flow_potential.tif')) as src:
        if src.transform != norm_transform or src.crs != norm_crs or src.shape != norm_shape:
            raise ValueError('Flow potential and normalized current grids differ.')
        potential = src.read(1, masked=True)
    compare = ~(np.ma.getmaskarray(current) | np.ma.getmaskarray(potential) | np.ma.getmaskarray(normalized)) & (potential.data > 0)
    error = float(np.max(np.abs(normalized.data[compare]-current.data[compare]/potential.data[compare])))
    if error > 1e-10:
        raise ValueError('Normalized current is inconsistent with current / potential.')
    metadata = dict(version=1, landscape=label, resistance=resistance_meta, flow=flow_meta,
                    sourceModel='Supplied model; resistance calibration, window size and multi-scenario aggregation not specified in TIFF metadata',
                    provenance=provenance, normalizationMaxError=error,
                    restorationPotentialUsed=False)
    (output_dir/(slug+'.json')).write_text(json.dumps(metadata, indent=2)+'\n')
    print(json.dumps(dict(landscape=label, resistanceShape=costs.shape, flowShape=flags.shape,
                          highFlowThreshold=threshold, highFlowCells=int(high.sum()), normalizationMaxError=error)), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1]/'data'/'connectivity')
    args = parser.parse_args()
    for landscape, slug in [('Kuantan', 'kuantan'), ('Klang Valley', 'klang-valley')]:
        prepare(args.input_dir, args.output_dir, landscape, slug)

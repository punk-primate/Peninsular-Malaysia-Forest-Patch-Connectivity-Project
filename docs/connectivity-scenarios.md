# Resistance models and development scenarios

Test a development guides the user through drawing a footprint, reviewing forest changes and optionally comparing potential routes between A and B. The before-development route is dashed purple; the with-development route is solid orange. Lines represent paths rather than corridor widths. Footprint overlap with baseline high-flow cells is reported separately.

## Input provenance and preparation

The inputs are the supplied Resistance, cum_currmap, flow_potential, normalized_cum_currmap, and restoration_potential GeoTIFFs for Kuantan and Klang Valley. Original uploads are read without modification. The normalized current equals cumulative current divided by flow potential exactly at all valid cells with positive potential in both supplied datasets. This validates that relationship, not the ecological calibration of the inputs. Resistance calibration, Omniscape window size, and any aggregation across scenarios are not established by the TIFF metadata. The interface therefore identifies these as the supplied model.

| Landscape | Resistance grid | Native CRS | Cell dimensions (projected metres) | Flow grid |
|---|---|---|---|---|
| Kuantan | 2,739 columns × 2,214 rows | EPSG:32648 | 29.86817 × 29.86817 | 2,738 × 2,207 |
| Klang Valley | 2,628 columns × 2,976 rows | EPSG:3857 | 29.95356 × 30.31430 | 2,616 × 2,964 |

Resistance and flow surfaces have different origins and extents. Each calculation uses its own original grid. Analytical data are never resampled to align these grids. Proj4js 2.12.1 converts WGS84 map locations and footprint vertices to each native CRS.

`scripts/prepare-connectivity-data.py` retains all native resistance cells as lossless unsigned bytes: supplied finite values are 1, 10, 25, 50, 75, and 100; zero encodes NoData. Flow flags retain valid finite non-negative cells and the high-flow classification on the original normalized-current grid. Production files are gzip compressed. Landscape JSON files record native transforms, thresholds, input filenames, SHA-256 hashes, and the normalization check. The Web Worker checks decoded production bytes against their hashes before analysis.

Restoration-potential rasters are not used to predict restoration benefits. They contain negative values, and the Klang Valley restoration grid differs from its flow grids. Interpretation and alignment need separate methodological decisions.

To reproduce production data with Python, NumPy, rasterio, and Pillow installed:

```sh
python scripts/prepare-connectivity-data.py --input-dir /path/to/original-tiffs
```

## Least-cost path

Endpoints snap to the cells containing the selected locations and the displayed path connects native cell centres. Each cell has up to eight neighbours. A transition from cell a to cell b costs `(resistance[a] + resistance[b]) / 2 × step distance`. Distances use the native projected cell dimensions, including the correct diagonal distance on rectangular cells. An admissible octile-distance heuristic multiplied by the minimum resistance guides A* search. Search uses the complete native resistance grid, rather than a crop between endpoints or a reduced-resolution grid.

NoData cells are impassable. A diagonal move is rejected when either adjacent cardinal cell is blocked, preventing paths slipping between blocked corners. All finite positive resistance values, including 100, remain traversable. No land-cover interpretation or hard road/water barrier is invented from these numeric values. The model may therefore cross high-resistance areas and does not establish safe crossings, canopy continuity, observed movement, or species-specific dispersal.

The development scenario treats every native resistance cell touched by the calculated footprint as impassable. This is an explicit complete-barrier assumption. It applies to buffered lines, rectangles, and polygons, including holes and multipart geometry. Interior cells and exact boundary intersections are included; corner and edge contacts conservatively block the touched cells. Blocking cells can increase optimal cost or leave it unchanged. A selected endpoint covered by development is reported as blocked. Exhausting the graph establishes no path under these model rules; reaching the two-million-expanded-cell search limit reports an incomplete search and asks for closer locations. It does not claim that no path exists.

The public results give a relative resistance score using the same A/B pair: the before-development path is the reference 100, and the with-development score is `100 × scenario cost / baseline cost`. A score of 120 means 20% greater route resistance; 200 means twice the resistance. Route distance and the resistance of traversed cells both contribute. Scores reset their reference for each endpoint pair and cannot compare absolute difficulty across different pairs. Missing or blocked scenario paths do not receive a numeric comparison score. This display does not change routing, resistance values, exports, or the raw cost totals, which remain available under Raw model cost and route details. Scores are not percentages of habitat loss or wildlife survival.

Accumulated cost has units of resistance × native projected metres. It is not a probability, time, or predicted population change. EPSG:3857 introduces projection distortion. Separately reported physical path length uses spherical geodesic segment distances with radius 6,371,008.8 m. Length in the highest resistance class allocates half each segment length to each endpoint cell. A shorter physical route can have a higher accumulated cost. Route vertices are retained without simplification.

## Baseline high-flow exposure

High-flow cells are those at or above the 90th percentile of positive finite supplied normalized-current values, with ties included. Valid zero cells count as valid flow data but cannot be classified as high flow. NoData and negative cells are excluded. This relative visualization threshold is not a validated ecological pinch-point threshold.

For each footprint, exposure counts whole cells touched on the original flow grid, including boundary contacts. Valid and high-flow counts are reported separately. Counts are not exact intersection areas. Footprints beyond a raster extent and cells without valid flow data are disclosed, and the tool reports available coverage only.

The blue map overlay is a 90 m display raster generated with maximum resampling so the presence of a high-flow cell remains visible. Display pixels may look wider than the native features. This display raster is never used for path calculations or exposure counts.

Omniscape is not rerun after development. Its supplied baseline current, flow potential, and normalized current remain unchanged. Rerouting one least-cost path does not predict redistribution of circuit current. A future circuit-theory scenario would need the source-strength inputs, original modelling configuration, documented treatment of development resistance, and an independently validated rerun.

## Interaction and export

The workflow has three stages: Draw and calculate, Forest changes, and Potential routes. The latter two require a calculated footprint. Changing geometry or line width invalidates the results. Start again clears the footprint and endpoints; Return to patch explorer restores normal patch inspection and filters. Patch clicks and hover cards are paused during the workflow.

The route stage places A and B in sequence and calculates automatically. Covered endpoints are identified, their blocked cells are outlined, and replacement controls allow the user to move them. Before/With development controls change route visibility. Leaving the route stage hides its overlays while retaining the selected endpoints and footprint.

Results distinguish an unchanged path, a detour around blocked baseline cells, an equally available alternative and a connection blocked under the model. Covered endpoints request relocation. These outcomes describe potential connections and do not certify wildlife corridors or observed movement.

Analysis runs in a Web Worker. Job identifiers prevent stale results from replacing current calculations. Assessment JSON contains selected and snapped locations, path geometry, lengths and costs, blocked cells and endpoints, footprint exposure, methods and provenance. The field `currentFlowRecalculated: false` records that circuit current remains a baseline input. Development exports include the available connectivity assessment. Web Workers, DecompressionStream and Web Crypto are required.

## Verification

```sh
node --test tests/scenario-engine.test.cjs tests/connectivity-engine.test.cjs
python tests/verify-connectivity-reference.py
node tests/development-browser.cjs
```

The 22 geometry and routing tests cover optimal costs, rectangular cells, diagonal corner rules, NoData, finite high resistance, blocked endpoints, detours, search limits, holes, native coordinate conversion, boundary contacts, and the existing forest-clearance calculations. The independent Python check compares costs with SciPy Dijkstra on a 131 × 131 native-grid sample from each landscape and compares a tilted footprint with a hole against exact Shapely cell intersections. Baseline and development costs and masks agree for both landscapes.

Browser checks cover drawing and editing, endpoint placement, rerouting, exposure, view switching, reset and export. They also check click ownership, patch inspection, comparison, measurements, filter management, text contrast and mobile layout. The fixture uses real Mapbox GL/Draw, Web Workers and complete analytical datasets with an offline basemap. External hosted tiles and satellite imagery require manual review. Browser setup is documented in the [README](../README.md#local-review).

Method references: [Linkage Mapper least-cost connectivity tools](https://linkagemapper.org/linkage-mapper-tools/), [Omniscape documentation](https://docs.circuitscape.org/Omniscape.jl/), and [Proj4js](https://proj4js.org/).

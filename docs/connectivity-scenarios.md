# Supplied resistance models and development scenarios

Connections replaces the illustrative nearest-neighbour connector overlay. Choose start A and end B on either map to calculate a least-cost path through the supplied resistance surface. Calculating a development footprint also reports its overlap with baseline high-flow cells. With both locations selected, it compares a Before development route (dashed purple) with a With development route (solid orange). Lines represent paths, not corridor widths.

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

Accumulated cost has units of resistance × native projected metres. It is not a probability, time, or predicted population change. EPSG:3857 introduces projection distortion. Separately reported physical path length uses spherical geodesic segment distances with radius 6,371,008.8 m. Length in the highest resistance class allocates half each segment length to each endpoint cell. A shorter physical route can have a higher accumulated cost. Route vertices are retained without simplification.

## Baseline high-flow exposure

High-flow cells are those at or above the 90th percentile of positive finite supplied normalized-current values, with ties included. Valid zero cells count as valid flow data but cannot be classified as high flow. NoData and negative cells are excluded. This relative visualization threshold is not a validated ecological pinch-point threshold.

For each footprint, exposure counts whole cells touched on the original flow grid, including boundary contacts. Valid and high-flow counts are reported separately. Counts are not exact intersection areas. Footprints beyond a raster extent and cells without valid flow data are disclosed, and the tool reports available coverage only.

The blue map overlay is a 90 m display raster generated with maximum resampling so the presence of a high-flow cell remains visible. Display pixels may look wider than the native features. This display raster is never used for path calculations or exposure counts.

Omniscape is not rerun after development. Its supplied baseline current, flow potential, and normalized current remain unchanged. Rerouting one least-cost path does not predict redistribution of circuit current. A future circuit-theory scenario would need the source-strength inputs, original modelling configuration, documented treatment of development resistance, and an independently validated rerun.

## Interaction and export

Analysis runs in a Web Worker. Stale job results are discarded when a footprint or endpoint changes. Existing/scenario view switches hide or show the orange path appropriately. A and B markers identify the same endpoints for both routes. A map legend shows only the routes currently displayed. Before and with-development cards and a plain-language outcome explain the comparison; resistance cost and detailed metrics are available under expandable details. View routes on map fits both calculated routes. Closing Connections hides its paths, endpoint markers, and blue overlay. Calculating a development footprint loads the model automatically for exposure counts; opening Connections then allows route comparison.

Assessment JSON includes selected and snapped locations, path geometry, costs and lengths, the footprint, baseline exposure, methods, provenance, and `currentFlowRecalculated: false`. Development exports include the available connectivity assessment. Modern browsers with Web Workers, DecompressionStream, and Web Crypto are required.

## Verification

```sh
node --test tests/scenario-engine.test.cjs tests/connectivity-engine.test.cjs
python tests/verify-connectivity-reference.py
node tests/development-browser.cjs
```

The 22 geometry and routing tests cover optimal costs, rectangular cells, diagonal corner rules, NoData, finite high resistance, blocked endpoints, detours, search limits, holes, native coordinate conversion, boundary contacts, and the existing forest-clearance calculations. The independent Python check compares costs with SciPy Dijkstra on a 131 × 131 native-grid sample from each landscape and compares a tilted footprint with a hole against exact Shapely cell intersections. Baseline and development costs and masks agree for both landscapes.

Browser integration tests use real Mapbox GL 3.1.2, Draw 1.4.3, Web Workers, complete forest datasets, and full native resistance and flow grids, with a controlled offline map style. Both landscapes pass endpoint selection, native-grid baseline cost comparison, footprint rerouting, flow overlay, export, before/with-development switching, fitting routes, invalidation, and closing, alongside the previous drawing checks. Refinement checks cover endpoint labels, displaying only available routes, covered-endpoint messages, development navigation, computed text contrast of at least 4.5:1 in light and dark mode (including expanded details), and a 390 px mobile view. Viewing routes on a small screen collapses the sidebar so it does not obscure the map. External hosted Mapbox tiles and live satellite imagery are outside this automated fixture. Optional `SCENARIO_BROWSER_EXECUTABLE`, `SCENARIO_MAPBOX_JS`, and `SCENARIO_MAPBOX_CSS` select locally cached browser assets.

Method references: [Linkage Mapper least-cost connectivity tools](https://linkagemapper.org/linkage-mapper-tools/), [Omniscape documentation](https://docs.circuitscape.org/Omniscape.jl/), and [Proj4js](https://proj4js.org/).

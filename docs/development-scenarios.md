# Development footprint scenarios

The existing forest explorer is retained. The former road popup is replaced with a development tool supporting a line with a user-specified total width, a two-corner rectangle, and a custom polygon. One footprint is assessed at a time, assuming complete clearance of mapped forest inside it.

## Calculations

Complete source polygons are loaded once per landscape into a Web Worker, independently of rendered tiles, zoom, category filters, and corridor visibility. Polygon union, intersection, and difference use polygon-clipping 0.15.7. Holes and multipart polygons are retained. A line uses Turf 6.5.0 buffering with half the entered width on either side and round joins and end caps.

Forest loss is the polygonal intersection of forest and the footprint. Remaining forest is their difference. Areas are calculated consistently from supplied geometry using Turf spherical geodesic area, in square metres, then converted to hectares. The baseline and scenario are calculated using the same method. They may differ from raster-derived area attributes or published landscape totals; the stored attributes are not substituted into this geometric comparison. Coordinate precision is preserved. No geometry simplification is applied. Intersection areas of 0.01 square metres or less are treated as numerical noise.

Union first normalises polygon boundaries. Geometric connected components are counted with shared boundary vertices, including corner contacts, treated as connected. Vertex matching is rounded to ten decimal places (about 0.01 mm locally). New separation is calculated within each original connected component. Removing one pre-existing component does not hide a split in another. Complete removal is reported separately. This is geometric connectivity, not a recomputation of raster patch IDs, functional movement, or animal occupancy.

For every affected patch, before area must equal removed plus remaining area within an absolute 0.1 square metre or relative 1e-8 tolerance. Overlapping supplied polygon parts that change the baseline by more than 1 square metre or relative 1e-6 cause an error. Any failed patch calculation rejects the entire scenario rather than silently reporting partial results.

## Map and interaction

An orange dashed outline shows the development footprint. Existing forest and development scenario can be compared using two view buttons. The scenario shows removed forest in red and surviving forest in green. Affected IDs are hidden in the original vector layer to avoid displaying undeveloped forest beneath the scenario. Existing patch interactions, category filters, tile-derived statistics, and satellite switching are suspended while the tool is open and restored on close. Illustrative nearest-neighbour connectors are removed. Connections now provides paths computed from supplied native resistance grids; see [connectivity methods](connectivity-scenarios.md).

Drawing or editing a new footprint invalidates the previous results. Changing line width also invalidates the calculation. Calculation requests carry IDs to discard stale results after an edit, clear, or close. A failed load can be retried by reopening the tool. Drawing dependencies are version-pinned and served locally.

The tool can export its footprint, affected patches, before and remaining geometries, removed forest, assumptions, and area summaries as JSON.

## Data provenance

- `data/kuantan-patches.geojson.gz`: derived from the supplied `Kuantan Forest Patches.geojson`, containing 4,699 patches.
- `data/klang-valley-patches.geojson.gz`: derived from the supplied `Klang_Valley_Patches_Tiers_Final_Online.geojson`, containing 11,466 patches.

Only `id`, `Tier`, and complete polygon geometry are carried into these production files. Source coordinates, feature ordering, holes, and multipart structure are preserved. The original uploads are unchanged. Files are minified and gzip compressed to reduce transfer size. A modern browser with Web Workers and DecompressionStream is required. Uncompressed GeoJSON responses are also accepted if the server decompresses the file automatically.

These patch source files do not contain mean current flow or pinch-point attributes. Separately supplied raster data now support native-grid least-cost paths and baseline high-flow exposure counts. The footprint tool does not recalculate core area, ENN, structural scores, tiers, circuit-theory current, development expansion, or vegetation recovery. Those require separate methodological inputs.

## Verification

Run `node --test tests/scenario-engine.test.cjs`. Tests cover no overlap, edge clipping, actual splitting, complete removal, holes, existing multipart components, point contacts, simultaneous removal and splitting, line widths, invalid footprints, duplicate IDs, conservation of area, and unchanged inputs.

Both supplied datasets were checked with Shapely and all 16,165 feature geometries were valid. One real-data scenario per landscape was independently compared with Shapely intersection and spherical geodesic area: affected patch IDs matched, and area estimates agreed to better than 0.000001 percent.

`node tests/development-browser.cjs` runs browser integration checks with Playwright, real Mapbox GL/Draw, real Web Workers, and both complete datasets. It substitutes a controlled offline map style for external map services. Checks cover rectangles, lines, polygons, switching shapes, width edits, existing/scenario views, JSON download, clearing, closing, reopening, cancelling, and restoration of filters and controls. Both landscapes passed. Live hosted tiles still require manual review. Optional `SCENARIO_BROWSER_EXECUTABLE`, `SCENARIO_MAPBOX_JS`, and `SCENARIO_MAPBOX_CSS` environment variables select a local Chromium executable and cached Mapbox GL 3.1.2 assets.

For manual browser review, serve the repository using `python -m http.server 8000`, open either map page, select Development, and test all three shapes. Check width changes, redrawing, invalid polygons, existing/scenario views, clearing, reopening, JSON export, and restoration of normal patch interactions. Connections can be opened to compare an existing path with a development path and display baseline high-flow areas.

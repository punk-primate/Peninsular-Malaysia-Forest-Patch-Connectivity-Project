# myforestconnect

Forest patch structure and landscape connectivity in Peninsular Malaysia.

[Open the website](https://myforestconnect.online)

The platform provides public access to research data for 4,699 forest patches in Kuantan and 11,466 in Klang Valley. It forms part of Benjamin Galea's research at Universiti Sains Malaysia. Additional cities are planned for future updates.

## Map tools

- Explore patch attributes, search for places and switch basemaps.
- Filter by tier and area, view active filters and reset them together.
- Compare up to three patches using a table and numbered map markers.
- Measure distances and areas, and download a map with its legend, scale and attribution.
- Draw a proposed development footprint and assess forest loss and fragmentation.
- Compare potential routes before and with development using the supplied resistance grids.
- View baseline high-flow areas and their overlap with a development footprint.
- Download patch report cards and share the current map view.

Each map includes a **How to use this map** guide.

## Methods and data

The Patch Structural Quality Index (PSQI) combines five metrics, normalised within each landscape:

| Metric | Weight | More favourable value |
|---|---:|---|
| Core area | 0.30 | Higher |
| Euclidean nearest-neighbour distance | 0.30 | Lower |
| Patch area | 0.20 | Higher |
| Contiguity | 0.10 | Higher |
| Perimeter-area ratio | 0.10 | Lower |

Lower PSQI values indicate more favourable patch structure. The six tiers use within-landscape percentile boundaries at 1%, 15%, 25%, 50% and 75%. Tier 1 also applies a minimum patch-area threshold of 30 ha.

Land-cover inputs include Dynamic World V1 (2025), the oil-palm extent dataset of Danylo et al. (2021), and MyGDI roads (2021). Baseline connectivity surfaces come from the associated Omniscape analysis.

Development calculations assume complete forest clearance inside a single footprint. Forest loss and remaining fragments use complete polygons, independently of rendered map tiles. Route comparison treats resistance cells touched by development as barriers. These are modelled potential connections, not observations of wildlife movement.

Detailed methods, numerical tolerances and provenance:

- [Development footprints and forest geometry](docs/development-scenarios.md)
- [Resistance grids, route calculations and high-flow exposure](docs/connectivity-scenarios.md)

The repository contains the website, its prepared data and the raster preparation script. It does not contain the complete land-cover, PSQI or Omniscape research pipeline. Original source GeoTIFFs are needed to reproduce the prepared raster files.

## Source files

| Files | Purpose |
|---|---|
| `index.html` | Homepage |
| `kuantan-map.html`, `klang-valley-map.html` | Map pages and help |
| `app-kuantan.js`, `app.js` | Map interaction and patch information |
| `config-kuantan.js`, `config.js` | Landscape configuration |
| `features.js` | Report cards and shared interaction handling |
| `development*`, `scenario*` | Footprint workflow and forest geometry |
| `connectivity*` | Resistance routing, flow exposure and route display |
| `map-tools.js`, `map-tools.css` | Comparison, measurement, filters and map export |
| `data/` | Compressed patch boundaries and prepared native grids |
| `vendor/` | Pinned browser libraries and their licences |
| `scripts/` | Raster preparation |
| `tests/` | Geometry, routing, reference and browser checks |
| `docs/` | Methods and data provenance |

The site uses Mapbox GL JS 3.1.2. Geometry operations use Turf 6.5.0 and polygon-clipping 0.15.7; native-coordinate conversion uses Proj4js 2.12.1. Map drawing uses Mapbox GL Draw 1.4.3.

## Local review

Serve the repository over HTTP:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. The basemap and place search require an internet connection. Scenario calculations run in browser Web Workers; compressed inputs require a browser supporting DecompressionStream.

Run the geometry and routing tests with Node.js:

```sh
node --test tests/scenario-engine.test.cjs tests/connectivity-engine.test.cjs
```

The independent reference check requires Python with NumPy, SciPy, Shapely and pyproj:

```sh
python tests/verify-connectivity-reference.py
```

Browser checks require Playwright and Chromium:

```sh
node tests/development-browser.cjs
```

These checks use the production analytical datasets with an offline basemap fixture. External hosted tiles and satellite imagery require separate visual review. Optional `SCENARIO_BROWSER_EXECUTABLE`, `SCENARIO_MAPBOX_JS` and `SCENARIO_MAPBOX_CSS` environment variables select cached browser assets.

## Contact and use

Benjamin Galea: [email](mailto:bengalea97@gmail.com) · [ResearchGate](https://www.researchgate.net/profile/Benjamin-Galea)

Patch data and connectivity outputs are made available for non-commercial research and educational use. Please credit the author and cite the associated research when using the data. Third-party libraries retain the licences provided in `vendor/`.

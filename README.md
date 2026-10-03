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

Lower PSQI values indicate more favourable patch structure. The six tiers use within-landscape percentile boundaries at 1%, 15%, 25%, 50% and 75%. Tier 1 also applies a minimum patch-area threshold of 30 ha. Tier titles refer to this structural ranking, rather than an assessment of forest age, species richness or wildlife occupancy.

Land-cover inputs include Dynamic World V1 (2025), the oil-palm extent dataset of Danylo et al. (2021), and MyGDI roads (2021). Baseline connectivity surfaces come from the associated Omniscape analysis.

Development calculations assume complete forest clearance inside a single footprint. Forest loss and remaining fragments use complete polygons, independently of rendered map tiles. Route comparison treats resistance cells touched by development as barriers. These are modelled potential connections, not observations of wildlife movement.

Forest names use named forest and reserve boundaries from OpenStreetMap, dated 2 October 2026. Names are matched by polygon overlap of at least 100 m² and 1% of the patch area. Boundaries sharing a name are combined before calculating coverage. Generic vegetation labels and obvious development or residential labels are excluded. A patch may overlap several named forests; names do not establish legal reserve status. The name lookup files in `data/forest-names/` are derived from © OpenStreetMap contributors and are available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). Name coverage is incomplete.

The repository contains the website and its prepared map data. Native-grid metadata in `data/connectivity/` records the source files, coordinate systems and input hashes.

The site uses Mapbox GL JS 3.1.2. Geometry operations use Turf 6.5.0 and polygon-clipping 0.15.7. Native-coordinate conversion uses Proj4js 2.12.1. Map drawing uses Mapbox GL Draw 1.4.3.

## Contact and use

Benjamin Galea: [email](mailto:bengalea97@gmail.com) · [ResearchGate](https://www.researchgate.net/profile/Benjamin-Galea)

Patch data and connectivity outputs are made available for non-commercial research and educational use. Please credit the author and cite the associated research when using the data.

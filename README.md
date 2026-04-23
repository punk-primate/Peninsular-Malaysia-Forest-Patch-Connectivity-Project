# myforestconnect - Peninsular Malaysia Forest Patch Connectivity

An open-access interactive web platform and analysis pipeline for assessing forest habitat quality and landscape connectivity for arboreal wildlife in urban and peri-urban Peninsular Malaysia.

**Live platform:** [myforestconnect.online](https://myforestconnect.online)

---

## About

This repository contains the complete source code for the myforestconnect web platform, along with the full analytical pipeline used to produce the underlying dataset. The platform provides open public access to patch-level habitat quality and connectivity data for two study landscapes in Peninsular Malaysia: the Klang Valley (greater Kuala Lumpur) and Kuantan (Pahang).

The work is part of a PhD research project at Universiti Sains Malaysia examining structural and functional landscape connectivity for the white-handed gibbon (*Hylobates lar*) across contrasting urban and peri-urban environments.

The accompanying journal paper is currently under review:

> Citation. *myforestconnect: an open-access web platform for assessing forest habitat quality and landscape connectivity for arboreal wildlife in urban Peninsular Malaysia.*

---

## The Platform

The platform hosts data for 11,466 Klang Valley patches and 4,699 Kuantan patches. Users can:

- Explore the spatial distribution of forest patches classified into six conservation tiers based on the Patch Structural Quality Index (PSQI)
- Filter patches by tier or area
- Click any patch to retrieve its tier classification, connectivity rating, distance to the nearest adjacent forest, and underlying structural metric values
- Toggle a corridor overlay showing potential movement pathways between patches, coloured by connectivity level (High / Moderate / Low)
- Filter corridors independently by connectivity class and tier
- Search for any location within the study areas
- Switch between a custom basemap and satellite imagery
- Share a direct link to any map view

The platform is designed for use without specialist GIS knowledge and is intended to support conservation communication in urban planning, environmental impact assessment, and public engagement with green infrastructure decisions.

---

## The PSQI Classification Framework

Each forest patch is classified into one of six conservation tiers using the **Patch Structural Quality Index (PSQI)**, a weighted composite of five patch-scale landscape metrics:

| Metric | Weight | Direction |
|---|---|---|
| Core area (ha) | 0.30 | Higher = better |
| Euclidean nearest-neighbour distance (m) | 0.30 | Lower = better |
| Total area (ha) | 0.20 | Higher = better |
| Contiguity index (0–1) | 0.10 | Higher = better |
| Perimeter–area ratio | 0.10 | Lower = better |

Metrics are independently min-max normalised within each landscape. Lower PSQI scores indicate higher structural quality. Tier boundaries are defined by within-landscape percentile thresholds, with Tier 1 additionally requiring a minimum core area of 30 ha.

| Tier | Name | PSQI percentile |
|---|---|---|
| Tier 1 | Primary forest | Bottom 1% |
| Tier 2 | Established forest | 1–15% |
| Tier 3 | Functional fragment | 15–25% |
| Tier 4 | Vulnerable fragment | 25–50% |
| Tier 5 | Marginal fragment | 50–75% |
| Tier 6 | Remnant patch | Top 25% |

Functional connectivity values are derived from Omniscape circuit-theory modelling reported in the companion study (Galea, in review).

---

## Repository Structure

```
├── index.html                            # Home page
├── klang-valley-map.html                 # Klang Valley map view
├── kuantan-map.html                      # Kuantan map view
├── app.js                                # Application logic (Klang Valley)
├── app-kuantan.js                        # Application logic (Kuantan)
├── config.js                             # Map configuration (Klang Valley)
├── config-kuantan.js                     # Map configuration (Kuantan)
├── style.css                             # Shared styles
└── analysis/
    ├── 01_land_cover_acquisition.py      # Stage 1: GEE land cover acquisition
    ├── 02_patch_psqi_pipeline.R          # Stages 2–3: Patch delineation and PSQI
    ├── 03_omniscape_config_example.ini   # Stage 4: Omniscape configuration
    ├── 04_omniscape_postprocess.R        # Stage 4b: Flow surface post-processing
    ├── 05_generate_connectors.R          # Stage 5: Corridor generation
    └── 06_analysis_figures.R             # Stage 6: Statistical analysis and figures
```

---

## Replicating the Analysis

The complete pipeline can be reproduced for any urban or peri-urban landscape in Peninsular Malaysia, and additional study areas may be incorporated into the platform as the dataset expands. Run the scripts in numerical order — each stage depends on the outputs of the previous one.

**Requirements:**
- Python 3.8+ with `earthengine-api` and `geemap`
- R 4.3+ with `terra`, `sf`, `landscapemetrics`, `tidyverse`, `dunn.test`, `patchwork`
- Julia with `Omniscape.jl`

**Data sources:**
- Dynamic World V1 (Brown et al., 2022)
- Oil palm plantation extent (Danylo et al., 2021)
- Road network: Malaysian Geospatial Data Infrastructure (MyGDI, 2021)

Full documentation is provided in the script headers.

---

## Built With

- [Mapbox GL JS v3.1.2](https://docs.mapbox.com/mapbox-gl-js/)
- [Omniscape.jl](https://docs.circuitscape.org/Omniscape.jl/)
- R (`landscapemetrics`, `terra`, `sf`, `tidyverse`)
- Google Earth Engine via `geemap`

---

## Contact

**Benjamin Galea**
Universiti Sains Malaysia
[bengalea97@gmail.com](mailto:bengalea97@gmail.com)
[ResearchGate](https://www.researchgate.net/profile/Benjamin-Galea)

---

## Licence

Patch data and connectivity outputs are made available for non-commercial research and educational use. Please cite the accompanying paper if you use this platform or pipeline in your work.

// --- MAPBOX CONFIGURATION ---
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYmVuZ2FsZWEiLCJhIjoiY21iNjBvbXp0MWpiejJpb2Vmc3FyeWdweSJ9.9gzKml0FN_5I30w33iqg3A';
const MAP_STYLE_CUSTOM = 'mapbox://styles/bengalea/cmb60zyax00o501sdahv19e6q';
const MAP_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

// --- LAYER & ATTRIBUTE CONFIGURATION ---
const FOREST_PATCH_LAYER_ID = 'Klang Valley Forest Patches';

const TIER_ATTRIBUTE              = 'Tier';
const PATCH_ID_ATTRIBUTE          = 'id';
const PATCH_AREA_ATTRIBUTE        = 'area';
const CORE_AREA_ATTRIBUTE         = 'core';
const CONTIGUITY_INDEX_ATTRIBUTE  = 'contig';
const PERIMETER_AREA_RATIO_ATTRIBUTE = 'para';
const ENN_ATTRIBUTE               = 'enn';

const MEAN_FLOW_ATTRIBUTE         = 'mean_flow';
const PINCH_PCT_ATTRIBUTE         = 'pinch_pct';
const CONNECTIVITY_ATTRIBUTE      = 'connectivity';

const INFO_PANEL_ATTRIBUTES = [
    'Tier', 'id', 'area', 'core', 'contig', 'para', 'enn', 'connectivity', 'mean_flow'
];

// --- TIER CONFIGURATION ---
const ALL_TIERS = [
    "Tier 1 (Core Habitat)",
    "Tier 2 (Major Stepping Stones)",
    "Tier 3 (Connected Fragments)",
    "Tier 4 (Vulnerable Edge Fragments)",
    "Tier 5 (Isolated Fragments)",
    "Tier 6 (Isolated Micro Patches)"
];

const TIER_COLORS = {
    "Tier 1 (Core Habitat)":             "#b1eaac",
    "Tier 2 (Major Stepping Stones)":    "#8ad284",
    "Tier 3 (Connected Fragments)":      "#5aaf64",
    "Tier 4 (Vulnerable Edge Fragments)":"#2a8234",
    "Tier 5 (Isolated Fragments)":       "#1e6b27",
    "Tier 6 (Isolated Micro Patches)":   "#0a4c12"
};

// --- TIER DISPLAY NAMES (shown in UI — data filter values in ALL_TIERS are unchanged) ---
const TIER_DISPLAY_NAMES = {
    "Tier 1 (Core Habitat)":             "Tier 1 (Primary forest)",
    "Tier 2 (Major Stepping Stones)":    "Tier 2 (Established forest)",
    "Tier 3 (Connected Fragments)":      "Tier 3 (Functional fragment)",
    "Tier 4 (Vulnerable Edge Fragments)":"Tier 4 (Vulnerable fragment)",
    "Tier 5 (Isolated Fragments)":       "Tier 5 (Marginal fragment)",
    "Tier 6 (Isolated Micro Patches)":   "Tier 6 (Remnant patch)"
};

// --- CONNECTIVITY CONFIGURATION ---
const ALL_CONNECTIVITY_LABELS = ["High", "Moderate", "Low", "Barrier", "No Data"];

const CONNECTIVITY_COLORS = {
    "High":    "#f7ce46",
    "Moderate":"#e07c1f",
    "Low":     "#a03030",
    "Barrier": "#2c1a4a",
    "No Data": "#888888"
};

let CURRENT_COLOR_MODE = 'tier';

// --- CONNECTOR LAYER CONFIGURATION ---
const CONNECTOR_LAYER_ID = 'Klang_Valley_Connectors';

// --- MAP INITIAL VIEW ---
const INITIAL_CENTER = [101.58, 3.05];
const INITIAL_ZOOM = 11;

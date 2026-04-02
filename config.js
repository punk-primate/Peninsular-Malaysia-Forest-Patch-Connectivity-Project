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

// Connectivity attributes (added from Omniscape outputs)
const MEAN_FLOW_ATTRIBUTE         = 'mean_flow';
const PINCH_PCT_ATTRIBUTE         = 'pinch_pct';
const CONNECTIVITY_ATTRIBUTE      = 'connectivity';

// Attributes to display in the info panel (connectivity block added at end)
const INFO_PANEL_ATTRIBUTES = [
    'Tier',
    'id',
    'area',
    'core',
    'contig',
    'para',
    'enn',
    'connectivity',
    'mean_flow'
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
    "Tier 1 (Core Habitat)":            "#b1eaac",
    "Tier 2 (Major Stepping Stones)":   "#8ad284",
    "Tier 3 (Connected Fragments)":     "#5aaf64",
    "Tier 4 (Vulnerable Edge Fragments)":"#2a8234",
    "Tier 5 (Isolated Fragments)":      "#1e6b27",
    "Tier 6 (Isolated Micro Patches)":  "#0a4c12"
};

// --- CONNECTIVITY CONFIGURATION ---
const ALL_CONNECTIVITY_LABELS = ["High", "Moderate", "Low", "Barrier", "No Data"];

const CONNECTIVITY_COLORS = {
    "High":    "#f7ce46",   // bright yellow — highest current flow
    "Moderate":"#e07c1f",   // orange
    "Low":     "#a03030",   // dark red
    "Barrier": "#2c1a4a",   // very dark purple — near-zero flow zone
    "No Data": "#888888"
};

// Colour mode: 'tier' or 'connectivity'
// Controlled at runtime by the toggle button in the sidebar
let CURRENT_COLOR_MODE = 'tier';

// --- CONNECTOR LAYER CONFIGURATION ---
// This must exactly match the layer name as it appears in your Mapbox Studio style
const CONNECTOR_LAYER_ID = 'Klang_Valley_Connectors';

// --- MAP INITIAL VIEW ---
const INITIAL_CENTER = [101.58, 3.05];
const INITIAL_ZOOM = 11;

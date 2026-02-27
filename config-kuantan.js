// --- MAPBOX CONFIGURATION ---
const MAPBOX_ACCESS_TOKEN = 'YOUR_MAPBOX_TOKEN_HERE';
const MAP_STYLE_CUSTOM = 'mapbox://styles/bengalea/cmb60zyax00o501sdahv19e6q';
const MAP_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

// --- LAYER & ATTRIBUTE CONFIGURATION ---
const FOREST_PATCH_LAYER_ID = 'Kuantan Forest Patches';

// Attribute names (must match your vector tile fields)
const TIER_ATTRIBUTE = 'Tier';
const PATCH_ID_ATTRIBUTE = 'id';
const PATCH_AREA_ATTRIBUTE = 'area';
const CORE_AREA_ATTRIBUTE = 'core';
const CONTIGUITY_INDEX_ATTRIBUTE = 'contig';
const PERIMETER_AREA_RATIO_ATTRIBUTE = 'para';
const ENN_ATTRIBUTE = 'enn';

// Attributes shown in sidebar
const INFO_PANEL_ATTRIBUTES = [
    'Tier',
    'id',
    'area',
    'core',
    'contig',
    'para',
    'enn'
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
    "Tier 1 (Core Habitat)": "#b1eaac",
    "Tier 2 (Major Stepping Stones)": "#8ad284",
    "Tier 3 (Connected Fragments)": "#5aaf64",
    "Tier 4 (Vulnerable Edge Fragments)": "#2a8234",
    "Tier 5 (Isolated Fragments)": "#1e6b27",
    "Tier 6 (Isolated Micro Patches)": "#0a4c12"
};

// --- MAP INITIAL VIEW ---
const INITIAL_CENTER = [103.33, 3.82]; // Kuantan
const INITIAL_ZOOM = 11;

// --- MAPBOX CONFIGURATION ---
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoiYmVuZ2FsZWEiLCJhIjoiY21iNjBvbXp0MWpiejJpb2Vmc3FyeWdweSJ9.9gzKml0FN_5I30w33iqg3A';
const MAP_STYLE_CUSTOM = 'mapbox://styles/bengalea/cmb60zyax00o501sdahv19e6q';
const MAP_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12';

// --- LAYER & ATTRIBUTE CONFIGURATION ---
const FOREST_PATCH_LAYER_ID = ' Klang Valley Forest Patches '; // Update this if your Mapbox Layer ID changed

const TIER_ATTRIBUTE = 'Category (tier)'; 

// CORRECTED ATTRIBUTE NAMES BASED ON DEBUG LOG:
const PATCH_ID_ATTRIBUTE = 'Patch ID';
const PATCH_AREA_ATTRIBUTE = 'Patch area (ha)';
const CORE_AREA_ATTRIBUTE = 'Core area (ha)'; 
const CONTIGUITY_INDEX_ATTRIBUTE = 'Contiguity index'; 
const PERIMETER_AREA_RATIO_ATTRIBUTE = 'Perimeter-area ratio';
const ENN_ATTRIBUTE = 'Euclidean nearest-neighbor distance'; // Added ENN Attribute

// Attributes to display in the info panel (exact names from your data)
const INFO_PANEL_ATTRIBUTES = [
    'Category (tier)',
    'Patch ID',
    'Patch area (ha)',
    'Core area (ha)',
    'Contiguity index',
    'Perimeter-area ratio',
    'Euclidean nearest-neighbor distance' // Added to info panel
];

// --- TIER CONFIGURATION ---
const ALL_TIERS = ["Tier 1 (Core Habitat)", "Tier 2 (Major Stepping Stones)", "Tier 3 (Connected Fragments)", "Tier 4 (Vulnerable Edge Fragments)", "Tier 5 (Isolated Fragments)", "Tier 6 (Isolated Micro Patches)"];

const TIER_COLORS = {
    "Tier 1 (Core Habitat)": "#b1eaac",
    "Tier 2 (Major Stepping Stones)": "#8ad284",
    "Tier 3 (Connected Fragments)": "#5aaf64",
    "Tier 4 (Vulnerable Edge Fragments)": "#2a8234",
    "Tier 5 (Isolated Fragments)": "#1e6b27",
    "Tier 6 (Isolated Micro Patches)": "#0a4c12",
    
};

// --- MAP INITIAL VIEW ---
const INITIAL_CENTER = [101.58, 3.05];
const INITIAL_ZOOM = 11;

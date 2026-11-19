// Shared constants for Palm Bay Heat. Everything here is import-only: no side effects,
// no dependencies, and one source of truth for the world size, palette and tuning.

/** World dimensions in pixels (x right, y down). */
export const WORLD = { W: 4800, H: 3200 };

/** Logical viewport size; the canvas element uses these dimensions. */
export const VIEW = { W: 1280, H: 720 };

/** Sunset palette: golden light, coral/teal/cream cars, deep blue water, pastel buildings. */
export const COLORS = {
  groundGrass: '#879a63',
  groundDowntown: '#6d5b66',
  groundSuburb: '#71805a',

  sand: '#e7c783',
  water: '#2c6f9c',
  waterDeep: '#17476e',

  asphalt: '#3a3941',
  asphaltEdge: '#292830',
  sidewalk: '#cdbda6',
  roadLine: '#f1dcac',
  crosswalk: '#efe7d2',

  buildingShadow: 'rgba(48, 26, 30, 0.30)',
  wallBand: 'rgba(30, 16, 20, 0.18)',
  windowLit: '#ffd98a',
  windowDark: '#4a4b5e',

  BUILDING_COLORS: [
    '#e6a696',
    '#a8c7b5',
    '#e7cf9e',
    '#b6a7d8',
    '#e2b3c6',
    '#9fc9d6',
    '#d8b79a',
    '#c3d18f',
    '#d99a8c',
    '#aeb9d8',
  ],

  palmTrunk: '#7a5230',
  palmLeaf: '#4f7a4a',
  palmLeafDark: '#355736',
  dinerRoof: '#d96b5c',
  pier: '#8a6b4a',

  // The first entry is the hero coral used for the player's car in staged scenes.
  CAR_COLORS: [
    '#ef6b5a',
    '#3fb8af',
    '#f0e2c0',
    '#e8664f',
    '#e8b23a',
    '#5aa9d6',
    '#8ecfa8',
    '#e58fb0',
    '#a99bd6',
    '#4a4f5c',
  ],

  PED_COLORS: [
    '#e05a5a',
    '#4aa3b8',
    '#f0c04a',
    '#7bbf6a',
    '#d98cc0',
    '#6c78c4',
    '#e8a45c',
    '#9ad1d8',
  ],

  playerShirt: '#e8543f',
  playerSkin: '#e0ad82',

  policeBody: '#e8e9ec',
  policeTrim: '#22304a',
  lightRed: '#ff3b46',
  lightBlue: '#3b8cff',

  bullet: '#fff3c4',

  uiPanel: 'rgba(20, 12, 14, 0.82)',
  uiPanelEdge: 'rgba(240, 200, 130, 0.35)',
  uiText: '#f7ecd7',
  uiDim: '#b9a48c',
  accent: '#f2b544',
  danger: '#e25046',
  good: '#5fbf8a',
};

/** Gameplay tuning numbers. Speeds are px/s, angles radians. */
export const TUNE = {
  playerSpeed: 175,
  playerSprint: 268,
  pedSpeed: 55,
  carAccel: 265,
  carMaxSpeed: 345,
  carMaxReverse: 120,
  carTurn: 2.6,
  bulletSpeed: 950,
  bulletLife: 0.55,
  shootCooldown: 0.22,
  worldSeed: 20261119,
};

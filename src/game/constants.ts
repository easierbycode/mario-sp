export default {
  // Depth values
  DEPTH: {
    // Super first plan
    important: 1,
    // Main plan
    foregroundMain: 0,
    // Secondary
    foregroundSecondary: -1,
    // Background
    background: -2,
  },
  // Tilemap main image types
  OBJECT_TYPES: {
    image: 'image',
    static: 'static',
    background: 'background',
  },

  // 8px tiles are used for GB levels
  GB: {
    physics       : 'gb',
    physicsScale  : 1,
    spawn         : { x: 12, y: 44, dir: 'down' },
  },

  // 16px tiles are used for GBA (SMA4) levels — the original mario repo ran
  // these physics unscaled on 16px tiles, so no physicsScale here
  SMA4: {
    physics       : 'sma4',
    physicsScale  : 1,
    // spawn         : { x: 16, y: 384, dir: 'down' },
    spawn         : { x: 16, y: 128, dir: 'down' },
  },

  // Vegas: 16px tiles but GB game-feel — the GB movement profile with all
  // distances doubled, so jumps stay ~4.3 tiles like level1 instead of the
  // SMA4 profile's 5.6+ (too high for the 14-tile-tall casino map)
  VEGAS: {
    physics       : 'gb',
    physicsScale  : 2,
    spawn         : { x: 16, y: 128, dir: 'down' },
  },
}

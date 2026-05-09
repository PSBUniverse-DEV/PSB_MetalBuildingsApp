// ═══════════════════════════════════════════════════════════
// STYLE PROFILES — Single source of truth per building style
//
// Each profile declares everything about a building type:
//   - rendering:    3D structural rules (roof shape, columns, trusses)
//   - defaults:     wall modes, siding direction
//   - blockedFeatures: add-on features excluded from this style (by render_key)
//   - allowedAccessories: which door/window types are valid (null = all)
//
// Keyed by render_key from metal_s_style DB table.
// The configurator loads the selected style's profile and
// dynamically renders only what that profile allows.
// ═══════════════════════════════════════════════════════════

const PROFILES = {
  regular: {
    label: "Regular Carport",
    rendering: {
      curved: true,
      kneeBraces: true,
      eaveOverhangFt: 0.5,
      ridgeCap: false,
      roofPanelDir: "horizontal",
      hasTruss: false,
      hasPurlins: false,
      hasLatticeColumns: false,
    },
    defaults: {
      walls: { front: false, back: false, left: false, right: false },
      wallMode: "open",
    },
    structureDefaults: {
      roofPitch: null,
      roofOverhang: null,
      trusses: "Standard",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 6,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: ["roof_pitch", "roof_overhang"],
    allowedAccessories: null,
  },

  aframe: {
    label: "A-Frame Carport",
    rendering: {
      curved: false,
      kneeBraces: false,
      eaveOverhangFt: 0,
      ridgeCap: true,
      roofPanelDir: "horizontal",
      hasTruss: false,
      hasPurlins: false,
      hasLatticeColumns: false,
    },
    defaults: {
      walls: { front: false, back: false, left: false, right: false },
      wallMode: "open",
    },
    structureDefaults: {
      roofPitch: null,
      roofOverhang: null,
      trusses: "Standard",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 6,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: ["roof_pitch", "roof_overhang"],
    allowedAccessories: null,
  },

  aframe_vertical: {
    label: "A-Frame Vertical Carport",
    rendering: {
      curved: false,
      kneeBraces: false,
      eaveOverhangFt: 0,
      ridgeCap: true,
      roofPanelDir: "vertical",
      hasTruss: false,
      hasPurlins: false,
      hasLatticeColumns: false,
    },
    defaults: {
      walls: { front: false, back: false, left: false, right: false },
      wallMode: "open",
    },
    structureDefaults: {
      roofPitch: "3/12",
      roofOverhang: "6\"",
      trusses: "Standard",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 8,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: [],
    allowedAccessories: null,
  },

  truss: {
    label: "Truss",
    rendering: {
      curved: false,
      kneeBraces: false,
      eaveOverhangFt: 0,
      ridgeCap: true,
      roofPanelDir: "vertical",
      hasTruss: true,
      hasPurlins: true,
      hasLatticeColumns: true,
      hasGirts: true,
    },
    defaults: {
      walls: { front: false, back: false, left: false, right: false },
      wallMode: "open",
    },
    structureDefaults: {
      roofPitch: "3/12",
      roofOverhang: "6\"",
      trusses: "Heavy Duty",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 8,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: [],
    allowedAccessories: null,
  },

  garage: {
    label: "Garage",
    rendering: {
      curved: false,
      kneeBraces: false,
      eaveOverhangFt: 0,
      ridgeCap: true,
      roofPanelDir: "vertical",
      hasTruss: false,
      hasPurlins: false,
      hasLatticeColumns: false,
    },
    defaults: {
      walls: { front: "enclosed", back: "enclosed", left: "enclosed", right: "enclosed" },
      wallMode: "enclosed",
    },
    structureDefaults: {
      roofPitch: "3/12",
      roofOverhang: "6\"",
      trusses: "Standard",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 8,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: [],
    allowedAccessories: null,
  },

  barn: {
    label: "Barn",
    rendering: {
      curved: false,
      kneeBraces: false,
      eaveOverhangFt: 0,
      ridgeCap: true,
      roofPanelDir: "vertical",
      hasTruss: false,
      hasPurlins: false,
      hasLatticeColumns: false,
    },
    defaults: {
      walls: { front: "enclosed", back: "enclosed", left: "enclosed", right: "enclosed" },
      wallMode: "enclosed",
    },
    structureDefaults: {
      roofPitch: "4/12",
      roofOverhang: "6\"",
      trusses: "Standard",
      gauge: "Standard Framing",
      brace: "Standard Brace",
      legHeight: 8,
      installationSurface: "Concrete",
      anchorPackage: "Concrete",
    },
    blockedFeatures: [],
    allowedAccessories: null,
  },
};

// ─── DEFAULT PROFILE (fallback) ─────────────────────────
const DEFAULT_PROFILE = PROFILES.aframe;

/**
 * Get the full style profile by render_key.
 */
export function getStyleProfile(renderKey) {
  if (!renderKey) return DEFAULT_PROFILE;
  const key = renderKey.toLowerCase().replace(/[-\s]/g, "_");
  if (PROFILES[key]) return PROFILES[key];
  if (key.includes("truss")) return PROFILES.truss;
  if (key.includes("vertical")) return PROFILES.aframe_vertical;
  if (key.includes("regular") || (key.includes("carport") && !key.includes("aframe") && !key.includes("a_frame"))) return PROFILES.regular;
  if (key.includes("barn")) return PROFILES.barn;
  if (key.includes("garage")) return PROFILES.garage;
  if (key.includes("aframe") || key.includes("a_frame")) return PROFILES.aframe;
  return DEFAULT_PROFILE;
}

/**
 * Check if a feature (by render_key) is allowed for a style profile.
 */
export function isFeatureAllowed(profile, featureRenderKey) {
  if (!featureRenderKey) return true;
  return !profile.blockedFeatures?.includes(featureRenderKey);
}

/**
 * Check if an accessory type (door, window, etc.) is allowed for a style profile.
 */
export function isAccessoryAllowed(profile, itemType) {
  if (profile.allowedAccessories === null) return true;
  return profile.allowedAccessories.includes(itemType);
}

export default PROFILES;

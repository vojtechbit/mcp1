/**
 * Gmail API Supported Label Color Palette
 *
 * Gmail API only accepts a predefined set of hex colors for label backgrounds and text.
 * Using colors outside this palette will result in a 400 error:
 * "Label color #XXXXXX is not on the allowed color palette"
 *
 * This list is based on the official Gmail API documentation:
 * https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels
 *
 * Note: Colors must be in hex format #RRGGBB (e.g., #000000)
 */

// Grayscale colors
export const GRAY_COLORS = [
  '#000000', // Black
  '#434343', // Dark gray
  '#666666', // Medium dark gray
  '#999999', // Medium gray
  '#cccccc', // Light gray
  '#efefef', // Very light gray
  '#f3f3f3', // Almost white gray
  '#ffffff', // White
  '#464646', // Dark charcoal
  '#e7e7e7', // Light silver
  '#c2c2c2', // Silver
];

// Red/Pink colors
export const RED_COLORS = [
  '#fb4c2f', // Bright red
  '#f6c5be', // Light pink
  '#fcdee8', // Very light pink
  '#efa093', // Salmon
  '#fbc8d9', // Light rose
  '#e66550', // Coral red
  '#f7a7c0', // Pink
  '#cc3a21', // Dark red (used for "nevyřízeno")
  '#e07798', // Rose
  '#ac2b16', // Maroon
  '#b65775', // Dusty rose
  '#822111', // Dark maroon
  '#83334c', // Wine
  '#711a36', // Burgundy
  '#fbd3e0', // Pale pink
  '#8a1c0a', // Dark brick
  '#f2b2a8', // Peach
  '#994a64', // Plum
  '#f691b2', // Light rose
  '#662e37', // Dark wine
  '#ebdbde', // Pale rose
  '#cca6ac', // Dusty pink
];

// Orange colors
export const ORANGE_COLORS = [
  '#ffad47', // Bright orange
  '#ffe6c7', // Light peach
  '#ffd6a2', // Pale orange
  '#ffbc6b', // Light orange
  '#eaa041', // Deep orange
  '#cf8933', // Burnt orange
  '#a46a21', // Brown orange
  '#7a2e0b', // Dark brown
  '#ffc8af', // Soft peach
  '#ff7537', // Vivid orange
  '#ffad46', // Medium orange
];

// Yellow colors
export const YELLOW_COLORS = [
  '#fad165', // Yellow (used for "Follow-up")
  '#fef1d1', // Light cream
  '#fce8b3', // Pale yellow
  '#fcda83', // Light yellow
  '#f2c960', // Golden yellow
  '#d5ae49', // Dark yellow
  '#aa8831', // Olive yellow
  '#7a4706', // Dark gold
  '#ffdeb5', // Cream
  '#594c05', // Dark olive
  '#fbe983', // Bright yellow
  '#684e07', // Bronze
  '#fdedc1', // Light lemon
];

// Green colors
export const GREEN_COLORS = [
  '#16a766', // Green
  '#43d692', // Light green
  '#b9e4d0', // Pale green
  '#c6f3de', // Very light green
  '#89d3b2', // Mint
  '#a0eac9', // Light mint
  '#44b984', // Medium green
  '#68dfa9', // Bright green
  '#149e60', // Forest green
  '#3dc789', // Emerald
  '#0b804b', // Dark green
  '#2a9c68', // Sea green
  '#076239', // Deep green
  '#1a764d', // Hunter green
  '#0b4f30', // Very dark green
  '#b3efd3', // Pale mint
  '#04502e', // Forest
  '#a2dcc1', // Light seafoam
  '#42d692', // Bright seafoam
  '#16a765', // Kelly green
  '#094228', // Dark forest
];

// Blue colors
export const BLUE_COLORS = [
  '#4a86e8', // Blue
  '#c9daf8', // Light blue
  '#a4c2f4', // Pale blue
  '#6d9eeb', // Medium blue
  '#3c78d8', // Navy blue
  '#285bac', // Dark blue
  '#1c4587', // Deep navy
  '#4986e7', // Bright blue
  '#0d3472', // Dark navy
  '#b6cff5', // Sky blue
  '#0d3b44', // Deep teal
  '#98d7e4', // Light cyan
  '#2da2bb', // Cyan
];

// Purple colors
export const PURPLE_COLORS = [
  '#a479e2', // Purple
  '#e4d7f5', // Light lavender
  '#d0bcf1', // Pale purple
  '#b694e8', // Light purple
  '#8e63ce', // Medium purple
  '#653e9b', // Dark purple
  '#41236d', // Deep purple
  '#b99aff', // Lavender
  '#3d188e', // Royal purple
  '#e3d7ff', // Very light purple
];

// Combined palette - all supported colors
export const ALL_SUPPORTED_COLORS = [
  ...GRAY_COLORS,
  ...RED_COLORS,
  ...ORANGE_COLORS,
  ...YELLOW_COLORS,
  ...GREEN_COLORS,
  ...BLUE_COLORS,
  ...PURPLE_COLORS,
];

/**
 * Validates if a color is in the Gmail API supported palette
 * @param {string} color - Hex color code (e.g., '#cc3a21')
 * @returns {boolean} - True if color is supported, false otherwise
 */
export function isGmailColorSupported(color) {
  if (!color || typeof color !== 'string') {
    return false;
  }

  const normalizedColor = color.toLowerCase().trim();
  return ALL_SUPPORTED_COLORS.some(
    supportedColor => supportedColor.toLowerCase() === normalizedColor
  );
}

/**
 * Finds the closest supported Gmail color to a given hex color
 * Uses simple RGB distance calculation
 * @param {string} targetColor - Hex color code (e.g., '#d93025')
 * @returns {string} - Closest supported hex color
 */
export function findClosestGmailColor(targetColor) {
  if (!targetColor || typeof targetColor !== 'string') {
    return '#cc3a21'; // Default to red
  }

  // If already supported, return as-is
  if (isGmailColorSupported(targetColor)) {
    return targetColor;
  }

  // Parse target color RGB
  const targetRgb = hexToRgb(targetColor);
  if (!targetRgb) {
    return '#cc3a21'; // Default to red if parsing fails
  }

  // Find closest color by RGB distance
  let closestColor = '#cc3a21';
  let minDistance = Infinity;

  for (const supportedColor of ALL_SUPPORTED_COLORS) {
    const supportedRgb = hexToRgb(supportedColor);
    if (!supportedRgb) continue;

    const distance = Math.sqrt(
      Math.pow(targetRgb.r - supportedRgb.r, 2) +
      Math.pow(targetRgb.g - supportedRgb.g, 2) +
      Math.pow(targetRgb.b - supportedRgb.b, 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = supportedColor;
    }
  }

  return closestColor;
}

/**
 * Converts hex color to RGB object
 * @param {string} hex - Hex color code (e.g., '#cc3a21')
 * @returns {{r: number, g: number, b: number}|null} - RGB values or null
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Common label color presets based on supported palette
 */
export const GMAIL_LABEL_PRESETS = {
  // Red variations for urgent/important
  RED_DARK: '#cc3a21',
  RED_MEDIUM: '#e66550',
  RED_LIGHT: '#f6c5be',

  // Gray variations for neutral/system
  GRAY_DARK: '#666666',
  GRAY_MEDIUM: '#999999',
  GRAY_LIGHT: '#cccccc',

  // Yellow/Orange for follow-up/pending
  YELLOW: '#fad165',
  ORANGE: '#ffad47',
  GOLD: '#f2c960',

  // Green for completed/success
  GREEN_DARK: '#16a766',
  GREEN_MEDIUM: '#43d692',
  GREEN_LIGHT: '#b9e4d0',

  // Blue for informational
  BLUE_DARK: '#3c78d8',
  BLUE_MEDIUM: '#4a86e8',
  BLUE_LIGHT: '#c9daf8',

  // Purple for special categories
  PURPLE_DARK: '#8e63ce',
  PURPLE_MEDIUM: '#a479e2',
  PURPLE_LIGHT: '#e4d7f5',

  // Black/White for text
  BLACK: '#000000',
  WHITE: '#ffffff',
};

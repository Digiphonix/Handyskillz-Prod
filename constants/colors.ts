/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#1f241a',
    tint: '#506600',
    background: '#f4f6ee',
    foreground: '#1f241a',
    card: '#ffffff',
    cardForeground: '#1f241a',
    primary: '#b9df35',
    primaryForeground: '#1f241a',
    secondary: '#e7ebdf',
    secondaryForeground: '#1f241a',
    muted: '#e7ebdf',
    mutedForeground: '#5c6654',
    accent: '#b9df35',
    accentForeground: '#1f241a',
    destructive: '#b53632',
    destructiveForeground: '#ffffff',
    border: '#d7ddcf',
    input: '#d7ddcf',
  },

  dark: {
    // Legacy aliases (kept for backward compatibility)
    text: '#f6f7ef',
    tint: '#d5f35d',

    // Core surfaces
    background: '#0f100f',
    foreground: '#f6f7ef',

    // Cards / elevated surfaces
    card: '#1b1c1b',
    cardForeground: '#f6f7ef',

    // Primary action color (buttons, links, active states)
    primary: '#d5f35d',
    primaryForeground: '#11120f',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#242523',
    secondaryForeground: '#f6f7ef',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#242523',
    mutedForeground: '#a4a79a',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#d5f35d',
    accentForeground: '#11120f',

    // Destructive actions (delete, error states)
    destructive: '#ff6d68',
    destructiveForeground: '#11120f',

    // Borders and input outlines
    border: '#30312f',
    input: '#30312f',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;

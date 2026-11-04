// Single source of truth for the project's name and look. Anything
// user-visible that says the mod's name, or uses its accent colors,
// should read it from here so a rename is a one-file change.

export const BRAND = Object.freeze({
  name: 'Greenhouse',
  tagline: 'An unofficial client mod for pvzhtbot.com',
  logPrefix: '[Greenhouse]',
  repoUrl: 'https://github.com/KeiraOMG0/pvzhtbot-mod',
  disclaimer:
    'Unofficial and not affiliated with pvzhtbot.com or its owner. Using it violates pvzhtbot.com\'s Terms of Service — use at your own risk.',
});

// Shared palette. Plugins with their own panels should prefer these over
// hard-coded hex values so everything reads as one product.
export const THEME = Object.freeze({
  bg: '#14161a',
  bgRaised: '#1b1e23',
  border: '#2a2d33',
  text: '#eeeeee',
  textMuted: '#9a9a9a',
  accent: '#5fd17a',        // greenhouse green
  accentStrong: '#1f6f3f',
  accentBorder: '#2f5a3a',
  warn: '#e0c96a',
  warnBg: '#2a2410',
  warnBorder: '#4d4420',
  danger: '#ff7b7b',
  dangerBg: '#2a1414',
  dangerBorder: '#5a2f2f',
  font: '13px system-ui, sans-serif',
});

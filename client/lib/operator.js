// Public presentation settings for the single-operator demo.
// This is branding, not company authentication or multi-tenant isolation.
export const operator = Object.freeze({
  name: import.meta.env.VITE_OPERATOR_NAME?.trim() || 'Fleet',
  tagline: import.meta.env.VITE_OPERATOR_TAGLINE?.trim() || 'Your local journey, connected.',
});

# Favicon Fix

## Change

Added a lightweight Noname SVG favicon at `packages/client/public/favicon.svg` and declared it in `packages/client/index.html`.

## Verification

Browser MCP loaded `http://yogastore.localhost:5173/` and confirmed:

- Page title: `Noname`
- Favicon link: `/favicon.svg`
- Browser console errors: 0

The previous recurring `/favicon.ico` 404 is resolved.

Client production build passed. Existing bundle-size warnings remain unchanged.

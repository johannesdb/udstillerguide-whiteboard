# Brand Color Alignment — Whiteboard ← UG Design Guide

## Problem

Whiteboard-projektet bruger ~50+ hardcodede farver (Material Design blue `#2196F3`, generiske grays `#333/#666/#999` osv.) der ikke matcher UG brand-paletten defineret i `udstillerguide-rust/static/css/theme.css`.

## Beslutninger

1. **Farvekilde:** Import theme.css direkte fra hoved-app URL (`https://app.udstillerguide.dk/static/css/theme.css`)
2. **Omfang:** Alt inkl. canvas JS — alle hardcodede farver erstattes med CSS custom properties
3. **Dark mode:** Tilføjes som del af opgaven (theme.css leverer allerede dark mode variabler)
4. **Selection-farve:** Skifter fra Material blue `#2196F3` til brand teal `--brand-primary-base`

## Arkitektur

### 1. Theme CSS Import

`board.html` og `index.html` tilføjer:
```html
<link rel="stylesheet" href="https://app.udstillerguide.dk/static/css/theme.css">
```

### 2. Whiteboard-specifikke CSS Custom Properties

`style.css` definerer canvas-specifikke variabler der arver fra brand:
```css
:root {
  --canvas-bg: var(--brand-bg);
  --selection-color: var(--brand-primary-base);
  --selection-bg: color-mix(in srgb, var(--brand-primary-base) 8%, transparent);
  --toolbar-bg: var(--brand-surface);
  --toolbar-border: var(--brand-border);
  --toolbar-text: var(--brand-text);
  /* Sticky notes forbliver egne farver */
  --sticky-yellow: #FFF176;
  --sticky-pink: #F48FB1;
  --sticky-blue: #81D4FA;
  --sticky-green: #A5D6A7;
  --sticky-purple: #CE93D8;
  --sticky-orange: #FFCC80;
}
```

### 3. Canvas JS — Theme Colors fra CSS

Canvas API kan ikke læse CSS vars direkte. Løsning:
```javascript
loadThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    canvasBg:       s.getPropertyValue('--canvas-bg').trim(),
    selectionColor: s.getPropertyValue('--selection-color').trim(),
    selectionBg:    s.getPropertyValue('--selection-bg').trim(),
    brandText:      s.getPropertyValue('--brand-text').trim(),
    brandTextMuted: s.getPropertyValue('--brand-text-muted').trim(),
    brandBorder:    s.getPropertyValue('--brand-border').trim(),
    brandSurface:   s.getPropertyValue('--brand-surface').trim(),
    brandPrimary:   s.getPropertyValue('--brand-primary-base').trim(),
    brandAccent:    s.getPropertyValue('--brand-accent').trim(),
  };
}
```

Kaldes ved init og ved theme-change event. Alle hardcodede farver i render-koden erstattes med `this.theme.xxx`.

### 4. Dark Mode

- Automatisk via `prefers-color-scheme: dark` (theme.css håndterer)
- Manual toggle via dark mode button der sætter `data-theme="dark"` på `<html>`
- Canvas re-renderer ved theme change

## Farve-mapping

| Gammel farve | Ny variabel | Light | Dark |
|---|---|---|---|
| `#2196F3` (selection) | `--selection-color` → `--brand-primary-base` | #314F59 | #7FBEC6 |
| `#333333` (shapes default) | `--brand-text` | #1d2327 | #d0dce4 |
| `#666` (muted text) | `--brand-text-muted` | #64748b | #A0ABB3 |
| `#f5f5f5` (canvas bg) | `--canvas-bg` → `--brand-bg` | #f8f9fa | #182028 |
| `#ffffff` (surfaces) | `--brand-surface` | #ffffff | #1e2c36 |
| `#e2e8f0` (borders) | `--brand-border` | #e2e8f0 | #354A56 |
| `#f1f5f9` (hover) | `--brand-surface-hover` | #f1f5f9 | #1a2830 |
| `#314F59` (hardcoded teal) | `--brand-primary-base` | #314F59 | #7FBEC6 |
| `#2c2c2c` (toolbar dark bg) | `--brand-surface` | #ffffff | #1e2c36 |

## Filer der ændres

| Fil | Ændring |
|-----|---------|
| `board.html` + `index.html` | Tilføj `<link>` til theme.css |
| `style.css` | Erstat hardcodede farver med CSS vars, tilføj canvas vars, dark mode |
| `canvas.js` | `loadThemeColors()`, erstat alle hardcodede farver |
| `tools.js` | Erstat `#2196F3`, `#333` med theme refs |
| `ui.js` | Erstat hardcodede farver |
| `app.js` | Erstat inline style farver |
| `sync.js` | User presence farver (kan evt. beholdes) |
| `ug-elements.js` | Erstat `#2196F3` med brand teal, grays med theme |
| `ug-layout.js` | Erstat hardcodede farver |
| `ug-panel.js` | Verificer konsistens med brand vars |
| `ug-mock-data.js` | Verificer hal/status-farver mod brand |

## Status-farver

Disse beholdes som de er (semantiske farver til bekræftet/afventer/annulleret):
```javascript
STATUS_FARVER = {
  bekraeftet: '#4CAF50',  // Grøn
  afventer:   '#FF9800',  // Orange
  annulleret: '#f44336',  // Rød
  ledig:      '#9E9E9E',  // Grå
}
```

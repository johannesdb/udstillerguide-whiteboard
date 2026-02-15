# Whiteboard Toolbar: Dark Mode Support

## Baggrund

Toolbar og top-bar er hardcodet til hvide farver. Skal have dark mode CSS så det matcher UG's designsystem fra `udstillerguide-rust/static/css/theme.css`.

## 1. Farvesystem

Adopter UG's eksisterende `--brand-*` CSS custom properties. Variabel-definitionerne kopieres til `backend/static/css/style.css` i en `:root`-blok og en `html.wa-dark`-blok med identiske værdier som udstillerguide-rust.

### Light mode (`:root`)
```css
--brand-primary-base: #314F59;
--brand-primary-hover: #428B98;
--brand-primary-active: #2D444C;
--brand-highlight: #7FBEC6;
--brand-accent: #E07A5F;
--brand-bg: #f8f9fa;
--brand-surface: #ffffff;
--brand-surface-hover: #f1f5f9;
--brand-border: #e2e8f0;
--brand-text: #1d2327;
--brand-text-muted: #64748b;
```

### Dark mode (`html.wa-dark`)
```css
--brand-bg: #182028;
--brand-surface: #1e2c36;
--brand-surface-hover: #1a2830;
--brand-border: #354A56;
--brand-text: #d0dce4;
--brand-text-muted: #A0ABB3;
--brand-primary-base: var(--wa-color-brand-80); /* lysere teal */
--brand-primary-hover: #7FBEC6;
--brand-highlight: #7FBEC6;
```

### Refaktorering

Alle hardcodede hex-farver i toolbar/top-bar/panels erstattes med `var(--brand-*)`:

| Hardcodet | Erstattes med |
|-----------|---------------|
| `#ffffff` (baggrund) | `var(--brand-surface)` |
| `#e2e8f0` (border) | `var(--brand-border)` |
| `#f1f5f9` (hover) | `var(--brand-surface-hover)` |
| `#314F59` (icon/tekst) | `var(--brand-primary-base)` |

Aktiv tool-button (`--brand-primary-base` bg + hvid tekst) virker i begge modes, da `--brand-primary-base` automatisk skifter til lysere teal i dark mode.

### Canvas

Canvas-baggrunden forbliver lys i begge modes. Kun UI-elementer (toolbar, top-bar, panels) skifter. Ligesom Figma — tegnefladen er indholdet, UI'en er rammen.

## 2. Dark Mode Toggle

### Trigger-logik (JS i board.html)

**Ved page load:**
1. Tjek `localStorage.getItem('ug-theme')` for gemt præference
2. Hvis ingen gemt præference: `window.matchMedia('(prefers-color-scheme: dark)')`
3. Sæt/fjern `wa-dark` class på `<html>`

**Toggle-knap i top-bar:**
- Sol/måne-ikon (`sun` / `moon`, sharp-duotone thin) placeret ved siden af share-knappen
- Klik toggler `wa-dark` class og gemmer i `localStorage`
- `matchMedia`-listener opdaterer hvis OS-præference ændres og ingen gemt override

## 3. Scope og filer

### Ændres

**`backend/static/css/style.css`:**
- Tilføj `:root`-blok med `--brand-*` light mode variabler
- Tilføj `html.wa-dark`-blok med dark mode variabler
- Refaktorér hardcodede farver i `#toolbar`, `.tool-btn`, `#top-bar`, `.top-btn`, color/fill/stroke-pickers til `var(--brand-*)`

**`backend/static/board.html`:**
- Tilføj theme toggle-knap i `#top-bar`
- Tilføj theme-detection og toggle JS-logik

### Ændres IKKE

- `canvas.js` — canvas-baggrund forbliver lys
- Plugin-filer — arver automatisk via CSS custom properties
- Andre JS-filer

# Brand Color Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ret alle farver i whiteboard-projektet til at matche UG design guide fra udstillerguide-rust, inkl. dark mode support.

**Architecture:** Importer `theme.css` fra hoved-app URL som single source of truth. Definer whiteboard-specifikke CSS custom properties der arver fra brand-variabler. Canvas JS læser farver fra CSS vars via `getComputedStyle`. Dark mode følger automatisk via `prefers-color-scheme` + manual toggle.

**Tech Stack:** CSS Custom Properties, Canvas 2D API, `getComputedStyle`, `prefers-color-scheme` media query

**Design Doc:** `docs/plans/2026-02-14-brand-colors-alignment-design.md`

**Reference:** UG design guide: `udstillerguide-rust/static/css/theme.css`

---

## Farve-mapping reference

Brug denne tabel til ALLE farve-erstatninger:

| Gammel farve | Ny CSS var | Light value | Dark value |
|---|---|---|---|
| `#2196F3` | `--brand-primary-base` | #314F59 | #7FBEC6 |
| `#1976D2` | `--brand-primary-active` | #2D444C | #2D444C |
| `#333333` / `#333` | `--brand-text` | #1d2327 | #d0dce4 |
| `#555` | `--brand-text` | #1d2327 | #d0dce4 |
| `#666` | `--brand-text-muted` | #64748b | #A0ABB3 |
| `#999` | `--brand-text-muted` | #64748b | #A0ABB3 |
| `#ccc` / `#aaa` | `--brand-border` | #e2e8f0 | #354A56 |
| `#ddd` / `#eee` / `#e2e8f0` | `--brand-border` | #e2e8f0 | #354A56 |
| `#f5f5f5` | `--brand-bg` | #f8f9fa | #182028 |
| `#f0f0f0` / `#f1f5f9` / `#f8f8f8` | `--brand-surface-hover` | #f1f5f9 | #1a2830 |
| `#ffffff` / `white` (surfaces) | `--brand-surface` | #ffffff | #1e2c36 |
| `#e0e0e0` | `--brand-border` | #e2e8f0 | #354A56 |
| `#2c2c2c` (old toolbar bg) | `--brand-surface` | #ffffff | #1e2c36 |
| `#3c3c3c` (old toolbar hover) | `--brand-surface-hover` | #f1f5f9 | #1a2830 |
| `#4a4a4a` (old toolbar active) | `--brand-primary-base` | #314F59 | #7FBEC6 |
| `#e0e0e0` (old toolbar text) | `--brand-text` | #1d2327 | #d0dce4 |
| `#314F59` (hardcoded teal) | `var(--brand-primary-base)` | #314F59 | #7FBEC6 |
| `#c62828` (error red) | `--wa-color-danger-600` | #c62828 | #c62828 |
| `#ffebee` (error bg) | behold som er | — | — |
| `rgba(33, 150, 243, ...)` | brug `--brand-primary-base` med alpha | — | — |

Farver der IKKE ændres:
- Sticky note farver (`#FFF176`, `#F48FB1` etc.) — bruger-valgte farver
- STATUS_FARVER (`#4CAF50`, `#FF9800`, `#f44336`, `#9E9E9E`) — semantiske status-farver
- User presence farver i `sync.js` — kan beholdes som distinkte farver
- Google-logofarver i OAuth knap — brand-specifikke
- `rgba(0,0,0,...)` shadows — neutrale, uændret

---

### Task 1: Tilføj theme.css import i HTML-filer

**Files:**
- Modify: `backend/static/board.html:7-8`
- Modify: `backend/static/index.html:7`

**Step 1: Tilføj theme.css link i board.html**

I `board.html`, tilføj theme.css import FØR style.css (så brand-vars er tilgængelige):

```html
<link rel="stylesheet" href="https://app.udstillerguide.dk/static/css/theme.css">
<link rel="stylesheet" href="/vendor/webawesome/styles/webawesome.css?v=4">
<link rel="stylesheet" href="/css/style.css?v=4">
```

**Step 2: Tilføj theme.css link i index.html**

```html
<link rel="stylesheet" href="https://app.udstillerguide.dk/static/css/theme.css">
<link rel="stylesheet" href="/css/style.css?v=4">
```

**Step 3: Verificer at siderne loader**

Start dev-serveren og åbn begge sider i browser. Verificer at theme.css loades (check Network tab). Siderne skal se uændrede ud endnu.

**Step 4: Commit**

```bash
git add backend/static/board.html backend/static/index.html
git commit -m "feat: import UG theme.css from main app for brand color consistency"
```

---

### Task 2: Opdater CSS custom properties i style.css

**Files:**
- Modify: `backend/static/css/style.css:8-31` (duotone + :root block)

**Step 1: Erstat :root variablerne med brand-baserede vars**

Erstat linje 8-31 i `style.css` med:

```css
/* === Duotone icon — teal primary, coral secondary (UG brand) === */
wa-icon[family="sharp-duotone"][variant="thin"] {
    --primary-opacity: 1;
    --primary-color: var(--brand-primary-base, #314F59);
    --secondary-opacity: 1;
    --secondary-color: var(--brand-accent, #E07A5F);
}

:root {
    /* Toolbar — nu brand-farver i stedet for mørk UI */
    --toolbar-bg: var(--brand-surface, #ffffff);
    --toolbar-hover: var(--brand-surface-hover, #f1f5f9);
    --toolbar-active: var(--brand-primary-base, #314F59);
    --toolbar-text: var(--brand-text, #1d2327);
    --toolbar-border: var(--brand-border, #e2e8f0);

    /* Canvas */
    --canvas-bg: var(--brand-bg, #f8f9fa);

    /* Selection — brand teal, ikke Material blue */
    --selection-color: var(--brand-primary-base, #314F59);
    --selection-bg: color-mix(in srgb, var(--brand-primary-base, #314F59) 8%, transparent);

    /* Sticky notes — bruger-valgte farver, uændret */
    --sticky-yellow: #FFF176;
    --sticky-pink: #F48FB1;
    --sticky-blue: #81D4FA;
    --sticky-green: #A5D6A7;
    --sticky-purple: #CE93D8;
    --sticky-orange: #FFCC80;

    /* Shadows */
    --shadow: 0 2px 8px rgba(0,0,0,0.15);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.2);
}
```

**Step 2: Erstat alle hardcodede farver i style.css**

Gå systematisk igennem ALLE hardcodede farver i style.css og erstat med CSS vars. Se farve-mapping tabellen øverst. Vigtigste erstatninger:

- `#ffffff` (surface backgrounds) → `var(--brand-surface)`
- `#e2e8f0` (borders) → `var(--brand-border)`
- `rgba(0,0,0,0.08)` (shadows) → behold (neutral shadow)
- `#314F59` (hardcoded teal) → `var(--brand-primary-base)`
- `#f1f5f9` (hover bg) → `var(--brand-surface-hover)`
- `#333` (text) → `var(--brand-text)`
- `#666` (muted text) → `var(--brand-text-muted)`
- `#999` (subtle text) → `var(--brand-text-muted)`
- `#ddd` (borders) → `var(--brand-border)`
- `#eee` (light borders) → `var(--brand-border)`
- `#f0f0f0` (hover bg) → `var(--brand-surface-hover)`
- `var(--selection-blue)` → `var(--selection-color)` (alle steder)
- `#1976D2` (btn hover) → `var(--brand-primary-hover)`
- `#e0e0e0` (secondary btn) → `var(--brand-border)`
- `#ccc` (scrollbar) → `var(--brand-border)`
- `#aaa` (scrollbar hover) → `var(--brand-text-muted)`
- `white` (text on dark) → behold for contrast-tekst (fx `.tool-btn.active color`)
- `#c62828` (error) → behold (semantisk farve)
- `#ffebee` (error bg) → behold (semantisk farve)
- `#ef9a9a` (error border) → behold (semantisk farve)
- `rgba(33, 150, 243, 0.08)` → `var(--selection-bg)`

For `.btn-primary`:
```css
.btn-primary {
    background: var(--brand-primary-base);
    /* ... */
}
.btn-primary:hover {
    background: var(--brand-primary-hover);
}
```

For `.btn-secondary`:
```css
.btn-secondary {
    background: var(--brand-border);
    color: var(--brand-text);
}
.btn-secondary:hover {
    background: var(--brand-text-muted);
    color: var(--brand-surface);
}
```

For connector config panel (brugte mørkt theme, nu brand):
```css
#connector-config {
    background: var(--brand-surface);
    color: var(--brand-text);
}
```

For plugin sidebar:
```css
#plugin-sidebar::part(panel) {
    background: var(--brand-surface);
}
#plugin-sidebar-header {
    border-bottom: 1px solid var(--brand-border);
}
```

For legacy toast:
```css
.toast {
    background: var(--brand-primary-base);
    /* ... */
}
```

**Step 3: Verificer at CSS-ændringerne ikke bryder layout**

Åbn board.html i browser. Tjek:
- Toolbar ser korrekt ud
- Top bar vises korrekt
- Context menu fungerer
- Color picker panels vises
- Dashboard (index.html) ser korrekt ud

**Step 4: Commit**

```bash
git add backend/static/css/style.css
git commit -m "feat: replace all hardcoded CSS colors with UG brand custom properties"
```

---

### Task 3: Canvas JS — tilføj loadThemeColors + erstat render-farver

**Files:**
- Modify: `backend/static/js/canvas.js`

Denne er den STØRSTE task. Canvas.js har ~30 hardcodede farver spredt i render-funktionerne.

**Step 1: Tilføj loadThemeColors metode til WhiteboardApp**

Find WhiteboardApp constructor og tilføj efter property-initialisering:

```javascript
// I constructor, efter andre initialiseringer:
this.theme = this.loadThemeColors();

// Lyt efter theme-ændringer
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    this.theme = this.loadThemeColors();
    this.render();
});
document.addEventListener('theme-change', () => {
    this.theme = this.loadThemeColors();
    this.render();
});
```

Tilføj metoden:

```javascript
loadThemeColors() {
    try {
        const s = getComputedStyle(document.documentElement);
        const get = (prop) => s.getPropertyValue(prop).trim();
        return {
            canvasBg:       get('--canvas-bg') || '#f8f9fa',
            selectionColor: get('--selection-color') || '#314F59',
            selectionBg:    get('--selection-bg') || 'rgba(49, 79, 89, 0.08)',
            brandText:      get('--brand-text') || '#1d2327',
            brandTextMuted: get('--brand-text-muted') || '#64748b',
            brandBorder:    get('--brand-border') || '#e2e8f0',
            brandSurface:   get('--brand-surface') || '#ffffff',
            brandSurfaceHover: get('--brand-surface-hover') || '#f1f5f9',
            brandPrimary:   get('--brand-primary-base') || '#314F59',
            brandPrimaryHover: get('--brand-primary-hover') || '#428B98',
            brandAccent:    get('--brand-accent') || '#E07A5F',
            brandBg:        get('--brand-bg') || '#f8f9fa',
        };
    } catch (e) {
        errorHandler.handleError(e, { context: 'loadThemeColors' });
        return {
            canvasBg: '#f8f9fa', selectionColor: '#314F59', selectionBg: 'rgba(49,79,89,0.08)',
            brandText: '#1d2327', brandTextMuted: '#64748b', brandBorder: '#e2e8f0',
            brandSurface: '#ffffff', brandSurfaceHover: '#f1f5f9', brandPrimary: '#314F59',
            brandPrimaryHover: '#428B98', brandAccent: '#E07A5F', brandBg: '#f8f9fa',
        };
    }
}
```

**Step 2: Erstat alle hardcodede farver i render-metoder**

Søg igennem HELE canvas.js og erstat hardcodede farver. Brug `this.theme.xxx` i stedet. Nøgle-erstatninger:

| Søg efter | Erstat med |
|---|---|
| `'#f5f5f5'` (canvas bg) | `this.theme.canvasBg` |
| `'#ccc'` (grid bg) | `this.theme.brandBorder` |
| `'#f0f0f0'` (grid fill) | `this.theme.brandSurfaceHover` |
| `'#999'` (grid text) | `this.theme.brandTextMuted` |
| `'#ddd'` (ruler) | `this.theme.brandBorder` |
| `'#333'` / `'#333333'` (text/stroke default) | `this.theme.brandText` |
| `el.color \|\| '#333'` | `el.color \|\| this.theme.brandText` |
| `el.color \|\| '#333333'` | `el.color \|\| this.theme.brandText` |
| `el.fill \|\| '#FFFFFF'` | `el.fill \|\| this.theme.brandSurface` |
| `el.borderColor \|\| '#cccccc'` | `el.borderColor \|\| this.theme.brandBorder` |
| `'#2196F3'` (selection) | `this.theme.selectionColor` |
| `'rgba(33, 150, 243, ...'` (selection bg) | `this.theme.selectionBg` |
| `cursor.color \|\| '#F44336'` | behold (user presence farve) |
| `'rgba(0,0,0,0.15)'` (shadows) | behold (neutral shadow) |
| `'rgba(0,0,0,0.06)'` (sticky highlight) | behold (neutral) |
| `'rgba(255,255,255,0.9)'` (connector label bg) | `this.theme.brandSurface + 'e6'` eller behold |

Ændr OGSÅ `this.currentColor` default:
```javascript
// Was: this.currentColor = '#333333'
this.currentColor = '#333333'; // Behold — dette er bruger-valgt farve, ikke theme
```

BEMÆRK: `this.currentColor` og `this.stickyColor` er BRUGER-valgte farver og skal IKKE ændres til theme-farver. De er hvad brugeren har valgt at tegne med.

**Step 3: Test canvas rendering**

Åbn et board og verificer:
- Canvas baggrund matcher `--brand-bg`
- Grid tegnes med brand-farver
- Shapes bruger korrekte default-farver
- Selection handles er teal
- Selection box er teal med alpha
- Sticky notes vises korrekt
- Text renders korrekt
- Connectors og labels renders korrekt

**Step 4: Commit**

```bash
git add backend/static/js/canvas.js
git commit -m "feat: canvas reads theme colors from CSS vars, replaces hardcoded colors"
```

---

### Task 4: Erstat farver i tools.js

**Files:**
- Modify: `backend/static/js/tools.js`

**Step 1: Tilføj theme-reference**

Tools.js har adgang til `this.app` (WhiteboardApp instans). Brug `this.app.theme.xxx` til at referere theme-farver.

**Step 2: Erstat hardcodede farver**

Søg tools.js for disse erstatninger:

| Søg | Erstat |
|---|---|
| `'rgba(33, 150, 243, 0.5)'` | brug `this.app.theme.selectionColor` med alpha |
| `'#2196F3'` (connector handle) | `this.app.theme.selectionColor` |
| `'rgba(33, 150, 243, 0.08)'` | `this.app.theme.selectionBg` |
| `'#333333'` (text defaults) | behold (bruger-default farve, ikke theme) |
| `'#FFFFFF'` (text fill) | behold (bruger-default for tekstboks) |
| `'#cccccc'` (text border) | behold (bruger-default for tekstboks) |

VIGTIGT: Farver der bruges som DEFAULT for nye elementer (currentColor, sticky farve) er BRUGER-valgte og beholdes. Kun UI-farver (selection, handles) erstattes med theme.

**Step 3: Commit**

```bash
git add backend/static/js/tools.js
git commit -m "feat: tools.js uses theme colors for selection and UI elements"
```

---

### Task 5: Erstat farver i ui.js og app.js

**Files:**
- Modify: `backend/static/js/ui.js`
- Modify: `backend/static/js/app.js`

**Step 1: Erstat farver i app.js**

app.js har inline styles med hardcodede farver. Erstat:

| Søg | Erstat |
|---|---|
| `color:#666` | `color:var(--brand-text-muted)` |
| `color:#999` | `color:var(--brand-text-muted)` |
| `color:#c62828` | behold (error farve) |
| `stroke="#ccc"` | `stroke="var(--brand-border)"` (hvis SVG i DOM) eller behold |

**Step 2: Erstat farver i ui.js**

ui.js bruger allerede Web Awesome variabler (`--wa-color-neutral-500` etc.) — disse er OK. Erstat kun:

| Søg | Erstat |
|---|---|
| `'#FFF176'` (default sticky) | behold (bruger-valgt farve) |
| Evt. andre hardcodede farver | Se farve-mapping |

**Step 3: Commit**

```bash
git add backend/static/js/ui.js backend/static/js/app.js
git commit -m "feat: ui.js and app.js use brand color variables"
```

---

### Task 6: Erstat farver i UG plugin-filer

**Files:**
- Modify: `backend/static/js/plugins/ug-elements.js`
- Modify: `backend/static/js/plugins/ug-layout.js`
- Modify: `backend/static/js/plugins/ug-panel.js`

**Step 1: ug-elements.js**

UG elements tegner canvas-elementer. De har adgang til `app` via render-funktionernes `ctx`/`app` parameter. Erstat:

| Søg | Erstat |
|---|---|
| `'rgba(33, 150, 243, 0.06)'` (hall fill) | brug `--brand-primary-base` med alpha |
| `'#2196F3'` (hall stroke, stand, exhibitor) | `app.theme.brandPrimary` |
| `'#FFFFFF'` (card bg, label bg) | `app.theme.brandSurface` |
| `'#E0E0E0'` (borders) | `app.theme.brandBorder` |
| `'#333'` (text) | `app.theme.brandText` |
| `'#666'` (muted text) | `app.theme.brandTextMuted` |
| `'rgba(0,0,0,0.1)'` (shadow) | behold |
| `'#9E9E9E'` (fallback) | behold (neutral fallback) |
| STATUS_FARVER references | behold (semantiske status-farver) |

**Step 2: ug-layout.js**

| Søg | Erstat |
|---|---|
| `'#666'` (connector) | brug `--brand-text-muted` (via CSS var eller hardcoded brand value) |
| `'#9C27B0'` (taxonomy root) | `--brand-accent` (#E07A5F — coral) |
| `'#CE93D8'` (taxonomy child) | `--brand-highlight` (#7FBEC6 — light teal) |
| `'#999'` (connector) | brug brand text muted |
| `'#333'` (default) | brug brand text |

BEMÆRK: ug-layout.js genererer elementer der renderes af canvas. Farverne her er element-data, ikke direkte canvas draws. De sættes som `color` property på elementer og bruges senere af canvas renderer.

**Step 3: ug-panel.js**

Verificer at panel allerede bruger `var(--wa-color-neutral-*)` konsekvent. Erstat eventuelle hardcodede farver med brand-vars.

**Step 4: Commit**

```bash
git add backend/static/js/plugins/ug-elements.js backend/static/js/plugins/ug-layout.js backend/static/js/plugins/ug-panel.js
git commit -m "feat: UG plugin uses brand colors instead of Material Design blue"
```

---

### Task 7: Opdater board.html farve-swatches

**Files:**
- Modify: `backend/static/board.html:144-145`

**Step 1: Opdater stroke color swatches**

Erstat Material blue i stroke swatches:

```html
<wa-color-picker id="stroke-color-wa" value="#1d2327" size="small" label="Stroke color"
    swatches="#1d2327; #314F59; #E07A5F; #4CAF50; #FF9800; #9C27B0; #FFFFFF"
    hoist></wa-color-picker>
```

Ændringer:
- Default `#333333` → `#1d2327` (brand text)
- `#F44336` → `#E07A5F` (brand accent coral i stedet for Material red)
- `#2196F3` → `#314F59` (brand teal i stedet for Material blue)

**Step 2: Commit**

```bash
git add backend/static/board.html
git commit -m "feat: color picker swatches use UG brand colors"
```

---

### Task 8: Dark mode toggle + canvas re-render

**Files:**
- Modify: `backend/static/board.html` (tilføj toggle-knap)
- Modify: `backend/static/css/style.css` (dark mode canvas styles)

**Step 1: Tilføj dark mode toggle i top bar**

I board.html, tilføj en dark mode toggle-knap i `#top-bar`:

```html
<button class="top-btn" id="btn-theme-toggle">
    <wa-icon name="moon" family="sharp-duotone" variant="thin"></wa-icon>
</button>
<wa-tooltip for="btn-theme-toggle" placement="bottom">Toggle dark mode</wa-tooltip>
```

**Step 2: Tilføj dark mode script**

Tilføj i `<script>` blokken i board.html:

```javascript
// Dark mode toggle
const themeToggle = document.getElementById('btn-theme-toggle');
const themeIcon = themeToggle?.querySelector('wa-icon');

function setTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (themeIcon) themeIcon.name = dark ? 'sun-bright' : 'moon';
    localStorage.setItem('ug-theme', dark ? 'dark' : 'light');
    document.dispatchEvent(new CustomEvent('theme-change'));
}

// Init from saved preference or system
const saved = localStorage.getItem('ug-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (saved === 'dark' || (!saved && prefersDark)) setTheme(true);

themeToggle?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
});
```

**Step 3: Tilføj dark mode CSS overrides for canvas-specifikke elementer**

I style.css, tilføj i bunden:

```css
/* === Dark Mode overrides for canvas UI === */
[data-theme="dark"] {
    --canvas-bg: var(--brand-bg);
    --selection-color: var(--brand-primary-base);
    --selection-bg: color-mix(in srgb, var(--brand-primary-base) 8%, transparent);
}

/* Tilsvarende for sticky notes i dark mode */
[data-theme="dark"] .selection-box {
    border-color: var(--selection-color);
    background: var(--selection-bg);
}
```

BEMÆRK: De fleste overrides håndteres allerede af `theme.css` fra hoved-appen, som definerer `[data-theme="dark"]` regler for alle brand-variabler. Whiteboard behøver kun at tilføje canvas-specifikke overrides.

**Step 4: Test dark mode**

- Klik toggle — hele UI skifter til dark
- Canvas baggrund bliver mørk
- Toolbar, top bar, panels skifter korrekt
- Selection handles skifter til light teal
- Sticky notes forbliver farverige
- Text på canvas er læseligt

**Step 5: Commit**

```bash
git add backend/static/board.html backend/static/css/style.css
git commit -m "feat: add dark mode toggle with automatic theme detection"
```

---

### Task 9: Tilføj dark mode til index.html (dashboard)

**Files:**
- Modify: `backend/static/index.html`

**Step 1: Tilføj dark mode support**

Tilsvarende toggle og script som board.html. Sørg for at dashboard-elementer (cards, buttons, text) respekterer brand-variabler.

**Step 2: Commit**

```bash
git add backend/static/index.html
git commit -m "feat: dashboard dark mode support"
```

---

### Task 10: Verificer og test alt end-to-end

**Step 1: Start dev-serveren**

```bash
cd backend && cargo run
```

**Step 2: Test light mode**

Åbn browser og verificer:
- [ ] Dashboard (index.html): farver matcher brand
- [ ] Board (board.html): canvas, toolbar, top bar, panels
- [ ] Color pickers: swatches viser brand-farver
- [ ] Context menu: brand-farver
- [ ] Connector config panel: brand-farver (ikke mørk UI)
- [ ] UG plugin panel: konsistent med brand
- [ ] UG elements på canvas: teal i stedet for Material blue

**Step 3: Test dark mode**

Klik dark mode toggle og verificer:
- [ ] Canvas baggrund er mørk (#182028)
- [ ] Toolbar og top bar er mørke surfaces
- [ ] Text er lyse
- [ ] Selection er light teal (#7FBEC6)
- [ ] Sticky notes forbliver farverige
- [ ] Connector config bruger brand-mørke farver

**Step 4: Test prefers-color-scheme**

Toggle system dark mode og verificer at whiteboard følger automatisk (når ingen manual toggle er sat).

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete brand color alignment with UG design guide + dark mode"
```

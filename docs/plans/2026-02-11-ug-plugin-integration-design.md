# UG Plugin Integration Design

## Context

Whiteboardet er et standalone Rust/Axum produkt med Yjs CRDT-baseret
real-time collaboration. UdstillerGuide Core skal bygges som en separat
Rust-service der ejer messe-data (haller, stande, udstillere, taxonomier).

Whiteboardet skal kunne integrere med Core via et generisk plugin-system,
hvor UG-pluginet er den første plugin. Andre plugins kan tilfoeje andre
domaener (opgavestyring, mindmaps, etc.).

## Arkitektur

```
Whiteboard (Rust/Axum) - standalone produkt
  ├── Canvas Engine (eksisterende)
  ├── Plugin Registry (nyt)
  │     ├── UG Plugin (foerste plugin)
  │     ├── [Task Plugin] (fremtidig)
  │     └── [... flere]
  ├── WebSocket + Yjs CRDT (eksisterende)
  └── PostgreSQL (eksisterende)

UG Core (Rust) - separat service, bygges senere
  ├── REST API (messer, haller, stande, taxonomier)
  └── PostgreSQL (egen database)
```

Whiteboardet og Core er separate deployments. Core ejer al messe-data.
Whiteboardet er en visuel editor der laeser/skriver via Core's REST API.

## Plugin-system

Plugin-systemet lever primaert i frontend-JS. Backenden behoever minimal
aendring - blot at servere plugin-filer.

### Plugin-interface

```js
WhiteboardPlugins.register('udstillerguide', {
  // Custom element-typer
  elementTypes: {
    'ug-hal':       { render, hitTest, defaults },
    'ug-stand':     { render, hitTest, defaults },
    'ug-udstiller': { render, hitTest, defaults },
  },

  // Sidebar-panel med domaene-specifik UI
  panel: {
    title: 'Udstillerguide',
    render: (container) => { /* byg panel-UI */ }
  },

  // Toolbar-knapper
  tools: [
    { id: 'ug-import', icon: 'import', label: 'Importer messe', action: fn },
    { id: 'ug-sync',   icon: 'sync',   label: 'Synkroniser',    action: fn },
  ],

  // Lifecycle hooks
  onElementUpdate: (element) => { /* send aendring til Core API */ },
  onBoardLoad:     (board)   => { /* hent data fra Core */ },
});
```

### Plugin Registry

```js
class WhiteboardPlugins {
  static plugins = new Map();

  static register(name, plugin) {
    this.plugins.set(name, plugin);
    this._registerElementTypes(plugin.elementTypes);
    this._registerPanel(plugin.panel);
    this._registerTools(plugin.tools);
  }
}
```

Registrerede element-typer integreres i det eksisterende canvas engine:
- `render` funktionen kaldes fra canvas draw-loopet
- `hitTest` bruges til klik-detektion
- `defaults` giver standardvaerdier ved oprettelse

## Custom element-typer

### ug-hal (hal/container)

Stort rektangel der fungerer som container for stande.

```js
{
  id: "el_...",
  type: "ug-hal",
  x: 100, y: 100,
  width: 600, height: 400,
  color: "#2196F3",
  fill: "rgba(33, 150, 243, 0.08)",
  content: "Hal A",
  fontSize: 24,
  external: { id: "uuid", type: "hal", syncStatus: "synced", data: {...} }
}
```

Rendering: Rektangel med tynd border, let baggrund, navn i toppen.
Child-stande placeres visuelt inden i hallens bounds.

### ug-stand (stand/booth)

Rektangel inden i en hal med standnummer, udstiller, og status-farve.

```js
{
  id: "el_...",
  type: "ug-stand",
  x: 120, y: 160,
  width: 120, height: 80,
  color: "#4CAF50",     // status-farve
  content: "A01\nFirma X",
  external: {
    id: "uuid", type: "stand", syncStatus: "synced",
    data: { standnummer: "A01", udstiller: "Firma X", status: "bekraeftet", hal_id: "..." }
  }
}
```

Status-farver:
- Groen (#4CAF50): bekraeftet
- Orange (#FF9800): afventer
- Roed (#f44336): annulleret
- Graa (#9E9E9E): ledig

### ug-udstiller (exhibitor)

Kort/sticky-note med firmainfo.

```js
{
  id: "el_...",
  type: "ug-udstiller",
  x: 120, y: 160,
  width: 160, height: 100,
  content: "Firma X\nKontakt: John\nModuler: 3",
  external: {
    id: "uuid", type: "udstiller", syncStatus: "synced",
    data: { firmanavn: "Firma X", kontakt: "John", moduler: [...] }
  }
}
```

## Visualisering

To views genereres automatisk paa canvas, side om side.

### View 1: Spatial gulvplan

Haller som store containere med stande placeret inden i.

```
+---------------- Hal A -----------------+
|  +----------+  +----------+  +-------+ |
|  | Stand A01|  | Stand A02|  |  A03  | |
|  | Firma X  |  |  LEDIG   |  |Firma Y| |
|  +----------+  +----------+  +-------+ |
|  +--------------+  +---------------+   |
|  |   Stand A04   |  |   Stand A05  |   |
|  |   Firma Z     |  |    LEDIG     |   |
|  +--------------+  +---------------+   |
+-----------------------------------------+
```

Features:
- Drag-and-drop stande mellem haller
- Dobbeltklik aabner redigeringspanel
- Status-farver paa stande
- Hal-navne i toppen

### View 2: Hierarki/taxonomi-diagram

Traediagram med forbindelseslinjer via eksisterende connector-system.

```
        +----------+
        |  Messe X |
        +----+-----+
       +-----+------+
       v     v      v
    +-----++-----++------+
    |Hal A||Hal B||Hal C |
    +--+--++--+--++------+
       v      v
  +--------+ +--------+
  |Program | |Kategori|
  |- Sem.  | |- IT    |
  |- Works.| |- Food  |
  +--------+ +--------+
```

Features:
- Automatisk layout via simpel trae-algoritme
- Klikbare og redigerbare noder
- Bruger whiteboard'ets connector-system
- Taxonomi-noder kan foldes ud/ind

### Auto-generering

Naar UG-pluginet henter data (fra Core eller mock), genererer det begge
views som whiteboard-elementer:

1. Beregn positioner for gulvplan (haller side om side, stande i grid)
2. Beregn positioner for hierarki (trae-layout)
3. Opret elementer via standard whiteboard API
4. Tilfoej connectors for hierarki-forbindelser

## Synkronisering

### Flow

```
  Whiteboard                         UG Core
     |                                  |
     |  1. GET /api/messe/{id}/full     |
     | -------------------------------->|
     |  <- haller, stande, taxonomier   |
     |                                  |
     |  2. Auto-generer whiteboard-     |
     |     elementer fra data           |
     |                                  |
     |  [Bruger redigerer en stand]     |
     |                                  |
     |  3. PUT /api/stande/{id}         |
     | -------------------------------->|
     |  <- validated + saved            |
     |                                  |
     |  4. Opdater element med          |
     |     confirmed status             |
```

### Element metadata

Synkroniserede elementer har et `external` felt:

```js
{
  id: "el_12345",          // whiteboard-id
  type: "ug-stand",        // plugin element-type
  // ... position, size, etc.
  external: {
    id: "uuid-fra-core",     // Core's ID
    type: "stand",           // Core's entity-type
    syncStatus: "synced",    // synced | pending | conflict | local-only
    lastSynced: "2026-02-11T...",
    data: {                  // Core's data snapshot
      standnummer: "A01",
      udstiller: "Firma X",
      status: "bekraeftet",
      hal_id: "uuid-hal-a"
    }
  }
}
```

### Sync-status visuel feedback

- Groen indikator: `synced` - data matcher Core
- Gul indikator: `pending` - aendring sendt, ikke bekraeftet
- Roed indikator: `conflict` - Core har afvist aendringen
- Graa indikator: `local-only` - kun i whiteboard (mock/offline)

## Implementeringsplan (v1 - mock data)

### Fase 1: Plugin Registry

Tilfoej et generisk plugin-system til whiteboard frontend:

1. `WhiteboardPlugins` klasse med `register()` metode
2. Hook ind i canvas render-loop for custom element-typer
3. Hook ind i tool manager for custom tools
4. Sidebar-panel system for plugin-UI
5. Element lifecycle hooks (create, update, delete)

### Fase 2: UG Plugin med mock-data

Byg UG-pluginet med hardcoded demo-data:

1. Definer mock messe-data (2 haller, 8 stande, taxonomier)
2. Implementer `ug-hal` render/hitTest
3. Implementer `ug-stand` render/hitTest med status-farver
4. Implementer `ug-udstiller` render/hitTest
5. Auto-generering af spatial gulvplan fra mock-data
6. Auto-generering af hierarki-diagram fra mock-data
7. Redigeringspanel ved dobbeltklik paa element

### Fase 3: Plugin UI

1. Sidebar-panel med messe-oversigt
2. Import-knap (laes mock-data og generer views)
3. Stand-liste med filtrering
4. Status-oversigt (antal bekraeftet/ledig/afventer)

### Fase 4: Core integration (fremtidig)

Naar UG Core eksisterer:

1. Erstat mock-data med REST API kald
2. Implementer sync-flow (hent, opdater, opret)
3. Sync-status indikatorer
4. Fejlhaandtering og retry
5. Optimistic updates med rollback ved fejl

## Filer der skal aendres/oprettes

### Nye filer

- `backend/static/js/plugins.js` - Plugin Registry
- `backend/static/js/plugins/ug-plugin.js` - UG Plugin
- `backend/static/js/plugins/ug-elements.js` - Custom element render/hitTest
- `backend/static/js/plugins/ug-layout.js` - Auto-generering af views
- `backend/static/js/plugins/ug-mock-data.js` - Demo messe-data
- `backend/static/js/plugins/ug-panel.js` - Sidebar panel UI

### Eksisterende filer der aendres

- `backend/static/js/canvas.js` - Hook for custom element-typer i render/hitTest
- `backend/static/js/tools.js` - Hook for custom tools
- `backend/static/js/ui.js` - Sidebar panel-system for plugins
- `backend/static/board.html` - Script-tags for nye filer

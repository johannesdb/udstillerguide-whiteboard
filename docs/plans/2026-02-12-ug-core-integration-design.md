# UG Core Integration Design

> Dato: 2026-02-12
> Status: Godkendt design — klar til implementeringsplan

## Beslutninger

| Emne | Beslutning |
|------|-----------|
| API-kontrakt | Vi designer begge sider (whiteboard + UG Core) |
| Sync-retning | Two-way: whiteboard læser og skriver til UG Core |
| Autentificering | Service-to-service API-nøgle per installation + user-id i header |
| Scope | Én messe per board (1:1) |
| Konflikter | UG Core vinder — bruger notificeres |
| Synced entiteter | Haller, stande, udstillere, taxonomier/kategorier |

## Arkitektur

```
┌─────────────────┐       ┌───────────────────┐       ┌──────────────┐
│  Browser         │       │ Whiteboard Backend │       │  UG Core API │
│  (JS Plugin)     │◄─────►│  (Rust/Axum)       │◄─────►│  (Ekstern)   │
│                  │ WS+   │                    │ HTTPS │              │
│  ug-plugin.js    │ REST  │  ug_integration    │ +API  │  /api/v1/... │
│  ug-panel.js     │       │  modul (nyt)       │  key  │              │
└─────────────────┘       └───────────────────┘       └──────────────┘
```

Browseren taler aldrig direkte med UG Core. Alt går gennem whiteboard-backenden, som:
- Gemmer API-nøglen sikkert (aldrig eksponeret til frontend)
- Validerer og transformerer data
- Håndterer sync-status og konflikter
- Logger alle operationer

## Database

Ny tabel `ug_connections`:

```sql
CREATE TABLE ug_connections (
    board_id     UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    ug_base_url  TEXT NOT NULL,
    api_key      TEXT NOT NULL,
    messe_id     TEXT NOT NULL,
    last_synced  TIMESTAMPTZ,
    sync_enabled BOOLEAN DEFAULT true
);
```

Hvert board har maks én UG-forbindelse (1:1).

## UG Core API-kontrakt

Base URL: `{ug_base_url}/api/v1`
Auth: `X-API-Key: {api_key}` + `X-User-Id: {whiteboard_user_id}`

### Read-endpoints

| Metode | Endpoint | Beskrivelse |
|--------|----------|-------------|
| `GET` | `/messer/{id}` | Hent messe med metadata |
| `GET` | `/messer/{id}/haller` | Alle haller for messen |
| `GET` | `/messer/{id}/stande` | Alle stande med udstiller-info |
| `GET` | `/messer/{id}/udstillere` | Alle udstillere for messen |
| `GET` | `/messer/{id}/taxonomier` | Kategori-hierarki |
| `GET` | `/messer/{id}/full` | Alt samlet i ét kald (bulk) |
| `GET` | `/messer/{id}/changes?since={ISO}` | Ændringer siden sidst (incremental sync) |

### Write-endpoints

| Metode | Endpoint | Beskrivelse |
|--------|----------|-------------|
| `PUT` | `/stande/{id}` | Opdater stand (position, status) |
| `PUT` | `/taxonomier/{id}` | Opdater kategori (navn, parent) |
| `POST` | `/messer/{id}/taxonomier` | Opret ny kategori |
| `DELETE` | `/taxonomier/{id}` | Slet kategori |

### Response-format: `/messer/{id}/full`

```json
{
  "messe": { "id": "...", "navn": "...", "dato": "...", "lokation": "..." },
  "haller": [
    { "id": "...", "navn": "Hal A", "bredde": 600, "hoejde": 400, "farve": "#2196F3" }
  ],
  "stande": [
    {
      "id": "...", "standnummer": "A01", "hal_id": "...", "udstiller_id": "...",
      "bredde": 120, "hoejde": 80, "status": "bekræftet",
      "position": { "x": 20, "y": 45 }
    }
  ],
  "udstillere": [
    { "id": "...", "firmanavn": "Nordic Foods", "kontakt": "...", "email": "..." }
  ],
  "taxonomier": [
    { "id": "...", "navn": "Program", "parent": null, "children": ["..."] }
  ],
  "version": "2025-03-15T10:30:00Z"
}
```

### Changes-endpoint: `/messer/{id}/changes?since={ISO}`

```json
{
  "changes": [
    { "entity_type": "stand", "entity_id": "...", "action": "updated", "data": { ... }, "changed_at": "..." },
    { "entity_type": "taxonomi", "entity_id": "...", "action": "created", "data": { ... }, "changed_at": "..." }
  ],
  "version": "2025-03-15T11:00:00Z"
}
```

## Sync-flow

### 1. Initial import (bruger klikker "Forbind til UG")

```
Browser → POST /api/boards/{id}/ug/connect { ug_base_url, api_key, messe_id }
Backend → GET {ug_base_url}/api/v1/messer/{messe_id}/full
Backend → Gemmer ug_connections row
Backend → Konverterer UG-data til whiteboard-elementer (ug-hal, ug-stand osv.)
Backend → Returnerer elementer til browser
Browser → Tilføjer elementer til canvas via app.addElement()
```

### 2. Incremental sync (automatisk polling hvert 30 sek)

```
Backend → GET {ug_base_url}/api/v1/messer/{id}/changes?since={last_synced}
Backend → Sammenligner med nuværende board-elementer
Backend → Opdaterer elementer hvor UG Core er nyere (UG Core vinder)
Backend → Pusher ændringer via Yjs WebSocket til alle åbne browsere
Browser → Canvas opdateres automatisk via Yjs observer
```

### 3. Push ændringer til UG Core (bruger ændrer stand/kategori)

```
Browser → Bruger ændrer stand-position eller kategori på canvas
Browser → Yjs syncer til backend (allerede implementeret)
Backend → Detecter at element har external.type === 'stand' eller 'taxonomi'
Backend → PUT {ug_base_url}/api/v1/stande/{id} eller /taxonomier/{id}
Backend → Opdater external.syncStatus = 'synced' | 'conflict'
```

### Sync-status per element

| Status | Betydning |
|--------|-----------|
| `synced` | I sync med UG Core |
| `pending` | Lokal ændring, ikke pushet endnu |
| `conflict` | UG Core har overskrevet lokal ændring (bruger notificeres) |
| `local-only` | Element findes kun på boardet |

## Whiteboard-backend endpoints (nye)

Nyt modul: `backend/src/ug_integration.rs`

| Metode | Endpoint | Beskrivelse |
|--------|----------|-------------|
| `POST` | `/api/boards/{id}/ug/connect` | Opret UG-forbindelse |
| `DELETE` | `/api/boards/{id}/ug/connect` | Fjern UG-forbindelse |
| `GET` | `/api/boards/{id}/ug/status` | Sync-status og forbindelses-info |
| `POST` | `/api/boards/{id}/ug/sync` | Trigger manual sync (hent fra UG Core) |
| `POST` | `/api/boards/{id}/ug/push` | Push lokale ændringer til UG Core |

### Connect-handler

```rust
#[derive(Deserialize)]
struct ConnectRequest {
    ug_base_url: String,
    api_key: String,
    messe_id: String,
}
// Validerer forbindelsen ved at kalde GET /messer/{id}
// Gemmer i ug_connections
// Kører initial full sync
// Returnerer importerede elementer
```

### Baggrunds sync-loop

```rust
// Tokio task der kører hvert 30. sekund
// For alle boards med sync_enabled=true:
// 1. Hent changes fra UG Core
// 2. Merge med board-elementer (UG Core vinder konflikter)
// 3. Push lokale ændringer (stande + taxonomier) til UG Core
// 4. Opdater last_synced timestamp
```

## Frontend-ændringer

### Ny fil: `ug-api.js` (erstatter `ug-mock-data.js`)

```js
export async function fetchMesseData(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/sync`, { method: 'POST' });
    return res.json();
}

export async function pushChanges(boardId, changes) {
    return apiFetch(`/api/boards/${boardId}/ug/push`, {
        method: 'POST',
        body: changes
    });
}

export async function connectUg(boardId, ugBaseUrl, apiKey, messeId) {
    return apiFetch(`/api/boards/${boardId}/ug/connect`, {
        method: 'POST',
        body: { ug_base_url: ugBaseUrl, api_key: apiKey, messe_id: messeId }
    });
}

export async function getUgStatus(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/status`);
    return res.json();
}
```

### `ug-panel.js` — Tre tilstande

**1. Ikke forbundet** — "Forbind til UG"-formular med URL, API-nøgle og messe-ID felter.

**2. Forbundet** — Oversigt med messe-info, stand-status tæller, kategori-hierarki, sync-tidspunkt og sync/afbryd-knapper.

**3. Konflikt** — Notifikation med "Vis på canvas" og "OK" knapper.

### `ug-layout.js` ændringer

`importMesseData()` kalder `fetchMesseData(boardId)` i stedet for mock-data. Samme element-generering (gulvplan + hierarki).

### `ug-elements.js` ændringer

Sync-status indikatoren (allerede i draw-funktionerne) viser nu korrekt status baseret på reel sync-state.

## Implementeringsrækkefølge

1. **Database migration** — Opret `ug_connections` tabel
2. **Backend: UG integration modul** — HTTP-klient, connect/sync/push handlers
3. **Backend: Baggrunds sync-loop** — Tokio spawned task
4. **Frontend: `ug-api.js`** — Erstat mock-data med API-kald
5. **Frontend: `ug-panel.js`** — Forbind-dialog og sync-status UI
6. **Frontend: `ug-layout.js`** — Brug API-data i stedet for mock
7. **UG Core API spec** — OpenAPI/Swagger dokument til UG Core-teamet
8. **Test med mock-server** — Spin en simpel mock op der implementerer kontrakten

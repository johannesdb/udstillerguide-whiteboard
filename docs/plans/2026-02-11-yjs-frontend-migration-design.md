# Yjs Frontend Migration Design

## Summary

Replace the custom JSON message protocol (element_add/update/remove/sync_state) with real Yjs client-side integration (Y.Doc + Y.Map + y-websocket). Cursors migrate to Awareness protocol. Backend keeps existing sync code with minimal changes.

## Architecture

### Before

```
Frontend (vanilla JS)                    Backend (Rust)
elements[] array          --JSON-->      parse JSON, store_element() in Y.Map
                          <--JSON--      broadcast JSON to clients
                          <--binary--    broadcast Yjs update (unused by frontend)
```

### After

```
Frontend (Yjs + y-websocket)             Backend (Rust)
Y.Doc + Y.Map("elements")  --binary-->  handle_sync_message() (unchanged)
                            <--binary--  broadcast Yjs update

Awareness (cursors)         --binary-->  forward to all clients
                            <--binary--

join/leave events           <--JSON--    server-initiated only
```

## Frontend Changes

### New files
- `static/js/vendor/yjs.mjs` — vendored Yjs ESM build (~60KB)
- `static/js/vendor/y-websocket.mjs` — vendored y-websocket ESM build (~15KB)

### sync.js — full rewrite
- SyncManager owns Y.Doc + Y.Map("elements")
- y-websocket WebSocketProvider handles connection, reconnect, sync protocol
- Element CRUD via Y.Map.set() / Y.Map.delete()
- Remote changes via Y.Map.observe()
- Cursors via Awareness protocol (replaces custom JSON cursor messages)
- Sync status indicator (synced/syncing/disconnected)

### canvas.js — moderate changes
- elements[] array kept in sync via Y.Map observer
- addElement/updateElement/deleteSelected route through SyncManager
- Undo/redo migrated to Y.UndoManager
- Render loop waits for initial sync before first render

### tools.js — minor changes
- Update any direct sync calls to use new SyncManager API

## Backend Changes

### handler.rs — remove JSON element handlers
- Remove: element_add, element_update, element_remove, sync_state, save_request JSON handlers
- Remove: JSON broadcast of element operations
- Remove: Initial JSON sync_state send to new clients
- Keep: Binary sync (MSG_SYNC), awareness forwarding (MSG_AWARENESS)
- Keep: Join/leave JSON broadcasts
- Keep: All persistence logic (periodic save + save on room close)
- Keep: All auth logic
- Add: Decoded Y.Map logging for observability

### sync.rs, room.rs — unchanged

## Migration Order

1. Vendor Yjs + y-websocket files
2. Rewrite sync.js
3. Update canvas.js (Y.Map integration + Y.UndoManager)
4. Update tools.js
5. Strip JSON element handlers from backend
6. Add server-side decoded logging
7. End-to-end test

## Out of Scope
- y-indexeddb (client-side offline persistence)
- y-webrtc (peer-to-peer sync)
- DB schema changes
- Auth flow changes

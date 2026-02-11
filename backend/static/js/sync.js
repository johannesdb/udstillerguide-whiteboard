// Sync Manager - Yjs-based collaborative sync via y-websocket
// Uses vendored Yjs (Y.Doc + Y.Map) and y-websocket (WebSocketProvider + Awareness)

import { errorHandler } from '/js/error-handler.js?v=2';
import * as Y from '/js/vendor/yjs.mjs';
import { WebsocketProvider } from '/js/vendor/y-websocket.mjs';

export class SyncManager {
    constructor(app, options = {}) {
        this.app = app;
        this.boardId = options.boardId;
        this.shareToken = options.shareToken;
        this.token = options.token;

        // Yjs document and shared type
        this.ydoc = new Y.Doc();
        this.elementsMap = this.ydoc.getMap('elements');

        // Provider (WebSocket + Awareness)
        this.provider = null;

        // Track whether we've done initial sync
        this.synced = false;

        // Suppress remote observer while applying local changes
        this._isLocalChange = false;

        // Track element IDs we just deleted locally (to avoid re-adding from observer)
        this._pendingDeletes = new Set();

        if (this.boardId) {
            this.connect();
        }
    }

    connect() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            const params = {};
            if (this.token) params.token = this.token;
            if (this.shareToken) params.share_token = this.shareToken;

            this.provider = new WebsocketProvider(wsUrl, `ws/${this.boardId}`, this.ydoc, {
                params,
                connect: true,
            });

            // Sync status events
            this.provider.on('sync', (synced) => {
                console.log('Yjs sync:', synced ? 'synced' : 'syncing');
                if (synced && !this.synced) {
                    this.synced = true;
                    this._loadFromYMap();
                }
            });

            this.provider.on('status', ({ status }) => {
                console.log('Yjs connection:', status);
            });

            this.provider.on('connection-error', (err) => {
                console.error('Yjs connection error:', err);
                errorHandler.report({
                    error_type: 'websocket',
                    severity: 'error',
                    message: 'Yjs WebSocket connection error',
                    context: { boardId: this.boardId },
                });
            });

            // Observe Y.Map for remote changes
            this.elementsMap.observe((event) => {
                if (this._isLocalChange) return;

                try {
                    event.changes.keys.forEach((change, key) => {
                        if (change.action === 'add' || change.action === 'update') {
                            if (this._pendingDeletes.has(key)) return;
                            const raw = this.elementsMap.get(key);
                            const el = typeof raw === 'string' ? JSON.parse(raw) : raw;
                            if (!el) return;

                            const idx = this.app.elements.findIndex(e => e.id === key);
                            if (idx >= 0) {
                                this.app.elements[idx] = el;
                            } else {
                                this.app.elements.push(el);
                            }
                        } else if (change.action === 'delete') {
                            this.app.elements = this.app.elements.filter(e => e.id !== key);
                            this.app.selectedIds.delete(key);
                        }
                    });
                } catch (error) {
                    errorHandler.report({
                        error_type: 'yjs_observe',
                        severity: 'warning',
                        message: error.message,
                        stack_trace: error.stack,
                        context: { boardId: this.boardId },
                    });
                }
            });

            // Awareness: set local user info
            this.provider.awareness.setLocalStateField('user', {
                name: this._getUsername(),
                color: this._getUserColor(),
            });

            // Awareness: observe remote cursors
            this.provider.awareness.on('change', () => {
                try {
                    this._updateRemoteCursors();
                } catch (error) {
                    errorHandler.report({
                        error_type: 'awareness',
                        severity: 'warning',
                        message: error.message,
                        stack_trace: error.stack,
                    });
                }
            });

            // Listen for JSON messages (join/leave) on the underlying WebSocket
            // y-websocket handles binary Yjs messages; text messages pass through
            this._setupJsonMessageListener();

        } catch (error) {
            console.error('Yjs connection failed:', error);
            errorHandler.report({
                error_type: 'websocket',
                severity: 'critical',
                message: 'Failed to initialize Yjs connection: ' + error.message,
                stack_trace: error.stack,
                context: { boardId: this.boardId },
            });
        }
    }

    // Load all elements from Y.Map into app.elements on initial sync
    _loadFromYMap() {
        try {
            const elements = [];
            this.elementsMap.forEach((raw, key) => {
                const el = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (el) elements.push(el);
            });
            // Merge: keep local elements that aren't in Y.Map, add remote ones
            const localIds = new Set(this.app.elements.map(e => e.id));
            for (const el of elements) {
                if (!localIds.has(el.id)) {
                    this.app.elements.push(el);
                } else {
                    // Remote wins on initial sync
                    const idx = this.app.elements.findIndex(e => e.id === el.id);
                    if (idx >= 0) this.app.elements[idx] = el;
                }
            }
            console.log(`Loaded ${elements.length} elements from Y.Map`);
        } catch (error) {
            errorHandler.report({
                error_type: 'yjs_load',
                severity: 'error',
                message: 'Failed to load elements from Y.Map: ' + error.message,
                stack_trace: error.stack,
                context: { boardId: this.boardId },
            });
        }
    }

    // Listen for JSON text messages from server (join/leave events)
    _setupJsonMessageListener() {
        // y-websocket's provider.ws is the raw WebSocket.
        // We intercept its onmessage to catch JSON text frames alongside binary Yjs frames.
        // y-websocket normally handles all messages, but it ignores text frames.
        const checkWs = () => {
            const ws = this.provider?.ws;
            if (!ws) {
                // WebSocket not yet created, retry
                setTimeout(checkWs, 100);
                return;
            }
            const originalOnMessage = ws.onmessage;
            ws.onmessage = (event) => {
                // Text frames are JSON (join/leave)
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        this._handleJsonMessage(msg);
                    } catch {
                        // Not JSON, ignore
                    }
                    return;
                }
                // Binary frames go to y-websocket
                if (originalOnMessage) originalOnMessage.call(ws, event);
            };
        };
        // Wait for provider to establish connection
        this.provider.on('status', ({ status }) => {
            if (status === 'connected') checkWs();
        });
    }

    _handleJsonMessage(msg) {
        if (!msg || !msg.type) return;
        try {
            switch (msg.type) {
                case 'join':
                    console.log(`User joined: ${msg.username}`);
                    this.updatePresenceBar(msg.users);
                    break;
                case 'leave':
                    console.log(`User left: ${msg.userId}`);
                    this.app.remoteCursors.delete(msg.userId);
                    this.updatePresenceBar(msg.users);
                    break;
            }
        } catch (error) {
            errorHandler.report({
                error_type: 'ws_message',
                severity: 'warning',
                message: error.message,
                stack_trace: error.stack,
                context: { boardId: this.boardId },
            });
        }
    }

    // === Outgoing: Element CRUD via Y.Map ===

    addElement(el) {
        try {
            this._isLocalChange = true;
            this.elementsMap.set(el.id, JSON.stringify(el));
        } catch (error) {
            errorHandler.report({
                error_type: 'yjs_write',
                severity: 'error',
                message: 'Failed to add element: ' + error.message,
                context: { elementId: el.id, boardId: this.boardId },
            });
        } finally {
            this._isLocalChange = false;
        }
    }

    updateElement(el) {
        try {
            this._isLocalChange = true;
            this.elementsMap.set(el.id, JSON.stringify(el));
        } catch (error) {
            errorHandler.report({
                error_type: 'yjs_write',
                severity: 'error',
                message: 'Failed to update element: ' + error.message,
                context: { elementId: el.id, boardId: this.boardId },
            });
        } finally {
            this._isLocalChange = false;
        }
    }

    removeElement(id) {
        try {
            this._isLocalChange = true;
            this._pendingDeletes.add(id);
            this.elementsMap.delete(id);
            // Clean up pending delete after a tick
            setTimeout(() => this._pendingDeletes.delete(id), 100);
        } catch (error) {
            errorHandler.report({
                error_type: 'yjs_write',
                severity: 'error',
                message: 'Failed to remove element: ' + error.message,
                context: { elementId: id, boardId: this.boardId },
            });
        } finally {
            this._isLocalChange = false;
        }
    }

    // Sync full state — used by undo/redo to push entire state to Y.Map
    syncFullState(elements) {
        try {
            this._isLocalChange = true;
            this.ydoc.transact(() => {
                // Remove elements not in the new state
                const newIds = new Set(elements.map(e => e.id));
                this.elementsMap.forEach((_, key) => {
                    if (!newIds.has(key)) {
                        this.elementsMap.delete(key);
                    }
                });
                // Add/update all elements
                for (const el of elements) {
                    this.elementsMap.set(el.id, JSON.stringify(el));
                }
            });
        } catch (error) {
            errorHandler.report({
                error_type: 'yjs_write',
                severity: 'error',
                message: 'Failed to sync full state: ' + error.message,
                context: { boardId: this.boardId },
            });
        } finally {
            this._isLocalChange = false;
        }
    }

    // === Cursors via Awareness ===

    sendCursorPosition(x, y) {
        try {
            this.provider?.awareness.setLocalStateField('cursor', { x, y });
        } catch {
            // Awareness update failures are non-critical
        }
    }

    _updateRemoteCursors() {
        if (!this.provider) return;
        const states = this.provider.awareness.getStates();
        const localClientId = this.ydoc.clientID;

        // Clear old cursors and rebuild from awareness
        this.app.remoteCursors.clear();
        states.forEach((state, clientId) => {
            if (clientId === localClientId) return;
            if (state.cursor && state.user) {
                this.app.remoteCursors.set(String(clientId), {
                    x: state.cursor.x,
                    y: state.cursor.y,
                    username: state.user.name || '?',
                    color: state.user.color || '#F44336',
                });
            }
        });
    }

    _getUsername() {
        try {
            const token = this.token;
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.username || 'User';
            }
        } catch { /* ignore */ }
        return 'Guest';
    }

    _getUserColor() {
        const colors = ['#F44336', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#3F51B5'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // === Presence Bar (still from server JSON join/leave) ===

    updatePresenceBar(users) {
        const bar = document.getElementById('presence-bar');
        if (!bar || !users) return;

        bar.innerHTML = '';
        for (const user of users) {
            const avatar = document.createElement('wa-avatar');
            avatar.initials = (user.username || '?')[0].toUpperCase();
            avatar.label = user.username;
            avatar.style.setProperty('--size', '32px');
            avatar.style.setProperty('--wa-color-neutral-400', user.color);

            const tooltip = document.createElement('wa-tooltip');
            tooltip.content = user.username || 'Unknown';
            tooltip.appendChild(avatar);

            bar.appendChild(tooltip);
        }
    }

    // No-op: persistence is handled by backend via Yjs sync protocol
    requestSave() {
        // Backend saves automatically when it receives Yjs updates
    }

    disconnect() {
        if (this.provider) {
            this.provider.destroy();
            this.provider = null;
        }
        if (this.ydoc) {
            this.ydoc.destroy();
        }
    }
}

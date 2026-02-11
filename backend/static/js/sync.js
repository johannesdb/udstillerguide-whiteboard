// Sync Manager - handles Yjs document sync and WebSocket communication
// Uses CDN-loaded Yjs for collaborative editing

import { errorHandler } from '/js/error-handler.js?v=2';

export class SyncManager {
    constructor(app, options = {}) {
        this.app = app;
        this.boardId = options.boardId;
        this.shareToken = options.shareToken;
        this.token = options.token;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.pendingUpdates = [];
        this.cursorThrottleTimer = null;

        if (this.boardId) {
            this.connect();
        }
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let url = `${protocol}//${window.location.host}/ws/${this.boardId}`;

        const params = new URLSearchParams();
        if (this.token) params.set('token', this.token);
        if (this.shareToken) params.set('share_token', this.shareToken);
        if (params.toString()) url += '?' + params.toString();

        try {
            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                console.log('WebSocket connected');

                // Send full state
                this.syncFullState(this.app.elements);

                // Flush pending updates
                for (const msg of this.pendingUpdates) {
                    this.send(msg);
                }
                this.pendingUpdates = [];
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.ws.onclose = () => {
                this.connected = false;
                console.log('WebSocket disconnected');
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                errorHandler.report({
                    error_type: 'websocket',
                    severity: 'error',
                    message: 'WebSocket connection error',
                    context: { boardId: this.boardId, readyState: this.ws?.readyState },
                });
            };
        } catch (e) {
            console.error('WebSocket connection failed:', e);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    send(data) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            this.pendingUpdates.push(data);
        }
    }

    handleMessage(data) {
        try {
            // Try JSON first
            let msg;
            if (typeof data === 'string') {
                msg = JSON.parse(data);
            } else if (data instanceof ArrayBuffer) {
                const text = new TextDecoder().decode(data);
                try {
                    msg = JSON.parse(text);
                } catch {
                    // Binary sync message - handle as Yjs protocol
                    return;
                }
            }

            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'sync_state':
                    this.handleSyncState(msg);
                    break;
                case 'element_add':
                    this.handleElementAdd(msg);
                    break;
                case 'element_update':
                    this.handleElementUpdate(msg);
                    break;
                case 'element_remove':
                    this.handleElementRemove(msg);
                    break;
                case 'cursor':
                    this.handleCursor(msg);
                    break;
                case 'join':
                    this.handleJoin(msg);
                    break;
                case 'leave':
                    this.handleLeave(msg);
                    break;
            }
        } catch (error) {
            // Binary Yjs messages that aren't JSON are expected - only report non-parse errors
            if (error.name !== 'SyntaxError') {
                errorHandler.report({
                    error_type: 'ws_message',
                    severity: 'warning',
                    message: error.message,
                    stack_trace: error.stack,
                    context: { boardId: this.boardId },
                });
            }
        }
    }

    // === Outgoing Messages ===

    addElement(el) {
        this.send(JSON.stringify({
            type: 'element_add',
            element: el,
        }));
    }

    updateElement(el) {
        this.send(JSON.stringify({
            type: 'element_update',
            element: el,
        }));
    }

    removeElement(id) {
        this.send(JSON.stringify({
            type: 'element_remove',
            elementId: id,
        }));
    }

    syncFullState(elements) {
        this.send(JSON.stringify({
            type: 'sync_state',
            elements: elements,
        }));
    }

    sendCursorPosition(x, y) {
        // Throttle to ~30fps
        if (this.cursorThrottleTimer) return;
        this.cursorThrottleTimer = setTimeout(() => {
            this.cursorThrottleTimer = null;
        }, 33);

        this.send(JSON.stringify({
            type: 'cursor',
            x, y,
        }));
    }

    // === Incoming Message Handlers ===

    handleSyncState(msg) {
        if (msg.elements && Array.isArray(msg.elements)) {
            // Merge remote state - prefer remote for elements we don't have
            const localIds = new Set(this.app.elements.map(e => e.id));
            for (const el of msg.elements) {
                if (!localIds.has(el.id)) {
                    this.app.elements.push(el);
                }
            }
        }
    }

    handleElementAdd(msg) {
        if (!msg.element) return;
        // Check if we already have this element
        const existing = this.app.elements.find(e => e.id === msg.element.id);
        if (!existing) {
            this.app.elements.push(msg.element);
        }
    }

    handleElementUpdate(msg) {
        if (!msg.element) return;
        const idx = this.app.elements.findIndex(e => e.id === msg.element.id);
        if (idx >= 0) {
            this.app.elements[idx] = msg.element;
        }
    }

    handleElementRemove(msg) {
        if (!msg.elementId) return;
        this.app.elements = this.app.elements.filter(e => e.id !== msg.elementId);
        this.app.selectedIds.delete(msg.elementId);
    }

    handleCursor(msg) {
        if (msg.userId) {
            this.app.remoteCursors.set(msg.userId, {
                x: msg.x,
                y: msg.y,
                username: msg.username,
                color: msg.color,
            });
        }
    }

    handleJoin(msg) {
        console.log(`User joined: ${msg.username}`);
        this.updatePresenceBar(msg.users);
    }

    handleLeave(msg) {
        console.log(`User left: ${msg.userId}`);
        this.app.remoteCursors.delete(msg.userId);
        this.updatePresenceBar(msg.users);
    }

    updatePresenceBar(users) {
        const bar = document.getElementById('presence-bar');
        if (!bar || !users) return;

        bar.innerHTML = '';
        for (const user of users) {
            const avatar = document.createElement('div');
            avatar.className = 'presence-avatar';
            avatar.style.background = user.color;
            avatar.textContent = (user.username || '?')[0].toUpperCase();
            avatar.title = user.username;
            bar.appendChild(avatar);
        }
    }

    // Request server to persist board state now (called by auto-save timer)
    requestSave() {
        this.send(JSON.stringify({
            type: 'save_request',
        }));
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

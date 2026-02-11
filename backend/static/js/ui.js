// UI Manager - handles UI overlays, modals, and board-level interactions
import { apiFetch, getToken, getUser } from '/js/auth.js?v=2';
import { WhiteboardPlugins } from '/js/plugins.js?v=2';

export class UIManager {
    constructor(app) {
        this.app = app;
        this.setupBackButton();
        this.setupShareButton();
        this.loadBoardInfo();
        this.setupPluginPanels();
        this.setupContextMenu();
    }

    setupPluginPanels() {
        const panels = WhiteboardPlugins.panels;
        if (!panels || panels.length === 0) return;

        const tabGroup = document.getElementById('plugin-sidebar-tabs');
        if (!tabGroup) return;

        // Create tabs and panels for each plugin
        for (const panel of panels) {
            const tab = document.createElement('wa-tab');
            tab.slot = 'nav';
            tab.panel = panel.id;
            tab.textContent = panel.title || panel.id;
            tabGroup.appendChild(tab);

            const tabPanel = document.createElement('wa-tab-panel');
            tabPanel.name = panel.id;
            tabGroup.appendChild(tabPanel);
        }

        tabGroup.addEventListener('wa-tab-show', (e) => {
            const panelId = e.detail.name;
            this.activatePanel(panelId);
        });

        // Close button handler
        document.getElementById('plugin-sidebar-close')?.addEventListener('click', () => this.toggleSidebar());

        // Add sidebar toggle button to top-bar
        const topBar = document.getElementById('top-bar');
        if (topBar) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'top-btn';
            toggleBtn.id = 'btn-sidebar-toggle';
            toggleBtn.title = 'Toggle Sidebar';
            toggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>`;
            toggleBtn.addEventListener('click', () => this.toggleSidebar());
            topBar.appendChild(toggleBtn);
        }
    }

    toggleSidebar() {
        const drawer = document.getElementById('plugin-sidebar');
        if (drawer) {
            drawer.open = !drawer.open;
        }
    }

    activatePanel(panelId) {
        const content = document.getElementById('plugin-sidebar-content');
        if (!content) return;
        content.innerHTML = '';

        const panel = WhiteboardPlugins.panels.find(p => p.id === panelId);
        if (panel && panel.render) {
            panel.render(content);
        }

        // Ensure drawer is open
        const drawer = document.getElementById('plugin-sidebar');
        if (drawer && !drawer.open) {
            drawer.open = true;
        }
    }

    setupBackButton() {
        const btn = document.getElementById('btn-back');
        if (btn) {
            btn.addEventListener('click', () => {
                window.location.href = '/';
            });
        }
    }

    setupShareButton() {
        const btn = document.getElementById('btn-share');
        if (btn) {
            btn.addEventListener('click', () => this.showShareDialog());
        }
    }

    async loadBoardInfo() {
        if (!this.app.boardId) return;

        const token = getToken();
        if (!token) return;

        try {
            const res = await apiFetch(`/api/boards/${this.app.boardId}`);
            if (res.ok) {
                const board = await res.json();
                const nameEl = document.getElementById('board-name');
                if (nameEl) {
                    nameEl.textContent = board.name;
                    document.title = board.name + ' - Whiteboard';
                }
            }
        } catch (e) {
            console.error('Failed to load board info:', e);
        }
    }

    async showShareDialog() {
        if (!this.app.boardId) return;

        const dialog = document.getElementById('share-dialog');
        if (!dialog) return;

        dialog.show();

        // Setup event listeners (only once)
        if (!dialog._listenersSet) {
            dialog._listenersSet = true;

            document.getElementById('btn-close-share').addEventListener('click', () => dialog.hide());

            // Add collaborator
            document.getElementById('btn-add-collab').addEventListener('click', async () => {
                const usernameInput = document.getElementById('share-username');
                const roleSelect = document.getElementById('share-role');
                const username = usernameInput.value.trim();
                const role = roleSelect.value;
                if (!username) return;

                try {
                    const res = await apiFetch(`/api/boards/${this.app.boardId}/collaborators`, {
                        method: 'POST',
                        body: { username, role },
                    });
                    if (res.ok) {
                        usernameInput.value = '';
                        this.showToast(`Added ${username} as ${role}`, 'success');
                    } else {
                        const err = await res.json();
                        this.showToast(err.error || 'Failed to add collaborator', 'warning');
                    }
                } catch (e) {
                    this.showToast('Failed to add collaborator', 'danger');
                }
            });

            // Create share link
            document.getElementById('btn-create-link').addEventListener('click', async () => {
                const role = document.getElementById('link-role').value;
                try {
                    const res = await apiFetch(`/api/boards/${this.app.boardId}/share-links`, {
                        method: 'POST',
                        body: { role },
                    });
                    if (res.ok) {
                        const link = await res.json();
                        this.loadShareLinks();
                        const shareUrl = `${window.location.origin}/board.html?id=${this.app.boardId}&share=${link.token}`;
                        await navigator.clipboard.writeText(shareUrl).catch(() => {});
                        this.showToast('Share link created and copied!', 'success');
                    }
                } catch (e) {
                    this.showToast('Failed to create share link', 'danger');
                }
            });
        }

        this.loadShareLinks();
    }

    async loadShareLinks() {
        const list = document.getElementById('share-links-list');
        if (!list) return;

        try {
            const res = await apiFetch(`/api/boards/${this.app.boardId}/share-links`);
            if (res.ok) {
                const links = await res.json();
                if (links.length === 0) {
                    list.innerHTML = '<div style="color:var(--wa-color-neutral-500); font-size:13px">No share links yet</div>';
                    return;
                }

                list.innerHTML = '';
                for (const link of links) {
                    const item = document.createElement('div');
                    item.className = 'share-link-item';
                    const shareUrl = `${window.location.origin}/board.html?id=${this.app.boardId}&share=${link.token}`;
                    item.innerHTML = `
                        <span>
                            <code>${link.token.substring(0, 8)}...</code>
                            <wa-badge variant="neutral" pill>${link.role}</wa-badge>
                        </span>
                        <div style="display:flex; gap:4px">
                            <wa-icon-button name="copy" label="Copy link" class="copy-link" data-url="${shareUrl}"></wa-icon-button>
                            <wa-icon-button name="arrows-rotate" label="Reset link" class="regenerate-link" data-id="${link.id}" style="color:var(--wa-color-warning-600)"></wa-icon-button>
                            <wa-icon-button name="trash" label="Delete link" class="delete-link" data-id="${link.id}" style="color:var(--wa-color-danger-600)"></wa-icon-button>
                        </div>
                    `;
                    list.appendChild(item);

                    item.querySelector('.copy-link').addEventListener('click', async (e) => {
                        const url = e.currentTarget.dataset.url;
                        await navigator.clipboard.writeText(url).catch(() => {});
                        this.showToast('Link copied!', 'success');
                    });

                    item.querySelector('.regenerate-link').addEventListener('click', async (e) => {
                        if (!confirm('This will invalidate the current share link. Anyone with the old link will lose access. Continue?')) {
                            return;
                        }
                        try {
                            const res = await apiFetch(`/api/boards/${this.app.boardId}/share-links/${e.currentTarget.dataset.id}/regenerate`, {
                                method: 'POST',
                            });
                            if (res.ok) {
                                const updated = await res.json();
                                this.loadShareLinks();
                                const newUrl = `${window.location.origin}/board.html?id=${this.app.boardId}&share=${updated.token}`;
                                await navigator.clipboard.writeText(newUrl).catch(() => {});
                                this.showToast('Share link reset and new link copied!', 'success');
                            } else {
                                try {
                                    const err = await res.json();
                                    this.showToast(err.error || 'Failed to reset link', 'warning');
                                } catch {
                                    this.showToast('Failed to reset link', 'danger');
                                }
                            }
                        } catch (err) {
                            this.showToast('Failed to reset link', 'danger');
                        }
                    });

                    item.querySelector('.delete-link').addEventListener('click', async (e) => {
                        try {
                            await apiFetch(`/api/boards/${this.app.boardId}/share-links/${e.currentTarget.dataset.id}`, {
                                method: 'DELETE',
                            });
                            this.loadShareLinks();
                        } catch (err) {
                            this.showToast('Failed to delete link', 'danger');
                        }
                    });
                }
            }
        } catch (e) {
            list.innerHTML = '<div style="color:var(--wa-color-danger-600); font-size:13px">Failed to load links</div>';
        }
    }

    // === Context Menu ===

    setupContextMenu() {
        const canvas = this.app.canvas;
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e);
        });
    }

    showContextMenu(e) {
        const world = this.app.camera.screenToWorld(e.offsetX, e.offsetY);
        const hit = this.app.hitTestElements(world.x, world.y);
        const menu = document.getElementById('context-menu-items');
        if (!menu) return;

        menu.innerHTML = '';

        if (hit) {
            // Element context menu
            if (!this.app.selectedIds.has(hit.id)) {
                this.app.selectedIds = new Set([hit.id]);
            }

            const items = [
                { label: 'Cut', icon: 'scissors', action: () => this._cutSelected() },
                { label: 'Copy', icon: 'copy', action: () => this._copySelected() },
                { label: 'Delete', icon: 'trash', action: () => this.app.deleteSelected() },
                'divider',
                { label: 'Bring to Front', icon: 'arrow-up-to-line', action: () => this._bringToFront() },
                { label: 'Send to Back', icon: 'arrow-down-to-line', action: () => this._sendToBack() },
            ];

            for (const item of items) {
                if (item === 'divider') {
                    menu.appendChild(document.createElement('wa-divider'));
                    continue;
                }
                const menuItem = document.createElement('wa-menu-item');
                menuItem.textContent = item.label;
                if (item.icon) {
                    const icon = document.createElement('wa-icon');
                    icon.slot = 'prefix';
                    icon.name = item.icon;
                    icon.variant = 'regular';
                    menuItem.prepend(icon);
                }
                menuItem.addEventListener('click', () => {
                    item.action();
                    this._hideContextMenu();
                });
                menu.appendChild(menuItem);
            }
        } else {
            // Canvas context menu
            const items = [
                { label: 'Paste', icon: 'paste', action: () => this._paste(world) },
                'divider',
                { label: 'Add Sticky Note', icon: 'note-sticky', action: () => this._addStickyAt(world) },
                { label: 'Add Rectangle', icon: 'square', action: () => this._addRectAt(world) },
                { label: 'Add Circle', icon: 'circle', action: () => this._addCircleAt(world) },
                { label: 'Add Text', icon: 'font', action: () => this._addTextAt(world) },
            ];

            for (const item of items) {
                if (item === 'divider') {
                    menu.appendChild(document.createElement('wa-divider'));
                    continue;
                }
                const menuItem = document.createElement('wa-menu-item');
                menuItem.textContent = item.label;
                if (item.icon) {
                    const icon = document.createElement('wa-icon');
                    icon.slot = 'prefix';
                    icon.name = item.icon;
                    icon.variant = 'regular';
                    menuItem.prepend(icon);
                }
                menuItem.addEventListener('click', () => {
                    item.action();
                    this._hideContextMenu();
                });
                menu.appendChild(menuItem);
            }
        }

        // Position and show the dropdown
        const dropdown = document.getElementById('context-menu');
        dropdown.style.left = e.clientX + 'px';
        dropdown.style.top = e.clientY + 'px';
        dropdown.open = true;
    }

    _hideContextMenu() {
        const dropdown = document.getElementById('context-menu');
        if (dropdown) dropdown.open = false;
    }

    _cutSelected() {
        this._copySelected();
        this.app.deleteSelected();
    }

    _copySelected() {
        const els = [];
        for (const id of this.app.selectedIds) {
            const el = this.app.getElementById(id);
            if (el) els.push(JSON.parse(JSON.stringify(el)));
        }
        this._clipboard = els;
        this.showToast('Copied!', 'neutral');
    }

    _paste(world) {
        if (!this._clipboard || this._clipboard.length === 0) return;
        const { createStickyNote } = import('/js/canvas.js?v=3');
        // Offset pasted elements from original position
        for (const el of this._clipboard) {
            const { generateId } = window.__whiteboardApp.constructor;
            el.id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            el.x = world.x + (el.x - this._clipboard[0].x);
            el.y = world.y + (el.y - this._clipboard[0].y);
            this.app.addElement(el);
        }
    }

    _bringToFront() {
        const selected = [...this.app.selectedIds];
        for (const id of selected) {
            const idx = this.app.elements.findIndex(e => e.id === id);
            if (idx !== -1) {
                const [el] = this.app.elements.splice(idx, 1);
                this.app.elements.push(el);
            }
        }
        this.app.saveHistory();
    }

    _sendToBack() {
        const selected = [...this.app.selectedIds].reverse();
        for (const id of selected) {
            const idx = this.app.elements.findIndex(e => e.id === id);
            if (idx !== -1) {
                const [el] = this.app.elements.splice(idx, 1);
                this.app.elements.unshift(el);
            }
        }
        this.app.saveHistory();
    }

    _addStickyAt(world) {
        const { createStickyNote } = window.__whiteboardApp ? {} : {};
        // Import dynamically handled by canvas.js exports
        const sticky = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            type: 'sticky',
            x: world.x - 100, y: world.y - 100,
            width: 200, height: 200,
            color: this.app.stickyColor || '#FFF176',
            content: '', fontSize: 14, rotation: 0,
        };
        this.app.addElement(sticky);
        this.app.selectedIds = new Set([sticky.id]);
    }

    _addRectAt(world) {
        const rect = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            type: 'rect',
            x: world.x - 75, y: world.y - 50,
            width: 150, height: 100,
            color: this.app.currentColor, fill: this.app.currentFill,
            strokeWidth: 2, rotation: 0,
        };
        this.app.addElement(rect);
        this.app.selectedIds = new Set([rect.id]);
    }

    _addCircleAt(world) {
        const circle = {
            id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            type: 'circle',
            x: world.x - 50, y: world.y - 50,
            width: 100, height: 100,
            color: this.app.currentColor, fill: this.app.currentFill,
            strokeWidth: 2, rotation: 0,
        };
        this.app.addElement(circle);
        this.app.selectedIds = new Set([circle.id]);
    }

    _addTextAt(world) {
        this.app.toolManager.startTextInput(world.x, world.y);
    }

    // === Toast Notifications using Web Awesome alerts ===

    showToast(message, variant = 'neutral') {
        const stack = document.getElementById('wa-toast-stack');
        if (!stack) {
            // Fallback to simple toast
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
            return;
        }

        const iconMap = {
            success: 'circle-check',
            warning: 'triangle-exclamation',
            danger: 'circle-exclamation',
            neutral: 'circle-info',
            primary: 'circle-info',
        };

        const alert = document.createElement('wa-alert');
        alert.variant = variant;
        alert.closable = true;
        alert.duration = 3000;
        alert.style.pointerEvents = 'auto';

        const icon = document.createElement('wa-icon');
        icon.slot = 'icon';
        icon.name = iconMap[variant] || 'circle-info';
        icon.variant = 'regular';
        alert.appendChild(icon);

        alert.appendChild(document.createTextNode(message));

        alert.addEventListener('wa-after-hide', () => alert.remove());

        stack.appendChild(alert);

        // Use requestAnimationFrame to ensure the element is rendered before showing
        requestAnimationFrame(() => {
            alert.toast();
        });
    }
}

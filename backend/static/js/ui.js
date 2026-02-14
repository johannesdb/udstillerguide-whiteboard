// UI Manager - handles UI overlays, modals, and board-level interactions
import { apiFetch, getToken, getUser } from '/js/auth.js?v=4';
import { WhiteboardPlugins } from '/js/plugins.js?v=4';

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
            toggleBtn.innerHTML = `<wa-icon name="sidebar" family="sharp-duotone" variant="thin"></wa-icon>`;
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
                            <wa-button variant="text" size="small" class="copy-link" data-url="${shareUrl}" label="Copy link"><wa-icon name="copy"></wa-icon></wa-button>
                            <wa-button variant="text" size="small" class="regenerate-link" data-id="${link.id}" style="color:var(--wa-color-warning-600)" label="Reset link"><wa-icon name="arrows-rotate"></wa-icon></wa-button>
                            <wa-button variant="text" size="small" class="delete-link" data-id="${link.id}" style="color:var(--wa-color-danger-600)" label="Delete link"><wa-icon name="trash"></wa-icon></wa-button>
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
            e.stopPropagation();
            this.showContextMenu(e);
        });
        // Close on any click outside the menu
        document.addEventListener('mousedown', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) {
                this._hideContextMenu();
            }
        });
    }

    showContextMenu(e) {
        try {
            const world = this.app.camera.screenToWorld(e.offsetX, e.offsetY);
            const hit = this.app.hitTestElements(world.x, world.y);
            const menu = document.getElementById('context-menu-items');
            if (!menu) return;

            menu.innerHTML = '';

            const items = hit
                ? this._buildElementMenuItems(hit, world)
                : this._buildCanvasMenuItems(world);

            for (const item of items) {
                if (item === 'divider') {
                    const divider = document.createElement('div');
                    divider.className = 'ctx-divider';
                    menu.appendChild(divider);
                    continue;
                }
                const menuItem = document.createElement('div');
                menuItem.className = 'ctx-item';
                if (item.icon) {
                    const icon = document.createElement('wa-icon');
                    icon.setAttribute('name', item.icon);
                    icon.setAttribute('family', 'sharp');
                    icon.setAttribute('variant', 'solid');
                    menuItem.appendChild(icon);
                    menuItem.appendChild(document.createTextNode(item.label));
                } else {
                    menuItem.textContent = item.label;
                }
                menuItem.addEventListener('click', () => {
                    item.action();
                    this._hideContextMenu();
                });
                menu.appendChild(menuItem);
            }

            const container = document.getElementById('context-menu');
            container.style.left = e.clientX + 'px';
            container.style.top = e.clientY + 'px';
            container.style.display = 'block';
        } catch (error) {
            console.error('Context menu error:', error);
        }
    }

    _buildElementMenuItems(hit, world) {
        if (!this.app.selectedIds.has(hit.id)) {
            this.app.selectedIds = new Set([hit.id]);
        }
        return [
            { label: 'Cut', icon: 'scissors', action: () => this._cutSelected() },
            { label: 'Copy', icon: 'copy', action: () => this._copySelected() },
            { label: 'Delete', icon: 'trash', action: () => this.app.deleteSelected() },
            'divider',
            { label: 'Bring to Front', icon: 'arrow-up-to-line', action: () => this._bringToFront() },
            { label: 'Send to Back', icon: 'arrow-down-to-line', action: () => this._sendToBack() },
        ];
    }

    _buildCanvasMenuItems(world) {
        return [
            { label: 'Paste', icon: 'paste', action: () => this._paste(world) },
            'divider',
            { label: 'Add Sticky Note', icon: 'note-sticky', action: () => this._addStickyAt(world) },
            { label: 'Add Rectangle', icon: 'square', action: () => this._addRectAt(world) },
            { label: 'Add Circle', icon: 'circle', action: () => this._addCircleAt(world) },
            { label: 'Add Text', icon: 'font', action: () => this._addTextAt(world) },
        ];
    }

    _hideContextMenu() {
        const container = document.getElementById('context-menu');
        if (container) container.style.display = 'none';
    }

    _cutSelected() {
        try {
            this._copySelected();
            this.app.deleteSelected();
        } catch (error) {
            console.error('Cut failed:', error);
        }
    }

    _copySelected() {
        try {
            const els = [];
            for (const id of this.app.selectedIds) {
                const el = this.app.getElementById(id);
                if (el) els.push(JSON.parse(JSON.stringify(el)));
            }
            this._clipboard = els;
            this.showToast('Copied!', 'neutral');
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }

    _paste(world) {
        try {
            if (!this._clipboard || this._clipboard.length === 0) return;
            // Deep clone so we can paste multiple times
            const cloned = JSON.parse(JSON.stringify(this._clipboard));
            const originX = cloned[0].x;
            const originY = cloned[0].y;
            for (const el of cloned) {
                el.id = `el_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                el.x = world.x + (el.x - originX);
                el.y = world.y + (el.y - originY);
                this.app.addElement(el);
            }
        } catch (error) {
            console.error('Paste failed:', error);
        }
    }

    _bringToFront() {
        try {
            const selected = [...this.app.selectedIds];
            for (const id of selected) {
                const idx = this.app.elements.findIndex(e => e.id === id);
                if (idx !== -1) {
                    const [el] = this.app.elements.splice(idx, 1);
                    this.app.elements.push(el);
                }
            }
            this.app.saveHistory();
        } catch (error) {
            console.error('Bring to front failed:', error);
        }
    }

    _sendToBack() {
        try {
            const selected = [...this.app.selectedIds].reverse();
            for (const id of selected) {
                const idx = this.app.elements.findIndex(e => e.id === id);
                if (idx !== -1) {
                    const [el] = this.app.elements.splice(idx, 1);
                    this.app.elements.unshift(el);
                }
            }
            this.app.saveHistory();
        } catch (error) {
            console.error('Send to back failed:', error);
        }
    }

    _addStickyAt(world) {
        try {
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
        } catch (error) {
            console.error('Add sticky failed:', error);
        }
    }

    _addRectAt(world) {
        try {
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
        } catch (error) {
            console.error('Add rect failed:', error);
        }
    }

    _addCircleAt(world) {
        try {
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
        } catch (error) {
            console.error('Add circle failed:', error);
        }
    }

    _addTextAt(world) {
        try {
            this.app.toolManager.startTextInput(world.x, world.y);
        } catch (error) {
            console.error('Add text failed:', error);
        }
    }

    // === Toast Notifications using Web Awesome callouts ===

    showToast(message, variant = 'neutral') {
        const stack = document.getElementById('wa-toast-stack');
        if (!stack) {
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

        const callout = document.createElement('wa-callout');
        callout.variant = variant;
        callout.closable = true;
        callout.style.pointerEvents = 'auto';
        callout.style.transition = 'opacity 0.3s ease';

        const icon = document.createElement('wa-icon');
        icon.slot = 'icon';
        icon.name = iconMap[variant] || 'circle-info';
        icon.variant = 'regular';
        callout.appendChild(icon);

        callout.appendChild(document.createTextNode(message));

        callout.addEventListener('wa-hide', () => callout.remove());

        stack.appendChild(callout);

        setTimeout(() => {
            callout.style.opacity = '0';
            setTimeout(() => callout.remove(), 300);
        }, 3000);
    }
}

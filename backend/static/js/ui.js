// UI Manager - handles UI overlays, modals, and board-level interactions
import { apiFetch, getToken, getUser } from '/js/auth.js';

export class UIManager {
    constructor(app) {
        this.app = app;
        this.setupBackButton();
        this.setupShareButton();
        this.loadBoardInfo();
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

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <h2>Share Board</h2>

            <div style="margin-bottom: 16px">
                <h3 style="font-size:14px; margin-bottom:8px">Add Collaborator</h3>
                <div style="display:flex; gap:8px">
                    <input type="text" id="share-username" placeholder="Username" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px">
                    <select id="share-role" style="padding:8px; border:1px solid #ddd; border-radius:4px">
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                    </select>
                    <button class="btn-primary" id="btn-add-collab" style="padding:8px 16px">Add</button>
                </div>
            </div>

            <div style="margin-bottom: 16px">
                <h3 style="font-size:14px; margin-bottom:8px">Share Links</h3>
                <div id="share-links-list" style="margin-bottom:8px; max-height: 150px; overflow-y: auto"></div>
                <div style="display:flex; gap:8px">
                    <select id="link-role" style="padding:8px; border:1px solid #ddd; border-radius:4px">
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                    </select>
                    <button class="btn-secondary" id="btn-create-link">Create Share Link</button>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-secondary" id="btn-close-share">Close</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close handlers
        const close = () => overlay.remove();
        document.getElementById('btn-close-share').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Add collaborator
        document.getElementById('btn-add-collab').addEventListener('click', async () => {
            const username = document.getElementById('share-username').value.trim();
            const role = document.getElementById('share-role').value;
            if (!username) return;

            try {
                const res = await apiFetch(`/api/boards/${this.app.boardId}/collaborators`, {
                    method: 'POST',
                    body: { username, role },
                });
                if (res.ok) {
                    document.getElementById('share-username').value = '';
                    this.showToast(`Added ${username} as ${role}`);
                } else {
                    const err = await res.json();
                    this.showToast(err.error || 'Failed to add collaborator');
                }
            } catch (e) {
                this.showToast('Failed to add collaborator');
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
                    this.showToast('Share link created and copied!');
                }
            } catch (e) {
                this.showToast('Failed to create share link');
            }
        });

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
                    list.innerHTML = '<div style="color:#999; font-size:13px">No share links yet</div>';
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
                            <span style="color:#666; margin-left:4px">(${link.role})</span>
                        </span>
                        <div style="display:flex; gap:4px">
                            <button class="copy-link" style="padding:2px 8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:12px" data-url="${shareUrl}">Copy</button>
                            <button class="delete-link" style="padding:2px 8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:12px; color:#c62828" data-id="${link.id}">Delete</button>
                        </div>
                    `;
                    list.appendChild(item);

                    item.querySelector('.copy-link').addEventListener('click', async (e) => {
                        await navigator.clipboard.writeText(e.target.dataset.url).catch(() => {});
                        this.showToast('Link copied!');
                    });

                    item.querySelector('.delete-link').addEventListener('click', async (e) => {
                        try {
                            await apiFetch(`/api/boards/${this.app.boardId}/share-links/${e.target.dataset.id}`, {
                                method: 'DELETE',
                            });
                            this.loadShareLinks();
                        } catch (err) {
                            this.showToast('Failed to delete link');
                        }
                    });
                }
            }
        } catch (e) {
            list.innerHTML = '<div style="color:#c62828; font-size:13px">Failed to load links</div>';
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

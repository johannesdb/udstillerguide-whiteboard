// Main app entry point - handles routing between auth, dashboard, and board views
import { isLoggedIn, login, register, logout, apiFetch, getUser } from '/js/auth.js?v=2';
import { errorHandler } from '/js/error-handler.js?v=2';

class App {
    constructor() {
        this.appEl = document.getElementById('app');
        this.route();
    }

    route() {
        const params = new URLSearchParams(window.location.search);
        const shareToken = params.get('share');

        if (shareToken) {
            // Redirect to board with share token
            window.location.href = `/board.html?share=${shareToken}`;
            return;
        }

        if (!isLoggedIn()) {
            this.showAuth();
        } else {
            this.showDashboard();
        }
    }

    showAuth() {
        this.appEl.innerHTML = '';
        this.appEl.style.height = '100vh';
        this.appEl.style.overflow = 'auto';
        document.body.style.overflow = 'auto';

        const container = document.createElement('div');
        container.className = 'auth-container';
        container.innerHTML = `
            <div class="auth-box">
                <h1>Udstillerguide Whiteboard</h1>
                <p id="auth-subtitle">Sign in to your account</p>
                <div class="auth-error" id="auth-error"></div>
                <form id="auth-form">
                    <div class="form-group" id="username-group">
                        <label for="username">Username</label>
                        <input type="text" id="username" required>
                    </div>
                    <div class="form-group" id="email-group" style="display:none">
                        <label for="email">Email</label>
                        <input type="email" id="email">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit" class="btn-primary" style="width:100%" id="auth-submit">Sign In</button>
                </form>
                <div class="auth-link">
                    <a href="#" id="toggle-auth">Don't have an account? Register</a>
                </div>
            </div>
        `;
        this.appEl.appendChild(container);

        let isLogin = true;
        const form = document.getElementById('auth-form');
        const toggle = document.getElementById('toggle-auth');
        const emailGroup = document.getElementById('email-group');
        const subtitle = document.getElementById('auth-subtitle');
        const submitBtn = document.getElementById('auth-submit');
        const errorEl = document.getElementById('auth-error');

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            isLogin = !isLogin;
            emailGroup.style.display = isLogin ? 'none' : 'block';
            subtitle.textContent = isLogin ? 'Sign in to your account' : 'Create a new account';
            submitBtn.textContent = isLogin ? 'Sign In' : 'Register';
            toggle.textContent = isLogin ? "Don't have an account? Register" : 'Already have an account? Sign In';
            errorEl.style.display = 'none';
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorEl.style.display = 'none';
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                if (isLogin) {
                    await login(username, password);
                } else {
                    const email = document.getElementById('email').value;
                    await register(username, email, password);
                }
                this.showDashboard();
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.style.display = 'block';
            }
        });
    }

    async showDashboard() {
        this.appEl.innerHTML = '';
        this.appEl.style.height = 'auto';
        document.body.style.overflow = 'auto';

        const user = getUser();
        const dashboard = document.createElement('div');
        dashboard.className = 'dashboard';
        dashboard.innerHTML = `
            <div class="dashboard-header">
                <h1>My Boards</h1>
                <div class="dashboard-actions">
                    <span style="color:#666; font-size:13px">Hello, ${user?.username || 'User'}</span>
                    <button class="btn-primary" id="btn-new-board">+ New Board</button>
                    <button class="btn-secondary" id="btn-logout">Logout</button>
                </div>
            </div>
            <div class="boards-grid" id="boards-grid">
                <div style="color:#999; padding:40px; text-align:center; grid-column: 1/-1;">Loading boards...</div>
            </div>
        `;
        this.appEl.appendChild(dashboard);

        document.getElementById('btn-logout').addEventListener('click', () => logout());
        document.getElementById('btn-new-board').addEventListener('click', () => this.createBoard());

        await this.loadBoards();
    }

    async loadBoards() {
        const grid = document.getElementById('boards-grid');
        try {
            const res = await apiFetch('/api/boards');
            const boards = await res.json();

            if (boards.length === 0) {
                grid.innerHTML = `
                    <div style="color:#999; padding:60px; text-align:center; grid-column: 1/-1;">
                        <p style="font-size:48px; margin-bottom:16px">+</p>
                        <p>No boards yet. Create your first one!</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = '';
            const user = getUser();
            for (const board of boards) {
                const card = document.createElement('div');
                card.className = 'board-card';
                const date = new Date(board.created_at).toLocaleDateString();
                const isOwner = user && board.owner_id === user.id;
                card.innerHTML = `
                    <div class="board-card-preview">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M8 8h8M8 12h5"/>
                        </svg>
                    </div>
                    <div class="board-card-info">
                        <div class="board-card-name">${this.escapeHtml(board.name)}</div>
                        <div class="board-card-date">Created ${date}</div>
                        <div class="board-card-actions">
                            ${isOwner ? `<button class="rename" data-id="${board.id}">Rename</button>` : ''}
                            ${isOwner ? `<button class="delete" data-id="${board.id}">Delete</button>` : ''}
                        </div>
                    </div>
                `;

                card.addEventListener('click', (e) => {
                    if (e.target.tagName === 'BUTTON') return;
                    window.location.href = `/board.html?id=${board.id}`;
                });

                if (isOwner) {
                    card.querySelector('.rename').addEventListener('click', () => this.renameBoard(board.id, board.name));
                    card.querySelector('.delete').addEventListener('click', () => this.deleteBoard(board.id, board.name));
                }

                grid.appendChild(card);
            }
        } catch (err) {
            grid.innerHTML = `<div style="color:#c62828; padding:40px; text-align:center; grid-column: 1/-1;">Failed to load boards: ${err.message}</div>`;
        }
    }

    async createBoard() {
        const name = prompt('Board name:', 'Untitled Board');
        if (!name) return;

        try {
            const res = await apiFetch('/api/boards', {
                method: 'POST',
                body: { name },
            });
            if (res.ok) {
                const board = await res.json();
                window.location.href = `/board.html?id=${board.id}`;
            }
        } catch (err) {
            alert('Failed to create board: ' + err.message);
        }
    }

    async renameBoard(id, currentName) {
        const name = prompt('New name:', currentName);
        if (!name || name === currentName) return;

        try {
            const res = await apiFetch(`/api/boards/${id}`, {
                method: 'PUT',
                body: { name },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Rename failed');
            }
            await this.loadBoards();
        } catch (err) {
            alert('Failed to rename board: ' + err.message);
        }
    }

    async deleteBoard(id, name) {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

        try {
            const res = await apiFetch(`/api/boards/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Delete failed');
            }
            await this.loadBoards();
        } catch (err) {
            alert('Failed to delete board: ' + err.message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

new App();

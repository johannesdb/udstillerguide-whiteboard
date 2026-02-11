// Main app entry point - handles routing between auth, dashboard, and board views
import { isLoggedIn, login, register, logout, apiFetch, getUser, handleGoogleCallback } from '/js/auth.js?v=3';
import { errorHandler } from '/js/error-handler.js?v=2';

class App {
    constructor() {
        this.appEl = document.getElementById('app');
        this.route();
    }

    route() {
        // Handle Google OAuth callback (token in URL fragment)
        if (handleGoogleCallback()) {
            this.showDashboard();
            return;
        }

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

        // Check for OAuth error in query params
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        if (oauthError) {
            history.replaceState(null, '', window.location.pathname);
        }

        const container = document.createElement('div');
        container.className = 'auth-container';
        container.innerHTML = `
            <div class="auth-box">
                <h1>Udstillerguide Whiteboard</h1>
                <p id="auth-subtitle">Sign in to your account</p>
                <div class="auth-error" id="auth-error">${oauthError ? 'Google login failed. Please try again.' : ''}</div>
                <div id="google-auth-section" style="display:none">
                    <button class="btn-google" id="btn-google-login">
                        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                        Sign in with Google
                    </button>
                    <div class="auth-divider"><span>or</span></div>
                </div>
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

        // Show error if OAuth failed
        const errorEl = document.getElementById('auth-error');
        if (oauthError) {
            errorEl.style.display = 'block';
        }

        // Fetch auth providers and show Google button if enabled
        fetch('/api/auth/providers')
            .then(r => r.json())
            .then(providers => {
                if (providers.google) {
                    document.getElementById('google-auth-section').style.display = 'block';
                }
            })
            .catch(() => {});

        document.getElementById('btn-google-login').addEventListener('click', () => {
            window.location.href = '/api/auth/google';
        });

        let isLogin = true;
        const form = document.getElementById('auth-form');
        const toggle = document.getElementById('toggle-auth');
        const emailGroup = document.getElementById('email-group');
        const subtitle = document.getElementById('auth-subtitle');
        const submitBtn = document.getElementById('auth-submit');

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

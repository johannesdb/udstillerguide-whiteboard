// Auth module - handles login/register and token management

const API_BASE = '';

export function getToken() {
    return localStorage.getItem('wb_token');
}

export function getUser() {
    const data = localStorage.getItem('wb_user');
    return data ? JSON.parse(data) : null;
}

export function setAuth(token, user) {
    localStorage.setItem('wb_token', token);
    localStorage.setItem('wb_user', JSON.stringify(user));
}

export function clearAuth() {
    localStorage.removeItem('wb_token');
    localStorage.removeItem('wb_user');
}

export function isLoggedIn() {
    return !!getToken();
}

export async function register(username, email, password) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setAuth(data.token, data.user);
    return data;
}

export async function login(username, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setAuth(data.token, data.user);
    return data;
}

export function logout() {
    clearAuth();
    window.location.href = '/';
}

export function authHeaders() {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export async function apiFetch(url, options = {}) {
    const headers = {
        ...authHeaders(),
        ...(options.headers || {}),
    };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    if (res.status === 401) {
        clearAuth();
        window.location.href = '/';
        throw new Error('Session expired');
    }
    return res;
}

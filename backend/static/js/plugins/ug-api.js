// UG Plugin - API client for backend UG integration endpoints
// Replaces ug-mock-data.js with real API calls

import { getToken } from '/js/auth.js?v=4';

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const res = await fetch(path, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error: ${res.status}`);
    }

    return res;
}

export async function connectUg(boardId, ugBaseUrl, apiKey, messeId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/connect`, {
        method: 'POST',
        body: { ug_base_url: ugBaseUrl, api_key: apiKey, messe_id: messeId },
    });
    return res.json();
}

export async function disconnectUg(boardId) {
    await apiFetch(`/api/boards/${boardId}/ug/connect`, { method: 'DELETE' });
}

export async function getUgStatus(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/status`);
    return res.json();
}

export async function syncUg(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/sync`, { method: 'POST' });
    return res.json();
}

export async function pushChanges(boardId, changes) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/push`, {
        method: 'POST',
        body: { changes },
    });
    return res.json();
}

// === Compatibility helpers (same interface as ug-mock-data.js) ===

export const STATUS_FARVER = {
    bekraeftet: '#4CAF50',
    afventer:   '#FF9800',
    annulleret: '#f44336',
    ledig:      '#9E9E9E',
};

export function findUdstiller(udstillere, id) {
    return udstillere.find(u => u.id === id) || null;
}

export function getStandeForHal(stande, halId) {
    return stande.filter(s => s.hal_id === halId);
}

export function getStatusTaelling(stande) {
    const counts = { bekraeftet: 0, afventer: 0, annulleret: 0, ledig: 0 };
    for (const stand of stande) {
        if (counts[stand.status] !== undefined) {
            counts[stand.status]++;
        }
    }
    return counts;
}

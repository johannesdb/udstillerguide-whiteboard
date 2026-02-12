// UG Plugin - Sidebar panel UI
// Messe-oversigt, import-knap, stand-liste med filtrering, status-oversigt

import {
    MOCK_MESSE, MOCK_HALLER, MOCK_STANDE, MOCK_UDSTILLERE,
    getUdstiller, getStandeForHal, getStatusTaelling, STATUS_FARVER,
} from './ug-mock-data.js';
import { importMesseData } from './ug-layout.js';

export function renderUgPanel(container, app) {
    container.innerHTML = '';

    // === Messe header ===
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:16px';
    header.innerHTML = `
        <h3 style="margin:0 0 4px; font-size:16px; font-weight:600">${MOCK_MESSE.navn}</h3>
        <div style="font-size:12px; color:var(--wa-color-neutral-500)">
            ${MOCK_MESSE.dato} &middot; ${MOCK_MESSE.lokation}
        </div>
    `;
    container.appendChild(header);

    // === Import-knap ===
    const importSection = document.createElement('div');
    importSection.style.cssText = 'margin-bottom:16px';
    const importBtn = document.createElement('wa-button');
    importBtn.variant = 'brand';
    importBtn.size = 'small';
    importBtn.style.cssText = 'width:100%';
    importBtn.innerHTML = '<wa-icon slot="prefix" name="file-import"></wa-icon> Importer messe-data';
    importBtn.addEventListener('click', () => {
        try {
            const count = importMesseData(app);
            showPanelToast(container, `${count} elementer importeret`, 'success');
        } catch (error) {
            showPanelToast(container, 'Fejl ved import', 'danger');
        }
    });
    importSection.appendChild(importBtn);
    container.appendChild(importSection);

    // === Status-oversigt ===
    const counts = getStatusTaelling();
    const statusSection = document.createElement('div');
    statusSection.style.cssText = 'margin-bottom:16px';
    statusSection.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Status</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
            ${statusBadge('Bekr\u00e6ftet', counts.bekraeftet, STATUS_FARVER.bekraeftet)}
            ${statusBadge('Afventer', counts.afventer, STATUS_FARVER.afventer)}
            ${statusBadge('Annulleret', counts.annulleret, STATUS_FARVER.annulleret)}
            ${statusBadge('Ledig', counts.ledig, STATUS_FARVER.ledig)}
        </div>
    `;
    container.appendChild(statusSection);

    // === Hal-oversigt ===
    const halSection = document.createElement('div');
    halSection.style.cssText = 'margin-bottom:16px';
    halSection.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Haller</h4>
    `;
    for (const hal of MOCK_HALLER) {
        const stande = getStandeForHal(hal.id);
        const optaget = stande.filter(s => s.status !== 'ledig').length;
        const halCard = document.createElement('div');
        halCard.style.cssText = `
            padding:8px 10px; margin-bottom:6px; border-radius:6px;
            border-left:4px solid ${hal.farve}; background:var(--wa-color-neutral-50);
            font-size:13px;
        `;
        halCard.innerHTML = `
            <div style="font-weight:600">${hal.navn}</div>
            <div style="color:var(--wa-color-neutral-500); font-size:11px">
                ${stande.length} stande &middot; ${optaget} optaget &middot; ${stande.length - optaget} ledige
            </div>
        `;
        halSection.appendChild(halCard);
    }
    container.appendChild(halSection);

    // === Stand-liste med filtrering ===
    const standeSection = document.createElement('div');
    standeSection.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Stande</h4>
    `;

    // Filter
    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px';
    const filterSelect = document.createElement('wa-select');
    filterSelect.size = 'small';
    filterSelect.value = 'alle';
    filterSelect.style.cssText = 'flex:1';
    filterSelect.innerHTML = `
        <wa-option value="alle">Alle</wa-option>
        <wa-option value="bekraeftet">Bekr\u00e6ftet</wa-option>
        <wa-option value="afventer">Afventer</wa-option>
        <wa-option value="ledig">Ledig</wa-option>
        <wa-option value="annulleret">Annulleret</wa-option>
    `;
    filterRow.appendChild(filterSelect);
    standeSection.appendChild(filterRow);

    // Stand-liste container
    const standList = document.createElement('div');
    standList.id = 'ug-stand-list';
    standList.style.cssText = 'max-height:300px; overflow-y:auto';
    standeSection.appendChild(standList);
    container.appendChild(standeSection);

    function renderStandList(filter) {
        standList.innerHTML = '';
        const filtered = filter === 'alle'
            ? MOCK_STANDE
            : MOCK_STANDE.filter(s => s.status === filter);

        for (const stand of filtered) {
            const udstiller = getUdstiller(stand.udstillerId);
            const item = document.createElement('div');
            item.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:6px 8px; border-radius:4px; margin-bottom:4px;
                background:white; border:1px solid var(--wa-color-neutral-200);
                font-size:12px; cursor:pointer;
            `;
            item.innerHTML = `
                <span style="width:8px; height:8px; border-radius:50%; background:${STATUS_FARVER[stand.status]}; flex-shrink:0"></span>
                <span style="font-weight:600; min-width:32px">${stand.standnummer}</span>
                <span style="flex:1; color:var(--wa-color-neutral-600); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    ${udstiller ? udstiller.firmanavn : 'Ledig'}
                </span>
            `;

            // Klik: find og zoom til standen paa canvas
            item.addEventListener('click', () => {
                const standEl = app.elements.find(e =>
                    e.type === 'ug-stand' && e.external?.data?.standnummer === stand.standnummer
                );
                if (standEl) {
                    app.camera.x = standEl.x + standEl.width / 2 - window.innerWidth / 2;
                    app.camera.y = standEl.y + standEl.height / 2 - window.innerHeight / 2;
                    app.selectedIds = new Set([standEl.id]);
                }
            });

            standList.appendChild(item);
        }

        if (filtered.length === 0) {
            standList.innerHTML = '<div style="color:var(--wa-color-neutral-400); font-size:12px; padding:8px">Ingen stande med dette filter</div>';
        }
    }

    // Initial render
    renderStandList('alle');

    // Filter change
    filterSelect.addEventListener('wa-change', () => {
        renderStandList(filterSelect.value);
    });
}

// === Hjælper-funktioner ===

function statusBadge(label, count, color) {
    return `
        <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; background:var(--wa-color-neutral-50)">
            <span style="width:10px; height:10px; border-radius:50%; background:${color}"></span>
            <span style="font-size:12px; flex:1">${label}</span>
            <span style="font-size:14px; font-weight:700">${count}</span>
        </div>
    `;
}

function showPanelToast(container, message, variant) {
    // Brug UIManager toast hvis tilgaengelig
    const app = window.__whiteboardApp;
    if (app && app.uiManager) {
        app.uiManager.showToast(message, variant);
    }
}

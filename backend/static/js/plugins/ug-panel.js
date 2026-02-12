// UG Plugin - Sidebar panel UI
// Three states: not connected (form), connected (data overview), loading

import {
    connectUg, disconnectUg, getUgStatus, syncUg,
    STATUS_FARVER, findUdstiller, getStandeForHal, getStatusTaelling,
} from './ug-api.js?v=4';
import { importMesseData } from './ug-layout.js?v=4';

export function renderUgPanel(container, app) {
    container.innerHTML = '<div style="padding:8px; color:var(--wa-color-neutral-500); font-size:12px">Indlæser...</div>';

    const boardId = app.boardId;
    if (!boardId) {
        container.innerHTML = '<div style="padding:8px; color:var(--wa-color-neutral-500)">Intet board valgt</div>';
        return;
    }

    getUgStatus(boardId)
        .then(status => {
            if (status.connected) {
                renderConnectedPanel(container, app, status);
            } else {
                renderConnectForm(container, app);
            }
        })
        .catch(err => {
            console.error('UG Panel: status check failed:', err);
            renderConnectForm(container, app);
        });
}

function renderConnectForm(container, app) {
    container.innerHTML = '';

    const section = document.createElement('div');
    section.style.cssText = 'padding:4px 0';
    section.innerHTML = `
        <h3 style="margin:0 0 12px; font-size:16px; font-weight:600">Forbind til UG Core</h3>
        <p style="font-size:12px; color:var(--wa-color-neutral-500); margin:0 0 16px">
            Indtast forbindelsesoplysninger til UG Core for at importere messedata.
        </p>
    `;

    const urlInput = document.createElement('wa-input');
    urlInput.label = 'UG Core URL';
    urlInput.placeholder = 'https://ug-core.example.com';
    urlInput.size = 'small';
    urlInput.style.cssText = 'margin-bottom:10px; width:100%';
    section.appendChild(urlInput);

    const keyInput = document.createElement('wa-input');
    keyInput.label = 'API-nøgle';
    keyInput.type = 'password';
    keyInput.size = 'small';
    keyInput.style.cssText = 'margin-bottom:10px; width:100%';
    section.appendChild(keyInput);

    const messeInput = document.createElement('wa-input');
    messeInput.label = 'Messe-ID';
    messeInput.placeholder = 'messe-001';
    messeInput.size = 'small';
    messeInput.style.cssText = 'margin-bottom:16px; width:100%';
    section.appendChild(messeInput);

    const connectBtn = document.createElement('wa-button');
    connectBtn.variant = 'brand';
    connectBtn.size = 'small';
    connectBtn.style.cssText = 'width:100%';
    connectBtn.innerHTML = '<wa-icon slot="prefix" name="plug"></wa-icon> Forbind';
    connectBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        const messeId = messeInput.value.trim();

        if (!url || !key || !messeId) {
            showPanelToast(app, 'Udfyld alle felter', 'warning');
            return;
        }

        connectBtn.loading = true;
        try {
            const data = await connectUg(app.boardId, url, key, messeId);
            const count = importMesseData(app, data);
            showPanelToast(app, `Forbundet! ${count} elementer importeret`, 'success');
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Fejl: ${error.message}`, 'danger');
        } finally {
            connectBtn.loading = false;
        }
    });
    section.appendChild(connectBtn);

    container.appendChild(section);
}

function renderConnectedPanel(container, app, status) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:16px';
    const lastSync = status.last_synced
        ? new Date(status.last_synced).toLocaleString('da-DK')
        : 'Aldrig';
    header.innerHTML = `
        <h3 style="margin:0 0 4px; font-size:16px; font-weight:600">UG Core</h3>
        <div style="font-size:12px; color:var(--wa-color-neutral-500)">
            Messe: ${status.messe_id} &middot; Synkroniseret: ${lastSync}
        </div>
    `;
    container.appendChild(header);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:6px; margin-bottom:16px';

    const syncBtn = document.createElement('wa-button');
    syncBtn.variant = 'brand';
    syncBtn.size = 'small';
    syncBtn.style.cssText = 'flex:1';
    syncBtn.innerHTML = '<wa-icon slot="prefix" name="arrows-rotate"></wa-icon> Synkroniser';
    syncBtn.addEventListener('click', async () => {
        syncBtn.loading = true;
        try {
            const data = await syncUg(app.boardId);
            if (data.haller) {
                const count = importMesseData(app, data);
                showPanelToast(app, `${count} elementer opdateret`, 'success');
            } else if (data.changes) {
                showPanelToast(app, `${data.changes.length} ændringer hentet`, 'success');
            }
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Sync fejl: ${error.message}`, 'danger');
        } finally {
            syncBtn.loading = false;
        }
    });
    btnRow.appendChild(syncBtn);

    const disconnectBtn = document.createElement('wa-button');
    disconnectBtn.variant = 'default';
    disconnectBtn.size = 'small';
    disconnectBtn.innerHTML = '<wa-icon slot="prefix" name="plug-circle-xmark"></wa-icon> Afbryd';
    disconnectBtn.addEventListener('click', async () => {
        try {
            await disconnectUg(app.boardId);
            showPanelToast(app, 'Afbrudt fra UG Core', 'success');
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Fejl: ${error.message}`, 'danger');
        }
    });
    btnRow.appendChild(disconnectBtn);
    container.appendChild(btnRow);

    renderLiveDataOverview(container, app);
}

async function renderLiveDataOverview(container, app) {
    try {
        const data = await syncUg(app.boardId);
        if (data.haller && data.stande) {
            renderStatusSection(container, data.stande);
            renderHalSection(container, data.haller, data.stande);
            renderStandList(container, app, data.stande, data.udstillere);
        }
    } catch (error) {
        const fallback = document.createElement('div');
        fallback.style.cssText = 'font-size:12px; color:var(--wa-color-neutral-400); padding:8px';
        fallback.textContent = 'Kunne ikke hente live data. Brug Synkroniser-knappen.';
        container.appendChild(fallback);
    }
}

function renderStatusSection(container, stande) {
    const counts = getStatusTaelling(stande);
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px';
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Status</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
            ${statusBadge('Bekræftet', counts.bekraeftet, STATUS_FARVER.bekraeftet)}
            ${statusBadge('Afventer', counts.afventer, STATUS_FARVER.afventer)}
            ${statusBadge('Annulleret', counts.annulleret, STATUS_FARVER.annulleret)}
            ${statusBadge('Ledig', counts.ledig, STATUS_FARVER.ledig)}
        </div>
    `;
    container.appendChild(section);
}

function renderHalSection(container, haller, stande) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px';
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Haller</h4>
    `;
    for (const hal of haller) {
        const halStande = getStandeForHal(stande, hal.id);
        const optaget = halStande.filter(s => s.status !== 'ledig').length;
        const card = document.createElement('div');
        card.style.cssText = `
            padding:8px 10px; margin-bottom:6px; border-radius:6px;
            border-left:4px solid ${hal.farve}; background:var(--wa-color-neutral-50);
            font-size:13px;
        `;
        card.innerHTML = `
            <div style="font-weight:600">${hal.navn}</div>
            <div style="color:var(--wa-color-neutral-500); font-size:11px">
                ${halStande.length} stande &middot; ${optaget} optaget &middot; ${halStande.length - optaget} ledige
            </div>
        `;
        section.appendChild(card);
    }
    container.appendChild(section);
}

function renderStandList(container, app, stande, udstillere) {
    const section = document.createElement('div');
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Stande</h4>
    `;

    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px';
    const filterSelect = document.createElement('wa-select');
    filterSelect.size = 'small';
    filterSelect.value = 'alle';
    filterSelect.style.cssText = 'flex:1';
    filterSelect.innerHTML = `
        <wa-option value="alle">Alle</wa-option>
        <wa-option value="bekraeftet">Bekræftet</wa-option>
        <wa-option value="afventer">Afventer</wa-option>
        <wa-option value="ledig">Ledig</wa-option>
        <wa-option value="annulleret">Annulleret</wa-option>
    `;
    filterRow.appendChild(filterSelect);
    section.appendChild(filterRow);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'max-height:300px; overflow-y:auto';
    section.appendChild(listContainer);
    container.appendChild(section);

    function renderList(filter) {
        listContainer.innerHTML = '';
        const filtered = filter === 'alle' ? stande : stande.filter(s => s.status === filter);

        for (const stand of filtered) {
            const udstiller = findUdstiller(udstillere, stand.udstiller_id);
            const item = document.createElement('div');
            item.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:6px 8px; border-radius:4px; margin-bottom:4px;
                background:white; border:1px solid var(--wa-color-neutral-200);
                font-size:12px; cursor:pointer;
            `;
            item.innerHTML = `
                <span style="width:8px; height:8px; border-radius:50%; background:${STATUS_FARVER[stand.status] || '#999'}; flex-shrink:0"></span>
                <span style="font-weight:600; min-width:32px">${stand.standnummer}</span>
                <span style="flex:1; color:var(--wa-color-neutral-600); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    ${udstiller ? udstiller.firmanavn : 'Ledig'}
                </span>
            `;
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
            listContainer.appendChild(item);
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="color:var(--wa-color-neutral-400); font-size:12px; padding:8px">Ingen stande med dette filter</div>';
        }
    }

    renderList('alle');
    filterSelect.addEventListener('wa-change', () => renderList(filterSelect.value));
}

function statusBadge(label, count, color) {
    return `
        <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; background:var(--wa-color-neutral-50)">
            <span style="width:10px; height:10px; border-radius:50%; background:${color}"></span>
            <span style="font-size:12px; flex:1">${label}</span>
            <span style="font-size:14px; font-weight:700">${count}</span>
        </div>
    `;
}

function showPanelToast(app, message, variant) {
    if (app && app.uiManager) {
        app.uiManager.showToast(message, variant);
    }
}

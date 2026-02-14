// UG Plugin - Auto-layout: genererer whiteboard-elementer fra messe-data
// Producerer to views: (1) Spatial gulvplan, (2) Hierarki-diagram

import { generateId, createConnector } from '/js/canvas.js?v=4';
import { STATUS_FARVER, findUdstiller, getStandeForHal } from './ug-api.js?v=4';
import { UG_ELEMENT_TYPES } from './ug-elements.js?v=4';

// Read a CSS custom property from :root, with fallback
function getBrandColor(varName, fallback) {
    try {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return val || fallback;
    } catch (e) {
        return fallback;
    }
}

// === Gulvplan (View 1) ===

export function generateGulvplan(app, data, originX = 100, originY = 100) {
    const elements = [];
    const gap = 60;
    let halX = originX;

    for (const hal of data.haller) {
        // Opret hal-element
        const halEl = {
            id: generateId(),
            type: 'ug-hal',
            x: halX,
            y: originY,
            width: hal.bredde,
            height: hal.hoejde,
            color: hal.farve,
            fill: hexToRgba(hal.farve, 0.06),
            content: hal.navn,
            fontSize: 20,
            external: {
                id: hal.id,
                type: 'hal',
                syncStatus: 'synced',
                data: { ...hal },
            },
        };
        elements.push(halEl);

        // Placer stande inden i hallen i et grid
        const stande = getStandeForHal(data.stande, hal.id);
        const standPadding = 20;
        const headerH = 45; // plads til hal-navn
        const standGap = 15;
        const cols = Math.floor((hal.bredde - standPadding * 2 + standGap) / (130 + standGap)) || 1;

        stande.forEach((stand, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const udstiller = findUdstiller(data.udstillere, stand.udstiller_id);
            const standLabel = udstiller ? udstiller.firmanavn : 'LEDIG';

            const standEl = {
                id: generateId(),
                type: 'ug-stand',
                x: halX + standPadding + col * (stand.bredde + standGap),
                y: originY + headerH + standPadding + row * (stand.hoejde + standGap),
                width: stand.bredde,
                height: stand.hoejde,
                color: STATUS_FARVER[stand.status],
                content: `${stand.standnummer}\n${standLabel}`,
                fontSize: 14,
                external: {
                    id: stand.id,
                    type: 'stand',
                    syncStatus: 'synced',
                    data: {
                        standnummer: stand.standnummer,
                        udstiller: standLabel,
                        status: stand.status,
                        hal_id: hal.id,
                    },
                },
            };
            elements.push(standEl);
        });

        halX += hal.bredde + gap;
    }

    return elements;
}

// === Hierarki-diagram (View 2) ===

export function generateHierarki(app, data, originX = 100, originY = 600) {
    const elements = [];
    const connectors = [];
    const nodeW = 160;
    const nodeH = 40;
    const levelGap = 100;
    const siblingGap = 30;

    // Root: Messe
    const messeEl = makeNode(originX + 300, originY, nodeW + 40, nodeH + 10, data.messe.navn, 'messe');
    elements.push(messeEl);

    // Level 1: Haller
    const halStartX = originX + 100;
    const halY = originY + levelGap;
    const halEls = [];

    data.haller.forEach((hal, idx) => {
        const x = halStartX + idx * (nodeW + siblingGap);
        const el = makeNode(x, halY, nodeW, nodeH, hal.navn, 'hal', hal.farve);
        elements.push(el);
        halEls.push(el);

        // Connector messe -> hal
        connectors.push(createConnector(messeEl.id, el.id, 'auto', 'auto', getBrandColor('--brand-text-muted', '#64748b'), 1.5));
    });

    // Level 2: Taxonomier (ved siden af haller)
    const taxRoots = data.taxonomier.filter(t => t.parent === null);
    const taxStartX = halStartX + data.haller.length * (nodeW + siblingGap) + 60;

    taxRoots.forEach((taxRoot, idx) => {
        const x = taxStartX + idx * (nodeW + siblingGap);
        const rootEl = makeNode(x, halY, nodeW, nodeH, taxRoot.navn, 'taxonomi', getBrandColor('--brand-accent', '#E07A5F'));
        elements.push(rootEl);

        // Connector messe -> taxonomi
        connectors.push(createConnector(messeEl.id, rootEl.id, 'auto', 'auto', getBrandColor('--brand-text-muted', '#64748b'), 1));

        // Level 3: Underkategorier
        const children = data.taxonomier.filter(t => t.parent === taxRoot.id);
        const childY = halY + levelGap;
        const childStartX = x - ((children.length - 1) * (nodeW * 0.7 + 10)) / 2;

        children.forEach((child, ci) => {
            const cx = childStartX + ci * (nodeW * 0.7 + 10);
            const highlightColor = getBrandColor('--brand-highlight', '#7FBEC6');
            const childEl = makeNode(cx, childY, nodeW * 0.7, nodeH - 5, child.navn, 'taxonomi', highlightColor);
            elements.push(childEl);
            connectors.push(createConnector(rootEl.id, childEl.id, 'auto', 'auto', highlightColor, 1));
        });
    });

    return [...elements, ...connectors];
}

// === Hjælper: opret en node-element til hierarki ===

function makeNode(x, y, w, h, label, nodeType, color = null) {
    color = color || getBrandColor('--brand-text', '#1d2327');
    return {
        id: generateId(),
        type: 'rect',
        x, y, width: w, height: h,
        color,
        fill: hexToRgba(color, 0.08),
        strokeWidth: 2,
        rotation: 0,
        content: label,
        _ugNodeType: nodeType, // intern markering
    };
}

// === Importér begge views til et board ===

export function importMesseData(app, data) {
    try {
        // Beregn startposition centreret ift. viewport
        const cam = app.camera;
        const viewCenter = cam.screenToWorld(window.innerWidth / 2, window.innerHeight / 3);

        // Generér gulvplan (oppe)
        const gulvplanEls = generateGulvplan(app, data, viewCenter.x - 400, viewCenter.y - 200);

        // Generér hierarki (nedenunder)
        const hierarkiY = viewCenter.y + 300;
        const hierarkiEls = generateHierarki(app, data, viewCenter.x - 400, hierarkiY);

        // Tilfoej alle elementer til whiteboard
        const allEls = [...gulvplanEls, ...hierarkiEls];
        for (const el of allEls) {
            app.addElement(el);
        }

        return allEls.length;
    } catch (error) {
        console.error('UG Plugin: Fejl ved import af messe-data:', error);
        throw error;
    }
}

// === Utility ===

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// UG Plugin - Custom element types: ug-hal, ug-stand, ug-udstiller
// Render og hitTest funktioner der integreres via WhiteboardPlugins
// draw(ctx, el, app) - app is the WhiteboardApp instance (provides app.camera)

import { STATUS_FARVER } from './ug-mock-data.js';

// === ug-hal: Hal/container ===

function drawHal(ctx, el, app) {
    const cam = app.camera;
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Let baggrund
    ctx.fillStyle = el.fill || 'rgba(33, 150, 243, 0.06)';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.fill();

    // Border (dashed for container-feel)
    ctx.strokeStyle = el.color || '#2196F3';
    ctx.lineWidth = 2 * cam.zoom;
    ctx.setLineDash([8 * cam.zoom, 4 * cam.zoom]);
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hal-navn i toppen
    const fontSize = (el.fontSize || 20) * cam.zoom;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = el.color || '#2196F3';
    ctx.textBaseline = 'top';
    const padding = 12 * cam.zoom;
    ctx.fillText(el.content || '', s.x + padding, s.y + padding);

    // Sync-status indikator (lille cirkel oppe i hoejre hjoerne)
    if (el.external) {
        const indicatorR = 5 * cam.zoom;
        const ix = s.x + sw - padding;
        const iy = s.y + padding + indicatorR;
        const statusColors = { synced: '#4CAF50', pending: '#FF9800', conflict: '#f44336', 'local-only': '#9E9E9E' };
        ctx.beginPath();
        ctx.arc(ix, iy, indicatorR, 0, Math.PI * 2);
        ctx.fillStyle = statusColors[el.external.syncStatus] || '#9E9E9E';
        ctx.fill();
    }
}

function hitTestHal(px, py, el) {
    return px >= el.x && px <= el.x + el.width &&
           py >= el.y && py <= el.y + el.height;
}

// === ug-stand: Stand/booth ===

function drawStand(ctx, el, app) {
    const cam = app.camera;
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Status-farve fra external data eller element color
    const status = el.external?.data?.status || 'ledig';
    const statusColor = STATUS_FARVER[status] || el.color || '#9E9E9E';

    // Baggrund
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
    ctx.fill();

    // Border med status-farve
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2.5 * cam.zoom;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
    ctx.stroke();

    // Status-farve bar i toppen
    const barH = 6 * cam.zoom;
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, barH, [4 * cam.zoom, 4 * cam.zoom, 0, 0]);
    ctx.fill();

    // Tekst indhold
    const padding = 8 * cam.zoom;
    const contentY = s.y + barH + padding;
    const lines = (el.content || '').split('\n');

    // Standnummer (bold, stoerre)
    if (lines[0]) {
        const numFontSize = Math.min(16, (el.fontSize || 14)) * cam.zoom;
        ctx.font = `bold ${numFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textBaseline = 'top';
        ctx.fillText(lines[0], s.x + padding, contentY, sw - padding * 2);
    }

    // Udstiller/info (normal, mindre)
    if (lines[1]) {
        const infoFontSize = Math.min(12, (el.fontSize || 14) - 2) * cam.zoom;
        ctx.font = `${infoFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#666';
        const lineH = Math.min(16, (el.fontSize || 14)) * 1.4 * cam.zoom;
        ctx.fillText(lines[1], s.x + padding, contentY + lineH, sw - padding * 2);
    }
}

function hitTestStand(px, py, el) {
    return px >= el.x && px <= el.x + el.width &&
           py >= el.y && py <= el.y + el.height;
}

// === ug-udstiller: Exhibitor card ===

function drawUdstiller(ctx, el, app) {
    const cam = app.camera;
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Baggrund med skygge
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 6 * cam.zoom;
    ctx.shadowOffsetY = 2 * cam.zoom;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.fill();
    ctx.restore();

    // Blaa accent-linje til venstre
    const accentW = 4 * cam.zoom;
    ctx.fillStyle = '#2196F3';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, accentW, sh, [6 * cam.zoom, 0, 0, 6 * cam.zoom]);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1 * cam.zoom;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.stroke();

    // Tekst indhold
    const padding = 12 * cam.zoom;
    const lines = (el.content || '').split('\n');
    let yPos = s.y + padding;

    // Firmanavn (bold)
    if (lines[0]) {
        const nameFontSize = 14 * cam.zoom;
        ctx.font = `bold ${nameFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textBaseline = 'top';
        ctx.fillText(lines[0], s.x + padding + accentW, yPos, sw - padding * 2 - accentW);
        yPos += nameFontSize * 1.5;
    }

    // Resterende linjer (normal tekst)
    const infoFontSize = 12 * cam.zoom;
    ctx.font = `${infoFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = '#666';
    for (let i = 1; i < lines.length; i++) {
        ctx.fillText(lines[i], s.x + padding + accentW, yPos, sw - padding * 2 - accentW);
        yPos += infoFontSize * 1.5;
    }
}

function hitTestUdstiller(px, py, el) {
    return px >= el.x && px <= el.x + el.width &&
           py >= el.y && py <= el.y + el.height;
}

// === Export element type definitions ===

export const UG_ELEMENT_TYPES = {
    'ug-hal': {
        draw: drawHal,
        hitTest: hitTestHal,
        defaults: {
            width: 600, height: 400,
            color: '#2196F3',
            fill: 'rgba(33, 150, 243, 0.06)',
            fontSize: 20,
        },
    },
    'ug-stand': {
        draw: drawStand,
        hitTest: hitTestStand,
        defaults: {
            width: 120, height: 80,
            color: '#9E9E9E',
            fontSize: 14,
        },
    },
    'ug-udstiller': {
        draw: drawUdstiller,
        hitTest: hitTestUdstiller,
        defaults: {
            width: 180, height: 100,
            fontSize: 14,
        },
    },
};

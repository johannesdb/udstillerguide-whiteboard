// UG Plugin - Custom element types: ug-hal, ug-stand, ug-udstiller
// Render og hitTest funktioner der integreres via WhiteboardPlugins
// draw(ctx, el, app) - app is the WhiteboardApp instance (provides app.camera, app.theme)

import { STATUS_FARVER } from './ug-api.js?v=4';

// === ug-hal: Hal/container ===

function drawHal(ctx, el, app) {
    const cam = app.camera;
    const t = app.theme || {};
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Let baggrund — brand primary med alpha fallback
    const primaryColor = el.color || t.brandPrimary || '#314F59';
    ctx.fillStyle = el.fill || hexToRgba(primaryColor, 0.06);
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.fill();

    // Border (dashed for container-feel)
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2 * cam.zoom;
    ctx.setLineDash([8 * cam.zoom, 4 * cam.zoom]);
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hal-navn i toppen
    const fontSize = (el.fontSize || 20) * cam.zoom;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = primaryColor;
    ctx.textBaseline = 'top';
    const padding = 12 * cam.zoom;
    ctx.fillText(el.content || '', s.x + padding, s.y + padding);

    // Sync-status indikator (lille cirkel oppe i hoejre hjoerne)
    // STATUS_FARVER er semantiske og beholdes uændret
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
    const t = app.theme || {};
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Status-farve fra external data eller element color (semantiske, beholdes)
    const status = el.external?.data?.status || 'ledig';
    const statusColor = STATUS_FARVER[status] || el.color || '#9E9E9E';

    // Baggrund
    ctx.fillStyle = t.brandSurface || '#ffffff';
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
        ctx.fillStyle = t.brandText || '#1d2327';
        ctx.textBaseline = 'top';
        ctx.fillText(lines[0], s.x + padding, contentY, sw - padding * 2);
    }

    // Udstiller/info (normal, mindre)
    if (lines[1]) {
        const infoFontSize = Math.min(12, (el.fontSize || 14) - 2) * cam.zoom;
        ctx.font = `${infoFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = t.brandTextMuted || '#64748b';
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
    const t = app.theme || {};
    const s = cam.worldToScreen(el.x, el.y);
    const sw = el.width * cam.zoom;
    const sh = el.height * cam.zoom;

    // Baggrund med skygge (shadow er neutral, beholdes)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 6 * cam.zoom;
    ctx.shadowOffsetY = 2 * cam.zoom;
    ctx.fillStyle = t.brandSurface || '#ffffff';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, sw, sh, 6 * cam.zoom);
    ctx.fill();
    ctx.restore();

    // Brand accent-linje til venstre (was Material blue, now brand primary)
    const accentW = 4 * cam.zoom;
    ctx.fillStyle = t.brandPrimary || '#314F59';
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, accentW, sh, [6 * cam.zoom, 0, 0, 6 * cam.zoom]);
    ctx.fill();

    // Border
    ctx.strokeStyle = t.brandBorder || '#e2e8f0';
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
        ctx.fillStyle = t.brandText || '#1d2327';
        ctx.textBaseline = 'top';
        ctx.fillText(lines[0], s.x + padding + accentW, yPos, sw - padding * 2 - accentW);
        yPos += nameFontSize * 1.5;
    }

    // Resterende linjer (normal tekst)
    const infoFontSize = 12 * cam.zoom;
    ctx.font = `${infoFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = t.brandTextMuted || '#64748b';
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

// Helper for default fill using brand primary with alpha
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const UG_ELEMENT_TYPES = {
    'ug-hal': {
        draw: drawHal,
        hitTest: hitTestHal,
        defaults: {
            width: 600, height: 400,
            color: '#314F59',
            fill: 'rgba(49, 79, 89, 0.06)',
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

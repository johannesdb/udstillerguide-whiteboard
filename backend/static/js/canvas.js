// Canvas rendering engine - the core of the whiteboard
// Implements: camera, world coordinates, render loop, hit testing, element management

import { ToolManager } from '/js/tools.js';
import { UIManager } from '/js/ui.js';
import { SyncManager } from '/js/sync.js';
import { getToken } from '/js/auth.js';

// Generate unique IDs
let idCounter = 0;
export function generateId() {
    return `el_${Date.now()}_${idCounter++}_${Math.random().toString(36).substr(2, 6)}`;
}

// === Camera ===
export class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
    }

    worldToScreen(wx, wy) {
        return {
            x: (wx - this.x) * this.zoom,
            y: (wy - this.y) * this.zoom,
        };
    }

    screenToWorld(sx, sy) {
        return {
            x: sx / this.zoom + this.x,
            y: sy / this.zoom + this.y,
        };
    }

    zoomAt(sx, sy, delta) {
        const worldBefore = this.screenToWorld(sx, sy);
        const factor = delta > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom * factor));
        const worldAfter = this.screenToWorld(sx, sy);
        this.x += worldBefore.x - worldAfter.x;
        this.y += worldBefore.y - worldAfter.y;
    }

    pan(dx, dy) {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
    }
}

// === Element Types ===
export function createStickyNote(x, y, color = '#FFF176') {
    return {
        id: generateId(),
        type: 'sticky',
        x, y,
        width: 200,
        height: 200,
        color,
        content: '',
        fontSize: 14,
        rotation: 0,
    };
}

export function createRect(x, y, w, h, color = '#333333', fill = 'transparent') {
    return {
        id: generateId(),
        type: 'rect',
        x, y,
        width: w,
        height: h,
        color,
        fill,
        strokeWidth: 2,
        rotation: 0,
    };
}

export function createCircle(x, y, rx, ry, color = '#333333', fill = 'transparent') {
    return {
        id: generateId(),
        type: 'circle',
        x, y,
        width: rx * 2,
        height: ry * 2,
        color,
        fill,
        strokeWidth: 2,
        rotation: 0,
    };
}

export function createLine(x1, y1, x2, y2, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(),
        type: 'line',
        x: x1, y: y1,
        x2, y2,
        color,
        strokeWidth,
    };
}

export function createArrow(x1, y1, x2, y2, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(),
        type: 'arrow',
        x: x1, y: y1,
        x2, y2,
        color,
        strokeWidth,
    };
}

export function createDrawing(points, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(),
        type: 'drawing',
        points, // [{x, y}, ...]
        color,
        strokeWidth,
        x: 0, y: 0,
    };
}

export function createText(x, y, content, color = '#333333', fontSize = 16) {
    return {
        id: generateId(),
        type: 'text',
        x, y,
        content,
        color,
        fontSize,
        width: 0,
        height: 0,
    };
}

// === Hit Testing ===
function pointInRect(px, py, el) {
    return px >= el.x && px <= el.x + el.width &&
           py >= el.y && py <= el.y + el.height;
}

function pointInCircle(px, py, el) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = el.width / 2;
    const ry = el.height / 2;
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
}

function pointNearLine(px, py, x1, y1, x2, y2, threshold = 8) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1) <= threshold;

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;
    return Math.hypot(px - nearX, py - nearY) <= threshold;
}

function pointNearDrawing(px, py, el, threshold = 8) {
    for (let i = 1; i < el.points.length; i++) {
        const p0 = el.points[i - 1];
        const p1 = el.points[i];
        if (pointNearLine(px, py, p0.x, p0.y, p1.x, p1.y, threshold)) {
            return true;
        }
    }
    return false;
}

export function hitTest(px, py, el, zoom = 1) {
    const threshold = 8 / zoom;
    switch (el.type) {
        case 'sticky':
        case 'rect':
            return pointInRect(px, py, el);
        case 'circle':
            return pointInCircle(px, py, el);
        case 'line':
        case 'arrow':
            return pointNearLine(px, py, el.x, el.y, el.x2, el.y2, threshold);
        case 'drawing':
            return pointNearDrawing(px, py, el, threshold);
        case 'text':
            return pointInRect(px, py, {
                x: el.x,
                y: el.y - el.fontSize,
                width: el.width || el.content.length * el.fontSize * 0.6,
                height: el.height || el.fontSize * 1.4,
            });
        default:
            return false;
    }
}

// === Resize Handle Hit Test ===
export function hitTestResizeHandle(px, py, el, zoom = 1) {
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'drawing') return null;

    const handleSize = 8 / zoom;
    const handles = getResizeHandles(el);

    for (const [name, hx, hy] of handles) {
        if (Math.abs(px - hx) <= handleSize && Math.abs(py - hy) <= handleSize) {
            return name;
        }
    }
    return null;
}

function getResizeHandles(el) {
    const { x, y, width, height } = el;
    return [
        ['nw', x, y],
        ['ne', x + width, y],
        ['sw', x, y + height],
        ['se', x + width, y + height],
    ];
}

// === Main Whiteboard App ===
export class WhiteboardApp {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.camera = new Camera();
        this.elements = [];
        this.selectedIds = new Set();
        this.boardId = options.boardId;
        this.shareToken = options.shareToken;

        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 100;

        // Current drawing state
        this.currentColor = '#333333';
        this.currentFill = 'transparent';
        this.currentStrokeWidth = 2;
        this.stickyColor = '#FFF176';

        // Remote cursors
        this.remoteCursors = new Map();

        // Setup
        this.resize();
        this.setupEventListeners();

        // Tool manager
        this.toolManager = new ToolManager(this);

        // UI manager
        this.uiManager = new UIManager(this);

        // Sync manager
        this.syncManager = new SyncManager(this, {
            boardId: this.boardId,
            shareToken: this.shareToken,
            token: getToken(),
        });

        // Save initial state
        this.saveHistory();

        // Start render loop
        this.render();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resize());

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
                e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                this.undo();
                e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
                this.redo();
                e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                this.selectAll();
                e.preventDefault();
            }

            // Tool shortcuts
            const shortcuts = {
                'v': 'select', 'h': 'pan', 's': 'sticky', 'r': 'rect',
                'c': 'circle', 'l': 'line', 'a': 'arrow', 'd': 'draw', 't': 'text',
            };
            if (shortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
                this.toolManager.setTool(shortcuts[e.key]);
            }
        });
    }

    // === Element Management ===
    addElement(el) {
        this.elements.push(el);
        this.syncManager.addElement(el);
        this.saveHistory();
    }

    updateElement(id, props) {
        const el = this.elements.find(e => e.id === id);
        if (el) {
            Object.assign(el, props);
            this.syncManager.updateElement(el);
        }
    }

    removeElement(id) {
        this.elements = this.elements.filter(e => e.id !== id);
        this.syncManager.removeElement(id);
        this.selectedIds.delete(id);
        this.saveHistory();
    }

    getElementById(id) {
        return this.elements.find(e => e.id === id);
    }

    deleteSelected() {
        if (this.selectedIds.size === 0) return;
        for (const id of this.selectedIds) {
            this.elements = this.elements.filter(e => e.id !== id);
            this.syncManager.removeElement(id);
        }
        this.selectedIds.clear();
        this.saveHistory();
    }

    selectAll() {
        this.selectedIds = new Set(this.elements.map(e => e.id));
    }

    // === Hit Test All Elements (top to bottom) ===
    hitTestElements(wx, wy) {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            if (hitTest(wx, wy, this.elements[i], this.camera.zoom)) {
                return this.elements[i];
            }
        }
        return null;
    }

    // === History (Undo/Redo) ===
    saveHistory() {
        const state = JSON.parse(JSON.stringify(this.elements));
        // Truncate future history if we undid some actions
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        this.elements = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this.selectedIds.clear();
        this.syncManager.syncFullState(this.elements);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.historyIndex++;
        this.elements = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
        this.selectedIds.clear();
        this.syncManager.syncFullState(this.elements);
    }

    // === Render ===
    render() {
        const ctx = this.ctx;
        const cam = this.camera;
        const w = this.canvas.width / (window.devicePixelRatio || 1);
        const h = this.canvas.height / (window.devicePixelRatio || 1);

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, w, h);

        // Draw grid dots
        this.drawGrid(ctx, w, h);

        // Draw elements (with frustum culling)
        for (const el of this.elements) {
            if (!this.isVisible(el, w, h)) continue;
            this.drawElement(ctx, el);
        }

        // Draw selection indicators
        for (const id of this.selectedIds) {
            const el = this.getElementById(id);
            if (el) this.drawSelection(ctx, el);
        }

        // Draw tool preview (e.g., shape being drawn)
        if (this.toolManager) {
            this.toolManager.drawPreview(ctx);
        }

        // Draw remote cursors
        this.drawRemoteCursors(ctx);

        requestAnimationFrame(() => this.render());
    }

    drawGrid(ctx, w, h) {
        const cam = this.camera;
        const gridSize = 30;
        const dotSize = 1;

        // Calculate visible world bounds
        const topLeft = cam.screenToWorld(0, 0);
        const bottomRight = cam.screenToWorld(w, h);

        const startX = Math.floor(topLeft.x / gridSize) * gridSize;
        const startY = Math.floor(topLeft.y / gridSize) * gridSize;

        ctx.fillStyle = '#ddd';

        // Skip grid if too zoomed out
        if (cam.zoom < 0.3) return;

        for (let wx = startX; wx <= bottomRight.x; wx += gridSize) {
            for (let wy = startY; wy <= bottomRight.y; wy += gridSize) {
                const s = cam.worldToScreen(wx, wy);
                ctx.beginPath();
                ctx.arc(s.x, s.y, dotSize, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    isVisible(el, screenW, screenH) {
        const cam = this.camera;
        const margin = 50;

        if (el.type === 'drawing') {
            if (!el.points || el.points.length === 0) return false;
            // Check bounding box of drawing
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of el.points) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
            const s1 = cam.worldToScreen(minX, minY);
            const s2 = cam.worldToScreen(maxX, maxY);
            return s2.x >= -margin && s1.x <= screenW + margin &&
                   s2.y >= -margin && s1.y <= screenH + margin;
        }

        if (el.type === 'line' || el.type === 'arrow') {
            const s1 = cam.worldToScreen(el.x, el.y);
            const s2 = cam.worldToScreen(el.x2, el.y2);
            const minSx = Math.min(s1.x, s2.x);
            const maxSx = Math.max(s1.x, s2.x);
            const minSy = Math.min(s1.y, s2.y);
            const maxSy = Math.max(s1.y, s2.y);
            return maxSx >= -margin && minSx <= screenW + margin &&
                   maxSy >= -margin && minSy <= screenH + margin;
        }

        const s = cam.worldToScreen(el.x, el.y);
        const sw = (el.width || 100) * cam.zoom;
        const sh = (el.height || 30) * cam.zoom;
        return s.x + sw >= -margin && s.x <= screenW + margin &&
               s.y + sh >= -margin && s.y <= screenH + margin;
    }

    drawElement(ctx, el) {
        const cam = this.camera;

        switch (el.type) {
            case 'sticky':
                this.drawSticky(ctx, el);
                break;
            case 'rect':
                this.drawRect(ctx, el);
                break;
            case 'circle':
                this.drawCircleEl(ctx, el);
                break;
            case 'line':
                this.drawLine(ctx, el);
                break;
            case 'arrow':
                this.drawArrow(ctx, el);
                break;
            case 'drawing':
                this.drawDrawing(ctx, el);
                break;
            case 'text':
                this.drawText(ctx, el);
                break;
        }
    }

    drawSticky(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        const sw = el.width * cam.zoom;
        const sh = el.height * cam.zoom;

        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 8 * cam.zoom;
        ctx.shadowOffsetY = 2 * cam.zoom;

        // Background
        ctx.fillStyle = el.color || '#FFF176';
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
        ctx.fill();
        ctx.restore();

        // Text content
        if (el.content) {
            ctx.fillStyle = '#333';
            ctx.font = `${(el.fontSize || 14) * cam.zoom}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textBaseline = 'top';

            const padding = 12 * cam.zoom;
            const maxWidth = sw - padding * 2;
            const lines = this.wrapText(ctx, el.content, maxWidth);
            const lineHeight = (el.fontSize || 14) * 1.3 * cam.zoom;

            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], s.x + padding, s.y + padding + i * lineHeight, maxWidth);
            }
        }
    }

    drawRect(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        const sw = el.width * cam.zoom;
        const sh = el.height * cam.zoom;

        if (el.fill && el.fill !== 'transparent') {
            ctx.fillStyle = el.fill;
            ctx.fillRect(s.x, s.y, sw, sh);
        }

        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.strokeRect(s.x, s.y, sw, sh);
    }

    drawCircleEl(ctx, el) {
        const cam = this.camera;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const s = cam.worldToScreen(cx, cy);
        const rx = (el.width / 2) * cam.zoom;
        const ry = (el.height / 2) * cam.zoom;

        ctx.beginPath();
        ctx.ellipse(s.x, s.y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);

        if (el.fill && el.fill !== 'transparent') {
            ctx.fillStyle = el.fill;
            ctx.fill();
        }

        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.stroke();
    }

    drawLine(ctx, el) {
        const cam = this.camera;
        const s1 = cam.worldToScreen(el.x, el.y);
        const s2 = cam.worldToScreen(el.x2, el.y2);

        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
    }

    drawArrow(ctx, el) {
        const cam = this.camera;
        const s1 = cam.worldToScreen(el.x, el.y);
        const s2 = cam.worldToScreen(el.x2, el.y2);

        ctx.strokeStyle = el.color || '#333';
        ctx.fillStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.lineCap = 'round';

        // Line
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
        const headLen = 12 * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(s2.x, s2.y);
        ctx.lineTo(s2.x - headLen * Math.cos(angle - Math.PI / 6), s2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(s2.x - headLen * Math.cos(angle + Math.PI / 6), s2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    drawDrawing(ctx, el) {
        if (!el.points || el.points.length < 2) return;
        const cam = this.camera;

        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const s0 = cam.worldToScreen(el.points[0].x, el.points[0].y);
        ctx.moveTo(s0.x, s0.y);

        for (let i = 1; i < el.points.length; i++) {
            const s = cam.worldToScreen(el.points[i].x, el.points[i].y);
            ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
    }

    drawText(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);

        ctx.fillStyle = el.color || '#333';
        ctx.font = `${(el.fontSize || 16) * cam.zoom}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textBaseline = 'top';

        const lines = (el.content || '').split('\n');
        const lineHeight = (el.fontSize || 16) * 1.3 * cam.zoom;

        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        // Update element dimensions for hit testing
        el.width = maxW / cam.zoom;
        el.height = (lines.length * lineHeight) / cam.zoom;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], s.x, s.y + i * lineHeight);
        }
    }

    drawSelection(ctx, el) {
        const cam = this.camera;
        const pad = 4;

        if (el.type === 'drawing') {
            if (!el.points || el.points.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of el.points) {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
            const s1 = cam.worldToScreen(minX - pad, minY - pad);
            const s2 = cam.worldToScreen(maxX + pad, maxY + pad);
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(s1.x, s1.y, s2.x - s1.x, s2.y - s1.y);
            ctx.setLineDash([]);
            return;
        }

        if (el.type === 'line' || el.type === 'arrow') {
            const s1 = cam.worldToScreen(el.x, el.y);
            const s2 = cam.worldToScreen(el.x2, el.y2);
            // Draw handles at endpoints
            ctx.fillStyle = '#2196F3';
            for (const s of [s1, s2]) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }

        const s = cam.worldToScreen(el.x - pad, el.y - pad);
        const sw = (el.width + pad * 2) * cam.zoom;
        const sh = (el.height + pad * 2) * cam.zoom;

        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(s.x, s.y, sw, sh);
        ctx.setLineDash([]);

        // Resize handles
        const handles = getResizeHandles(el);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 2;
        const handleSize = 4;
        for (const [, hx, hy] of handles) {
            const hs = cam.worldToScreen(hx, hy);
            ctx.fillRect(hs.x - handleSize, hs.y - handleSize, handleSize * 2, handleSize * 2);
            ctx.strokeRect(hs.x - handleSize, hs.y - handleSize, handleSize * 2, handleSize * 2);
        }
    }

    drawRemoteCursors(ctx) {
        for (const [userId, cursor] of this.remoteCursors) {
            const s = this.camera.worldToScreen(cursor.x, cursor.y);
            ctx.fillStyle = cursor.color || '#F44336';

            // Cursor arrow
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + 3, s.y + 14);
            ctx.lineTo(s.x + 8, s.y + 10);
            ctx.closePath();
            ctx.fill();

            // Name label
            if (cursor.username) {
                const fontSize = 11;
                ctx.font = `bold ${fontSize}px sans-serif`;
                const textW = ctx.measureText(cursor.username).width;
                const labelX = s.x + 12;
                const labelY = s.y + 14;

                ctx.fillStyle = cursor.color || '#F44336';
                ctx.beginPath();
                ctx.roundRect(labelX - 2, labelY - 2, textW + 8, fontSize + 6, 3);
                ctx.fill();

                ctx.fillStyle = 'white';
                ctx.fillText(cursor.username, labelX + 2, labelY + fontSize - 1);
            }
        }
    }

    wrapText(ctx, text, maxWidth) {
        const lines = [];
        const paragraphs = text.split('\n');

        for (const para of paragraphs) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const test = line ? line + ' ' + word : word;
                if (ctx.measureText(test).width > maxWidth && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            lines.push(line);
        }
        return lines;
    }

    // === Elements in rectangle (for multi-select) ===
    elementsInRect(x1, y1, x2, y2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        return this.elements.filter(el => {
            if (el.type === 'line' || el.type === 'arrow') {
                return (el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY) ||
                       (el.x2 >= minX && el.x2 <= maxX && el.y2 >= minY && el.y2 <= maxY);
            }
            if (el.type === 'drawing') {
                return el.points && el.points.some(p =>
                    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
                );
            }
            // Bounding box overlap
            const ex = el.x;
            const ey = el.y;
            const ew = el.width || 100;
            const eh = el.height || 30;
            return ex < maxX && ex + ew > minX && ey < maxY && ey + eh > minY;
        });
    }
}

// Canvas rendering engine - the core of the whiteboard
// Implements: camera, world coordinates, render loop, hit testing, element management

import { ToolManager } from '/js/tools.js?v=2';
import { UIManager } from '/js/ui.js?v=2';
import { SyncManager } from '/js/sync.js?v=2';
import { getToken } from '/js/auth.js?v=2';
import { WhiteboardPlugins } from '/js/plugins.js?v=2';
import { errorHandler } from '/js/error-handler.js?v=2';

const imageCache = new Map();
function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const img = new Image();
    img.src = src;
    imageCache.set(src, img);
    return img;
}

let idCounter = 0;
export function generateId() {
    return `el_${Date.now()}_${idCounter++}_${Math.random().toString(36).substring(2, 8)}`;
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

// === Element Factory Functions ===

export function createStickyNote(x, y, color = '#FFF176') {
    return {
        id: generateId(), type: 'sticky',
        x, y, width: 200, height: 200,
        color, content: '', fontSize: 14, rotation: 0,
    };
}

function createShape(type, x, y, w, h, color = '#333333', fill = 'transparent', extra = {}) {
    return {
        id: generateId(), type,
        x, y, width: w, height: h,
        color, fill, strokeWidth: 2, rotation: 0,
        ...extra,
    };
}

export function createRect(x, y, w, h, color = '#333333', fill = 'transparent') {
    return createShape('rect', x, y, w, h, color, fill);
}

export function createCircle(x, y, rx, ry, color = '#333333', fill = 'transparent') {
    return createShape('circle', x, y, rx * 2, ry * 2, color, fill);
}

export function createTriangle(x, y, w, h, color = '#333333', fill = 'transparent') {
    return createShape('triangle', x, y, w, h, color, fill);
}

export function createDiamond(x, y, w, h, color = '#333333', fill = 'transparent') {
    return createShape('diamond', x, y, w, h, color, fill);
}

export function createStar(x, y, w, h, color = '#333333', fill = 'transparent') {
    return createShape('star', x, y, w, h, color, fill, { points: 5 });
}

export function createHexagon(x, y, w, h, color = '#333333', fill = 'transparent') {
    return createShape('hexagon', x, y, w, h, color, fill);
}

export function createLine(x1, y1, x2, y2, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(), type: 'line',
        x: x1, y: y1, x2, y2,
        color, strokeWidth,
    };
}

export function createArrow(x1, y1, x2, y2, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(), type: 'arrow',
        x: x1, y: y1, x2, y2,
        color, strokeWidth,
    };
}

export function createDrawing(points, color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(), type: 'drawing',
        points, color, strokeWidth, x: 0, y: 0,
    };
}

export function createText(x, y, content, color = '#333333', fontSize = 16) {
    return {
        id: generateId(), type: 'text',
        x, y, content, color, fontSize,
        width: 0, height: 0,
    };
}

export function createTextBox(x, y, w, h, color = '#333333', fill = '#FFFFFF') {
    return {
        id: generateId(), type: 'textbox',
        x, y, width: w, height: h,
        color, fill, content: '',
        fontSize: 14, strokeWidth: 1, rotation: 0,
        borderColor: '#cccccc',
    };
}

export function createImage(x, y, width, height, src) {
    return { id: generateId(), type: 'image', x, y, width, height, src, rotation: 0 };
}

// === Connector ===

export function createConnector(sourceId, targetId, sourceAnchor = 'auto', targetAnchor = 'auto', color = '#333333', strokeWidth = 2) {
    return {
        id: generateId(), type: 'connector',
        sourceId, targetId,
        sourceAnchor, targetAnchor,
        sourceMarker: 'none',
        targetMarker: 'arrow',
        lineStyle: 'solid',
        label: '',
        color, strokeWidth,
        x: 0, y: 0, x2: 0, y2: 0,
    };
}

// === Anchor Points ===

export function getAnchorPoints(el) {
    if (!el || el.type === 'line' || el.type === 'arrow' || el.type === 'drawing' || el.type === 'connector') return [];
    const w = el.width || 0;
    const h = el.height || 0;
    return [
        { name: 'top', x: el.x + w / 2, y: el.y },
        { name: 'right', x: el.x + w, y: el.y + h / 2 },
        { name: 'bottom', x: el.x + w / 2, y: el.y + h },
        { name: 'left', x: el.x, y: el.y + h / 2 },
    ];
}

export function getAnchorPoint(el, anchorName, otherX, otherY) {
    const anchors = getAnchorPoints(el);
    if (anchors.length === 0) return { x: el.x, y: el.y };
    if (anchorName !== 'auto') {
        return anchors.find(a => a.name === anchorName) || anchors[0];
    }
    let best = anchors[0], bestDist = Infinity;
    for (const a of anchors) {
        const d = Math.hypot(a.x - otherX, a.y - otherY);
        if (d < bestDist) { bestDist = d; best = a; }
    }
    return best;
}

export function resolveConnectorEndpoints(connector, elements) {
    const source = elements.find(e => e.id === connector.sourceId);
    const target = elements.find(e => e.id === connector.targetId);
    if (!source || !target) {
        return { sx: connector.x, sy: connector.y, ex: connector.x2, ey: connector.y2 };
    }
    const sCx = source.x + (source.width || 0) / 2;
    const sCy = source.y + (source.height || 0) / 2;
    const tCx = target.x + (target.width || 0) / 2;
    const tCy = target.y + (target.height || 0) / 2;
    const sp = getAnchorPoint(source, connector.sourceAnchor, tCx, tCy);
    const tp = getAnchorPoint(target, connector.targetAnchor, sCx, sCy);
    return { sx: sp.x, sy: sp.y, ex: tp.x, ey: tp.y };
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
    if (rx === 0 || ry === 0) return false;
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
        if (pointNearLine(px, py, p0.x, p0.y, p1.x, p1.y, threshold)) return true;
    }
    return false;
}

function pointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i][0], yi = vertices[i][1];
        const xj = vertices[j][0], yj = vertices[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function getTriangleVertices(el) {
    return [
        [el.x + el.width / 2, el.y],
        [el.x + el.width, el.y + el.height],
        [el.x, el.y + el.height],
    ];
}

function getDiamondVertices(el) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return [
        [cx, el.y],
        [el.x + el.width, cy],
        [cx, el.y + el.height],
        [el.x, cy],
    ];
}

function getHexagonVertices(el) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const rx = el.width / 2;
    const ry = el.height / 2;
    const verts = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        verts.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return verts;
}

function getStarVertices(el) {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    const outerRx = el.width / 2;
    const outerRy = el.height / 2;
    const innerRx = outerRx * 0.4;
    const innerRy = outerRy * 0.4;
    const numPoints = el.points || 5;
    const verts = [];
    for (let i = 0; i < numPoints * 2; i++) {
        const angle = (Math.PI / numPoints) * i - Math.PI / 2;
        const isOuter = i % 2 === 0;
        const rx = isOuter ? outerRx : innerRx;
        const ry = isOuter ? outerRy : innerRy;
        verts.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return verts;
}

// === Register Built-in Element Types ===

function registerBuiltinTypes(app) {
    WhiteboardPlugins.registerElementType('sticky', {
        draw(ctx, el) { app.drawSticky(ctx, el); },
        hitTest(px, py, el) { return pointInRect(px, py, el); },
    });
    WhiteboardPlugins.registerElementType('rect', {
        draw(ctx, el) { app.drawRect(ctx, el); },
        hitTest(px, py, el) { return pointInRect(px, py, el); },
    });
    WhiteboardPlugins.registerElementType('textbox', {
        draw(ctx, el) { app.drawTextBox(ctx, el); },
        hitTest(px, py, el) { return pointInRect(px, py, el); },
    });
    WhiteboardPlugins.registerElementType('circle', {
        draw(ctx, el) { app.drawCircleEl(ctx, el); },
        hitTest(px, py, el) { return pointInCircle(px, py, el); },
    });
    WhiteboardPlugins.registerElementType('triangle', {
        draw(ctx, el) { app.drawTriangle(ctx, el); },
        hitTest(px, py, el) { return pointInPolygon(px, py, getTriangleVertices(el)); },
    });
    WhiteboardPlugins.registerElementType('diamond', {
        draw(ctx, el) { app.drawDiamond(ctx, el); },
        hitTest(px, py, el) { return pointInPolygon(px, py, getDiamondVertices(el)); },
    });
    WhiteboardPlugins.registerElementType('hexagon', {
        draw(ctx, el) { app.drawHexagon(ctx, el); },
        hitTest(px, py, el) { return pointInPolygon(px, py, getHexagonVertices(el)); },
    });
    WhiteboardPlugins.registerElementType('star', {
        draw(ctx, el) { app.drawStar(ctx, el); },
        hitTest(px, py, el) { return pointInPolygon(px, py, getStarVertices(el)); },
    });
    WhiteboardPlugins.registerElementType('line', {
        draw(ctx, el) { app.drawLine(ctx, el); },
        hitTest(px, py, el, zoom) { return pointNearLine(px, py, el.x, el.y, el.x2, el.y2, 8 / zoom); },
    });
    WhiteboardPlugins.registerElementType('arrow', {
        draw(ctx, el) { app.drawArrow(ctx, el); },
        hitTest(px, py, el, zoom) { return pointNearLine(px, py, el.x, el.y, el.x2, el.y2, 8 / zoom); },
    });
    WhiteboardPlugins.registerElementType('drawing', {
        draw(ctx, el) { app.drawDrawing(ctx, el); },
        hitTest(px, py, el, zoom) { return pointNearDrawing(px, py, el, 8 / zoom); },
    });
    WhiteboardPlugins.registerElementType('text', {
        draw(ctx, el) { app.drawText(ctx, el); },
        hitTest(px, py, el) {
            return pointInRect(px, py, {
                x: el.x, y: el.y,
                width: el.width || el.content.length * el.fontSize * 0.6,
                height: el.height || el.fontSize * 1.4,
            });
        },
    });
    WhiteboardPlugins.registerElementType('connector', {
        draw(ctx, el) { app.drawConnector(ctx, el); },
        hitTest(px, py, el, zoom) { return pointNearLine(px, py, el.x, el.y, el.x2, el.y2, 8 / zoom); },
    });
    WhiteboardPlugins.registerElementType('image', {
        draw(ctx, el) {
            const img = loadImage(el.src);
            const cam = app.camera;
            const s = cam.worldToScreen(el.x, el.y);
            const sw = el.width * cam.zoom;
            const sh = el.height * cam.zoom;
            if (!img.complete || !img.naturalWidth) {
                // Draw placeholder while loading
                ctx.strokeStyle = '#ccc';
                ctx.strokeRect(s.x, s.y, sw, sh);
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(s.x, s.y, sw, sh);
                ctx.fillStyle = '#999';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Loading...', s.x + sw / 2, s.y + sh / 2);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
                img.onload = () => app.render();
                return;
            }
            ctx.drawImage(img, s.x, s.y, sw, sh);
        },
        hitTest(px, py, el) { return pointInRect(px, py, el); },
    });
}

export function hitTest(px, py, el, zoom = 1) {
    const threshold = 8 / zoom;
    const typeDef = WhiteboardPlugins.getElementType(el.type);
    if (typeDef && typeDef.hitTest) {
        return typeDef.hitTest(px, py, el, zoom);
    }
    return false;
}

// === Resize Handle Hit Test ===

export function hitTestResizeHandle(px, py, el, zoom = 1) {
    if (el.type === 'line' || el.type === 'arrow' || el.type === 'drawing' || el.type === 'connector') return null;
    const handleSize = 8 / zoom;
    const handles = getResizeHandles(el);
    for (const [name, hx, hy] of handles) {
        if (Math.abs(px - hx) <= handleSize && Math.abs(py - hy) <= handleSize) return name;
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

        // Auto-save timer (30 seconds)
        this.autoSaveInterval = null;
        this.lastSavedState = null;

        // Setup
        this.resize();
        this.setupEventListeners();

        // Register built-in element types with plugin registry
        registerBuiltinTypes(this);

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

        // Start auto-save timer
        this.startAutoSave();

        // Start render loop
        this.render();
    }

    startAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            this.syncManager.requestSave();
        }, 30000);
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

        window.addEventListener('keydown', (e) => {
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
                'c': 'circle', 'l': 'line', 'a': 'arrow', 'k': 'connector', 'd': 'draw', 't': 'text',
            };
            if (shortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
                this.toolManager.setTool(shortcuts[e.key]);
            }
        });

        // Image drag-and-drop
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
            if (!files.length) return;
            const world = this.camera.screenToWorld(e.offsetX, e.offsetY);
            for (const file of files) {
                this.uploadImage(file, world.x, world.y);
            }
        });

        // Image paste
        document.addEventListener('paste', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const items = [...(e.clipboardData?.items || [])];
            const imageItem = items.find(i => i.type.startsWith('image/'));
            if (!imageItem) return;
            e.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return;
            const world = this.camera.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
            this.uploadImage(file, world.x, world.y);
        });
    }

    // === Element Management ===
    addElement(el) {
        this.elements.push(el);
        WhiteboardPlugins.fireHook('onElementCreate', el);
        this.syncManager.addElement(el);
        this.saveHistory();
    }

    async uploadImage(file, worldX, worldY) {
        const formData = new FormData();
        formData.append('file', file);
        const { apiFetch } = await import('/js/auth.js?v=2');
        const res = await apiFetch(`/api/boards/${this.boardId}/images`, {
            method: 'POST',
            body: formData,
        });
        if (!res.ok) { console.error('Image upload failed'); return; }
        const data = await res.json();
        const img = new Image();
        img.src = data.url;
        img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const maxSize = 400;
            if (w > maxSize || h > maxSize) {
                const scale = maxSize / Math.max(w, h);
                w *= scale;
                h *= scale;
            }
            const el = createImage(worldX - w / 2, worldY - h / 2, w, h, data.url);
            this.addElement(el);
        };
    }

    updateElement(id, props) {
        const el = this.elements.find(e => e.id === id);
        if (el) {
            Object.assign(el, props);
            WhiteboardPlugins.fireHook('onElementUpdate', id, props);
            this.syncManager.updateElement(el);
        }
    }

    removeElement(id) {
        WhiteboardPlugins.fireHook('onElementDelete', id);
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
        const deletedIds = new Set(this.selectedIds);

        // Also remove connectors that reference deleted elements
        for (const el of this.elements) {
            if (el.type === 'connector' && (deletedIds.has(el.sourceId) || deletedIds.has(el.targetId))) {
                deletedIds.add(el.id);
            }
        }

        for (const id of deletedIds) {
            this.syncManager.removeElement(id);
        }
        this.elements = this.elements.filter(e => !deletedIds.has(e.id));
        this.selectedIds.clear();
        this.saveHistory();
    }

    selectAll() {
        this.selectedIds = new Set(this.elements.map(e => e.id));
    }

    hitTestElements(wx, wy) {
        for (let i = this.elements.length - 1; i >= 0; i--) {
            if (hitTest(wx, wy, this.elements[i], this.camera.zoom)) return this.elements[i];
        }
        return null;
    }

    // === History (Undo/Redo) ===
    saveHistory() {
        const state = JSON.parse(JSON.stringify(this.elements));
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        if (this.history.length > this.maxHistory) this.history.shift();
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
        try {
            const ctx = this.ctx;
            const w = this.canvas.width / (window.devicePixelRatio || 1);
            const h = this.canvas.height / (window.devicePixelRatio || 1);

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, w, h);

            this.drawGrid(ctx, w, h);

            for (const el of this.elements) {
                if (!this.isVisible(el, w, h)) continue;
                this.drawElement(ctx, el);
            }

            for (const id of this.selectedIds) {
                const el = this.getElementById(id);
                if (el) this.drawSelection(ctx, el);
            }

            if (this.toolManager) this.toolManager.drawPreview(ctx);

            this.drawRemoteCursors(ctx);
        } catch (error) {
            // Report render errors but throttle to avoid flooding at 60fps
            if (!this._lastRenderError || this._lastRenderError !== error.message) {
                this._lastRenderError = error.message;
                errorHandler.report({
                    error_type: 'render',
                    severity: 'error',
                    message: error.message,
                    stack_trace: error.stack,
                    context: { elementCount: this.elements.length },
                });
            }
        }

        requestAnimationFrame(() => this.render());
    }

    drawGrid(ctx, w, h) {
        const cam = this.camera;
        const gridSize = 30;
        if (cam.zoom < 0.3) return;

        const topLeft = cam.screenToWorld(0, 0);
        const bottomRight = cam.screenToWorld(w, h);
        const startX = Math.floor(topLeft.x / gridSize) * gridSize;
        const startY = Math.floor(topLeft.y / gridSize) * gridSize;

        ctx.fillStyle = '#ddd';
        for (let wx = startX; wx <= bottomRight.x; wx += gridSize) {
            for (let wy = startY; wy <= bottomRight.y; wy += gridSize) {
                const s = cam.worldToScreen(wx, wy);
                ctx.beginPath();
                ctx.arc(s.x, s.y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    isVisible(el, screenW, screenH) {
        const cam = this.camera;
        const margin = 50;

        if (el.type === 'drawing') {
            if (!el.points || el.points.length === 0) return false;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of el.points) {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            }
            const s1 = cam.worldToScreen(minX, minY);
            const s2 = cam.worldToScreen(maxX, maxY);
            return s2.x >= -margin && s1.x <= screenW + margin &&
                   s2.y >= -margin && s1.y <= screenH + margin;
        }

        if (el.type === 'line' || el.type === 'arrow' || el.type === 'connector') {
            const s1 = cam.worldToScreen(el.x, el.y);
            const s2 = cam.worldToScreen(el.x2, el.y2);
            return Math.max(s1.x, s2.x) >= -margin && Math.min(s1.x, s2.x) <= screenW + margin &&
                   Math.max(s1.y, s2.y) >= -margin && Math.min(s1.y, s2.y) <= screenH + margin;
        }

        const s = cam.worldToScreen(el.x, el.y);
        const sw = (el.width || 100) * cam.zoom;
        const sh = (el.height || 30) * cam.zoom;
        return s.x + sw >= -margin && s.x <= screenW + margin &&
               s.y + sh >= -margin && s.y <= screenH + margin;
    }

    drawElement(ctx, el) {
        const typeDef = WhiteboardPlugins.getElementType(el.type);
        if (typeDef && typeDef.draw) {
            typeDef.draw(ctx, el);
        }
    }

    // --- Sticky Note ---
    drawSticky(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        const sw = el.width * cam.zoom;
        const sh = el.height * cam.zoom;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 8 * cam.zoom;
        ctx.shadowOffsetY = 2 * cam.zoom;

        ctx.fillStyle = el.color || '#FFF176';
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
        ctx.fill();
        ctx.restore();

        // Fold corner
        const foldSize = 20 * cam.zoom;
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath();
        ctx.moveTo(s.x + sw - foldSize, s.y);
        ctx.lineTo(s.x + sw, s.y);
        ctx.lineTo(s.x + sw, s.y + foldSize);
        ctx.closePath();
        ctx.fill();

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

    // --- Rectangle ---
    drawRect(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        const sw = el.width * cam.zoom;
        const sh = el.height * cam.zoom;

        if (el.fill && el.fill !== 'transparent') {
            ctx.fillStyle = el.fill;
            ctx.beginPath();
            ctx.roundRect(s.x, s.y, sw, sh, 2 * cam.zoom);
            ctx.fill();
        }
        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, sw, sh, 2 * cam.zoom);
        ctx.stroke();
    }

    // --- Circle/Ellipse ---
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

    // --- Triangle ---
    drawTriangle(ctx, el) {
        const cam = this.camera;
        const verts = getTriangleVertices(el);
        this._drawPolygon(ctx, cam, verts, el);
    }

    // --- Diamond ---
    drawDiamond(ctx, el) {
        const cam = this.camera;
        const verts = getDiamondVertices(el);
        this._drawPolygon(ctx, cam, verts, el);
    }

    // --- Star ---
    drawStar(ctx, el) {
        const cam = this.camera;
        const verts = getStarVertices(el);
        this._drawPolygon(ctx, cam, verts, el);
    }

    // --- Hexagon ---
    drawHexagon(ctx, el) {
        const cam = this.camera;
        const verts = getHexagonVertices(el);
        this._drawPolygon(ctx, cam, verts, el);
    }

    // Helper to draw any polygon
    _drawPolygon(ctx, cam, worldVerts, el) {
        const screenVerts = worldVerts.map(([wx, wy]) => cam.worldToScreen(wx, wy));

        ctx.beginPath();
        ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
        for (let i = 1; i < screenVerts.length; i++) {
            ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
        }
        ctx.closePath();

        if (el.fill && el.fill !== 'transparent') {
            ctx.fillStyle = el.fill;
            ctx.fill();
        }
        ctx.strokeStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.stroke();
    }

    // --- Line ---
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

    // --- Arrow ---
    drawArrow(ctx, el) {
        const cam = this.camera;
        const s1 = cam.worldToScreen(el.x, el.y);
        const s2 = cam.worldToScreen(el.x2, el.y2);

        ctx.strokeStyle = el.color || '#333';
        ctx.fillStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();

        const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
        const headLen = 12 * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(s2.x, s2.y);
        ctx.lineTo(s2.x - headLen * Math.cos(angle - Math.PI / 6), s2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(s2.x - headLen * Math.cos(angle + Math.PI / 6), s2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    // --- Connector ---
    drawConnector(ctx, el) {
        const pts = resolveConnectorEndpoints(el, this.elements);
        el.x = pts.sx; el.y = pts.sy; el.x2 = pts.ex; el.y2 = pts.ey;

        const cam = this.camera;
        const s1 = cam.worldToScreen(pts.sx, pts.sy);
        const s2 = cam.worldToScreen(pts.ex, pts.ey);

        ctx.strokeStyle = el.color || '#333';
        ctx.fillStyle = el.color || '#333';
        ctx.lineWidth = (el.strokeWidth || 2) * cam.zoom;
        ctx.lineCap = 'round';

        // Line style
        if (el.lineStyle === 'dashed') ctx.setLineDash([8 * cam.zoom, 4 * cam.zoom]);
        else if (el.lineStyle === 'dotted') ctx.setLineDash([2 * cam.zoom, 4 * cam.zoom]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Markers
        const headSize = 12 * cam.zoom;
        if (el.sourceMarker && el.sourceMarker !== 'none') {
            const angle = Math.atan2(s1.y - s2.y, s1.x - s2.x);
            this.drawEndpointMarker(ctx, s1.x, s1.y, angle, el.sourceMarker, headSize, el.color || '#333', el.strokeWidth * cam.zoom);
        }
        if (el.targetMarker && el.targetMarker !== 'none') {
            const angle = Math.atan2(s2.y - s1.y, s2.x - s1.x);
            this.drawEndpointMarker(ctx, s2.x, s2.y, angle, el.targetMarker, headSize, el.color || '#333', el.strokeWidth * cam.zoom);
        }

        // Label
        if (el.label) {
            const mx = (s1.x + s2.x) / 2;
            const my = (s1.y + s2.y) / 2;
            const fontSize = 12 * cam.zoom;
            ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
            const textW = ctx.measureText(el.label).width;
            const pad = 4 * cam.zoom;

            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.roundRect(mx - textW / 2 - pad, my - fontSize / 2 - pad, textW + pad * 2, fontSize + pad * 2, 3 * cam.zoom);
            ctx.fill();

            ctx.fillStyle = el.color || '#333';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(el.label, mx, my);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        }
    }

    drawEndpointMarker(ctx, x, y, angle, type, size, color, lineWidth) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (type) {
            case 'arrow':
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-size, -size * 0.4);
                ctx.lineTo(-size, size * 0.4);
                ctx.closePath();
                ctx.fill();
                break;
            case 'open-arrow':
                ctx.beginPath();
                ctx.moveTo(-size, -size * 0.4);
                ctx.lineTo(0, 0);
                ctx.lineTo(-size, size * 0.4);
                ctx.stroke();
                break;
            case 'one':
                ctx.beginPath();
                ctx.moveTo(-size * 0.15, -size * 0.45);
                ctx.lineTo(-size * 0.15, size * 0.45);
                ctx.stroke();
                break;
            case 'many': {
                // Crow's foot: three prongs
                const forkX = -size * 0.7;
                ctx.beginPath();
                ctx.moveTo(forkX, 0); ctx.lineTo(0, 0);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, -size * 0.45);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, size * 0.45);
                ctx.stroke();
                break;
            }
            case 'one-many': {
                // | + crow's foot
                ctx.beginPath();
                ctx.moveTo(-size, -size * 0.45);
                ctx.lineTo(-size, size * 0.45);
                ctx.stroke();
                const forkX = -size * 0.6;
                ctx.beginPath();
                ctx.moveTo(forkX, 0); ctx.lineTo(0, 0);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, -size * 0.45);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, size * 0.45);
                ctx.stroke();
                break;
            }
            case 'zero-many': {
                // ○ + crow's foot
                const r = size * 0.18;
                ctx.beginPath();
                ctx.arc(-size * 0.88, 0, r, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = color;
                const forkX = -size * 0.55;
                ctx.beginPath();
                ctx.moveTo(forkX, 0); ctx.lineTo(0, 0);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, -size * 0.45);
                ctx.moveTo(forkX, 0); ctx.lineTo(0, size * 0.45);
                ctx.stroke();
                break;
            }
            case 'zero-one': {
                // ○ + |
                const r = size * 0.18;
                ctx.beginPath();
                ctx.arc(-size * 0.7, 0, r, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(-size * 0.3, -size * 0.45);
                ctx.lineTo(-size * 0.3, size * 0.45);
                ctx.stroke();
                break;
            }
        }
        ctx.restore();
    }

    // --- Freehand Drawing ---
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

    // --- Text ---
    drawText(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        ctx.fillStyle = el.color || '#333';
        ctx.font = `${(el.fontSize || 16) * cam.zoom}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textBaseline = 'top';

        const lines = (el.content || '').split('\n');
        const lineHeight = (el.fontSize || 16) * 1.3 * cam.zoom;
        let maxW = 0;
        for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
        el.width = maxW / cam.zoom;
        el.height = (lines.length * lineHeight) / cam.zoom;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], s.x, s.y + i * lineHeight);
        }
    }

    // --- Text Box (bordered text area) ---
    drawTextBox(ctx, el) {
        const cam = this.camera;
        const s = cam.worldToScreen(el.x, el.y);
        const sw = el.width * cam.zoom;
        const sh = el.height * cam.zoom;

        // Background
        ctx.fillStyle = el.fill || '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
        ctx.fill();

        // Border
        ctx.strokeStyle = el.borderColor || '#cccccc';
        ctx.lineWidth = (el.strokeWidth || 1) * cam.zoom;
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, sw, sh, 4 * cam.zoom);
        ctx.stroke();

        // Text content
        if (el.content) {
            ctx.fillStyle = el.color || '#333';
            ctx.font = `${(el.fontSize || 14) * cam.zoom}px -apple-system, BlinkMacSystemFont, sans-serif`;
            ctx.textBaseline = 'top';
            const padding = 10 * cam.zoom;
            const maxWidth = sw - padding * 2;
            const lines = this.wrapText(ctx, el.content, maxWidth);
            const lineHeight = (el.fontSize || 14) * 1.3 * cam.zoom;
            for (let i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], s.x + padding, s.y + padding + i * lineHeight, maxWidth);
            }
        }
    }

    // --- Selection ---
    drawSelection(ctx, el) {
        const cam = this.camera;
        const pad = 4;

        if (el.type === 'drawing') {
            if (!el.points || el.points.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of el.points) {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
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

        if (el.type === 'line' || el.type === 'arrow' || el.type === 'connector') {
            const s1 = cam.worldToScreen(el.x, el.y);
            const s2 = cam.worldToScreen(el.x2, el.y2);
            // Dashed line for connector selection
            if (el.type === 'connector') {
                ctx.strokeStyle = '#2196F3';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
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

    // --- Remote Cursors ---
    drawRemoteCursors(ctx) {
        for (const [, cursor] of this.remoteCursors) {
            const s = this.camera.worldToScreen(cursor.x, cursor.y);
            ctx.fillStyle = cursor.color || '#F44336';

            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + 3, s.y + 14);
            ctx.lineTo(s.x + 8, s.y + 10);
            ctx.closePath();
            ctx.fill();

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
        for (const para of text.split('\n')) {
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

    elementsInRect(x1, y1, x2, y2) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

        return this.elements.filter(el => {
            if (el.type === 'line' || el.type === 'arrow' || el.type === 'connector') {
                return (el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY) ||
                       (el.x2 >= minX && el.x2 <= maxX && el.y2 >= minY && el.y2 <= maxY);
            }
            if (el.type === 'drawing') {
                return el.points && el.points.some(p =>
                    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
                );
            }
            const ex = el.x, ey = el.y;
            const ew = el.width || 100, eh = el.height || 30;
            return ex < maxX && ex + ew > minX && ey < maxY && ey + eh > minY;
        });
    }
}

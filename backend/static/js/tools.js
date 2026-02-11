// Tool Manager - handles all whiteboard tools and their interactions
import {
    createStickyNote, createRect, createCircle, createTriangle,
    createDiamond, createStar, createHexagon,
    createLine, createArrow, createDrawing, createText, createTextBox,
    createConnector, getAnchorPoints, resolveConnectorEndpoints,
    hitTest, hitTestResizeHandle,
} from '/js/canvas.js?v=2';
import { WhiteboardPlugins } from '/js/plugins.js?v=2';

// All shape-type tools that use drag-to-create
const SHAPE_TOOLS = new Set(['rect', 'circle', 'triangle', 'diamond', 'star', 'hexagon']);
const LINE_TOOLS = new Set(['line', 'arrow']);

// Marker types for ER diagrams and general use
const MARKER_TYPES = ['none', 'arrow', 'open-arrow', 'one', 'many', 'one-many', 'zero-many', 'zero-one'];

export class ToolManager {
    constructor(app) {
        this.app = app;
        this.currentTool = 'select';
        this.isDrawing = false;
        this.dragStart = null;
        this.dragElement = null;
        this.resizeHandle = null;
        this.resizeStart = null;
        this.drawPoints = [];
        this.previewElement = null;
        this.isPanning = false;
        this.panStart = null;
        this.selectionRect = null;
        this.spaceDown = false;

        // Connector tool state
        this.connectorSource = null;      // { elementId, anchor }
        this.connectorHoveredEl = null;    // element being hovered during connector creation
        this.connectorHoveredAnchor = null; // anchor point being hovered

        this.setupCanvasEvents();
        this.setupToolbarEvents();
        this.setupConnectorConfig();
        this.registerPluginTools();
    }

    registerPluginTools() {
        const pluginTools = WhiteboardPlugins.tools;
        if (!pluginTools || pluginTools.length === 0) return;

        const toolbar = document.getElementById('toolbar');
        if (!toolbar) return;

        // Add separator before plugin tools
        const sep = document.createElement('div');
        sep.className = 'tool-separator';
        toolbar.appendChild(sep);

        for (const tool of pluginTools) {
            const btn = document.createElement('button');
            btn.className = 'tool-btn';
            btn.dataset.tool = tool.name;
            btn.title = tool.title || tool.name;
            if (tool.icon) btn.innerHTML = tool.icon;
            btn.addEventListener('click', () => this.setTool(tool.name));
            toolbar.appendChild(btn);
        }
    }

    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        const cursorMap = {
            select: 'default', pan: 'grab',
            sticky: 'crosshair', rect: 'crosshair', circle: 'crosshair',
            triangle: 'crosshair', diamond: 'crosshair', star: 'crosshair', hexagon: 'crosshair',
            line: 'crosshair', arrow: 'crosshair', connector: 'crosshair',
            draw: 'crosshair', text: 'text', textbox: 'crosshair',
        };
        // Check plugin tools for cursor
        if (!cursorMap[tool]) {
            const pluginTool = WhiteboardPlugins.tools.find(t => t.name === tool);
            if (pluginTool) cursorMap[tool] = pluginTool.cursor || 'crosshair';
        }
        this.app.canvas.style.cursor = cursorMap[tool] || 'default';

        if (tool !== 'color') document.getElementById('color-picker')?.classList.remove('visible');
        if (tool !== 'stroke-width') document.getElementById('stroke-picker')?.classList.remove('visible');
        if (tool !== 'fill-color') document.getElementById('fill-picker')?.classList.remove('visible');
        // Reset connector state when switching tools
        this.connectorSource = null;
        this.connectorHoveredEl = null;
        this.connectorHoveredAnchor = null;
    }

    setupToolbarEvents() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (!tool) return;
                if (tool === 'color') {
                    document.getElementById('color-picker')?.classList.toggle('visible');
                    document.getElementById('stroke-picker')?.classList.remove('visible');
                    document.getElementById('fill-picker')?.classList.remove('visible');
                    return;
                }
                if (tool === 'stroke-width') {
                    document.getElementById('stroke-picker')?.classList.toggle('visible');
                    document.getElementById('color-picker')?.classList.remove('visible');
                    document.getElementById('fill-picker')?.classList.remove('visible');
                    return;
                }
                if (tool === 'fill-color') {
                    document.getElementById('fill-picker')?.classList.toggle('visible');
                    document.getElementById('color-picker')?.classList.remove('visible');
                    document.getElementById('stroke-picker')?.classList.remove('visible');
                    return;
                }
                this.setTool(tool);
            });
        });

        // Stroke color swatches
        document.querySelectorAll('#color-picker .color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                this.app.currentColor = color;
                document.querySelectorAll('#color-picker .color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');

                const colorBtn = document.querySelector('[data-tool="color"] svg circle');
                if (colorBtn) {
                    colorBtn.setAttribute('fill', color);
                    colorBtn.setAttribute('stroke', color);
                }

                for (const id of this.app.selectedIds) {
                    const el = this.app.getElementById(id);
                    if (el) {
                        if (el.type === 'sticky') {
                            this.app.updateElement(id, { color });
                            this.app.stickyColor = color;
                        } else {
                            this.app.updateElement(id, { color });
                        }
                    }
                }
                document.getElementById('color-picker')?.classList.remove('visible');
            });
        });

        // Fill color swatches
        document.querySelectorAll('#fill-picker .color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const fill = swatch.dataset.color;
                this.app.currentFill = fill;
                document.querySelectorAll('#fill-picker .color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');

                for (const id of this.app.selectedIds) {
                    const el = this.app.getElementById(id);
                    if (el && el.fill !== undefined) {
                        this.app.updateElement(id, { fill });
                    }
                }
                document.getElementById('fill-picker')?.classList.remove('visible');
            });
        });

        // Stroke width
        const strokeRange = document.getElementById('stroke-range');
        const strokeValue = document.getElementById('stroke-value');
        if (strokeRange) {
            strokeRange.addEventListener('input', () => {
                const val = parseInt(strokeRange.value);
                strokeValue.textContent = val;
                this.app.currentStrokeWidth = val;
                for (const id of this.app.selectedIds) {
                    const el = this.app.getElementById(id);
                    if (el && el.strokeWidth !== undefined) {
                        this.app.updateElement(id, { strokeWidth: val });
                    }
                }
            });
        }

        // Undo/Redo buttons
        document.getElementById('btn-undo')?.addEventListener('click', () => this.app.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.app.redo());
    }

    setupCanvasEvents() {
        const canvas = this.app.canvas;

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spaceDown && e.target === document.body) {
                this.spaceDown = true;
                canvas.style.cursor = 'grab';
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.spaceDown = false;
                if (!this.isPanning) this.setTool(this.currentTool);
            }
        });

        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onMouseDown(e) {
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);

        // Middle mouse button or space+click = pan
        if (e.button === 1 || this.spaceDown || this.currentTool === 'pan') {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.app.canvas.style.cursor = 'grabbing';
            return;
        }
        if (e.button !== 0) return;

        const tool = this.currentTool;

        if (tool === 'select') {
            this.onSelectDown(world, e);
        } else if (tool === 'sticky') {
            this.onStickyDown(world);
        } else if (SHAPE_TOOLS.has(tool)) {
            this.onShapeDown(world);
        } else if (LINE_TOOLS.has(tool)) {
            this.onLineDown(world);
        } else if (tool === 'connector') {
            this.onConnectorDown(world);
        } else if (tool === 'draw') {
            this.onDrawDown(world);
        } else if (tool === 'text') {
            this.onTextDown(world);
        } else if (tool === 'textbox') {
            this.onTextBoxDown(world);
        } else {
            // Check plugin tools
            const pluginTool = WhiteboardPlugins.tools.find(t => t.name === tool);
            if (pluginTool && pluginTool.onDown) {
                pluginTool.onDown(world, this.app);
            }
        }
    }

    onMouseMove(e) {
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);
        this.app.syncManager.sendCursorPosition(world.x, world.y);

        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            cam.pan(dx, dy);
            this.panStart = { x: e.clientX, y: e.clientY };
            this.updateZoomDisplay();
            return;
        }

        const tool = this.currentTool;
        if (tool === 'select') {
            this.onSelectMove(world, e);
        } else if (SHAPE_TOOLS.has(tool)) {
            this.onShapeMove(world);
        } else if (LINE_TOOLS.has(tool)) {
            this.onLineMove(world);
        } else if (tool === 'connector') {
            this.onConnectorMove(world);
        } else if (tool === 'draw') {
            this.onDrawMove(world);
        } else if (tool === 'textbox') {
            this.onTextBoxMove(world);
        } else {
            // Check plugin tools
            const pluginTool = WhiteboardPlugins.tools.find(t => t.name === tool);
            if (pluginTool && pluginTool.onMove) {
                pluginTool.onMove(world, this.app);
            }
        }
    }

    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.app.canvas.style.cursor = this.spaceDown ? 'grab' : (this.currentTool === 'pan' ? 'grab' : 'default');
            return;
        }

        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);
        const tool = this.currentTool;

        if (tool === 'select') {
            this.onSelectUp(world);
        } else if (SHAPE_TOOLS.has(tool)) {
            this.onShapeUp(world);
        } else if (LINE_TOOLS.has(tool)) {
            this.onLineUp(world);
        } else if (tool === 'connector') {
            this.onConnectorUp(world);
        } else if (tool === 'draw') {
            this.onDrawUp();
        } else if (tool === 'textbox') {
            this.onTextBoxUp(world);
        } else {
            // Check plugin tools
            const pluginTool = WhiteboardPlugins.tools.find(t => t.name === tool);
            if (pluginTool && pluginTool.onUp) {
                pluginTool.onUp(world, this.app);
            }
        }
    }

    onDoubleClick(e) {
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);
        const el = this.app.hitTestElements(world.x, world.y);
        if (!el) return;
        if (el.type === 'sticky' || el.type === 'text' || el.type === 'textbox') {
            this.startTextEdit(el);
        } else if (el.type === 'connector') {
            this.startConnectorLabelEdit(el);
        }
    }

    onWheel(e) {
        e.preventDefault();
        this.app.camera.zoomAt(e.offsetX, e.offsetY, e.deltaY);
        this.updateZoomDisplay();
    }

    updateZoomDisplay() {
        const el = document.getElementById('zoom-level');
        if (el) el.textContent = Math.round(this.app.camera.zoom * 100) + '%';
    }

    // === Select Tool ===
    onSelectDown(world, e) {
        for (const id of this.app.selectedIds) {
            const el = this.app.getElementById(id);
            if (el) {
                const handle = hitTestResizeHandle(world.x, world.y, el, this.app.camera.zoom);
                if (handle) {
                    this.resizeHandle = handle;
                    this.resizeStart = { x: world.x, y: world.y };
                    this.dragElement = el;
                    return;
                }
            }
        }

        const hit = this.app.hitTestElements(world.x, world.y);
        if (hit) {
            if (e.shiftKey) {
                if (this.app.selectedIds.has(hit.id)) this.app.selectedIds.delete(hit.id);
                else this.app.selectedIds.add(hit.id);
            } else if (!this.app.selectedIds.has(hit.id)) {
                this.app.selectedIds = new Set([hit.id]);
            }
            this.isDrawing = true;
            this.dragStart = { x: world.x, y: world.y };
            this.app.canvas.style.cursor = 'move';
        } else {
            if (!e.shiftKey) this.app.selectedIds.clear();
            this.selectionRect = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
        }
    }

    onSelectMove(world) {
        if (this.resizeHandle && this.dragElement) {
            const el = this.dragElement;
            const dx = world.x - this.resizeStart.x;
            const dy = world.y - this.resizeStart.y;
            const updates = {};

            if (this.resizeHandle.includes('w')) { updates.x = el.x + dx; updates.width = el.width - dx; }
            if (this.resizeHandle.includes('e')) { updates.width = el.width + dx; }
            if (this.resizeHandle.includes('n')) { updates.y = el.y + dy; updates.height = el.height - dy; }
            if (this.resizeHandle.includes('s')) { updates.height = el.height + dy; }

            if (updates.width !== undefined && updates.width < 10) return;
            if (updates.height !== undefined && updates.height < 10) return;

            Object.assign(el, updates);
            this.resizeStart = { x: world.x, y: world.y };
            this.app.syncManager.updateElement(el);
            return;
        }

        if (this.isDrawing && this.dragStart) {
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;
            for (const id of this.app.selectedIds) {
                const el = this.app.getElementById(id);
                if (!el) continue;
                if (el.type === 'connector') continue; // connectors follow their source/target
                el.x += dx; el.y += dy;
                if (el.type === 'line' || el.type === 'arrow') { el.x2 += dx; el.y2 += dy; }
                if (el.type === 'drawing') { for (const p of el.points) { p.x += dx; p.y += dy; } }
                this.app.syncManager.updateElement(el);
            }
            this.dragStart = { x: world.x, y: world.y };
        }

        if (this.selectionRect) {
            this.selectionRect.x2 = world.x;
            this.selectionRect.y2 = world.y;
        }
    }

    onSelectUp() {
        if (this.resizeHandle) {
            this.resizeHandle = null; this.resizeStart = null; this.dragElement = null;
            this.app.saveHistory();
            return;
        }
        if (this.isDrawing) {
            this.isDrawing = false; this.dragStart = null;
            this.app.canvas.style.cursor = 'default';
            this.app.saveHistory();
        }
        if (this.selectionRect) {
            const r = this.selectionRect;
            const els = this.app.elementsInRect(r.x1, r.y1, r.x2, r.y2);
            for (const el of els) this.app.selectedIds.add(el.id);
            this.selectionRect = null;
        }
    }

    // === Sticky Note ===
    onStickyDown(world) {
        const sticky = createStickyNote(world.x - 100, world.y - 100, this.app.stickyColor);
        this.app.addElement(sticky);
        this.app.selectedIds = new Set([sticky.id]);
        this.setTool('select');
    }

    // === Shape Tools (rect, circle, triangle, diamond, star, hexagon) ===
    onShapeDown(world) {
        this.isDrawing = true;
        this.dragStart = { x: world.x, y: world.y };
    }

    onShapeMove(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.previewElement = {
            type: this.currentTool,
            x: Math.min(this.dragStart.x, world.x),
            y: Math.min(this.dragStart.y, world.y),
            width: Math.abs(world.x - this.dragStart.x),
            height: Math.abs(world.y - this.dragStart.y),
            color: this.app.currentColor,
            fill: this.app.currentFill,
            strokeWidth: this.app.currentStrokeWidth,
            points: 5, // for star
        };
    }

    onShapeUp(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.isDrawing = false;

        const w = Math.abs(world.x - this.dragStart.x);
        const h = Math.abs(world.y - this.dragStart.y);
        if (w < 5 && h < 5) { this.previewElement = null; return; }

        const x = Math.min(this.dragStart.x, world.x);
        const y = Math.min(this.dragStart.y, world.y);
        const color = this.app.currentColor;
        const fill = this.app.currentFill;

        let el;
        switch (this.currentTool) {
            case 'rect': el = createRect(x, y, w, h, color, fill); break;
            case 'circle':
                el = createCircle(x, y, w / 2, h / 2, color, fill);
                el.x = x; el.y = y; el.width = w; el.height = h;
                break;
            case 'triangle': el = createTriangle(x, y, w, h, color, fill); break;
            case 'diamond': el = createDiamond(x, y, w, h, color, fill); break;
            case 'star': el = createStar(x, y, w, h, color, fill); break;
            case 'hexagon': el = createHexagon(x, y, w, h, color, fill); break;
        }

        if (el) {
            el.strokeWidth = this.app.currentStrokeWidth;
            this.app.addElement(el);
        }
        this.previewElement = null;
    }

    // === Line/Arrow Tools ===
    onLineDown(world) {
        this.isDrawing = true;
        this.dragStart = { x: world.x, y: world.y };
    }

    onLineMove(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.previewElement = {
            type: this.currentTool,
            x: this.dragStart.x, y: this.dragStart.y,
            x2: world.x, y2: world.y,
            color: this.app.currentColor,
            strokeWidth: this.app.currentStrokeWidth,
        };
    }

    onLineUp(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.isDrawing = false;
        if (Math.hypot(world.x - this.dragStart.x, world.y - this.dragStart.y) < 5) {
            this.previewElement = null; return;
        }

        let el;
        if (this.currentTool === 'line') {
            el = createLine(this.dragStart.x, this.dragStart.y, world.x, world.y,
                          this.app.currentColor, this.app.currentStrokeWidth);
        } else {
            el = createArrow(this.dragStart.x, this.dragStart.y, world.x, world.y,
                           this.app.currentColor, this.app.currentStrokeWidth);
        }
        this.app.addElement(el);
        this.previewElement = null;
    }

    // === Draw Tool ===
    onDrawDown(world) {
        this.isDrawing = true;
        this.drawPoints = [{ x: world.x, y: world.y }];
    }

    onDrawMove(world) {
        if (!this.isDrawing) return;
        this.drawPoints.push({ x: world.x, y: world.y });
    }

    onDrawUp() {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        if (this.drawPoints.length < 2) return;
        const el = createDrawing([...this.drawPoints], this.app.currentColor, this.app.currentStrokeWidth);
        this.app.addElement(el);
        this.drawPoints = [];
    }

    // === Text Tool ===
    onTextDown(world) {
        this.startTextInput(world.x, world.y);
    }

    // === TextBox Tool ===
    onTextBoxDown(world) {
        this.isDrawing = true;
        this.dragStart = { x: world.x, y: world.y };
    }

    onTextBoxMove(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.previewElement = {
            type: 'textbox',
            x: Math.min(this.dragStart.x, world.x),
            y: Math.min(this.dragStart.y, world.y),
            width: Math.abs(world.x - this.dragStart.x),
            height: Math.abs(world.y - this.dragStart.y),
            color: this.app.currentColor,
            fill: '#FFFFFF',
            borderColor: '#cccccc',
            strokeWidth: 1,
            content: '',
        };
    }

    onTextBoxUp(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.isDrawing = false;

        const w = Math.abs(world.x - this.dragStart.x);
        const h = Math.abs(world.y - this.dragStart.y);
        if (w < 20 || h < 20) { this.previewElement = null; return; }

        const x = Math.min(this.dragStart.x, world.x);
        const y = Math.min(this.dragStart.y, world.y);
        const el = createTextBox(x, y, w, h, this.app.currentColor, '#FFFFFF');
        this.app.addElement(el);
        this.previewElement = null;

        // Immediately open text editing
        this.startTextEdit(el);
    }

    // === Connector Tool ===
    findNearestAnchor(world, excludeId = null) {
        const threshold = 15 / this.app.camera.zoom;
        let bestEl = null, bestAnchor = null, bestDist = Infinity;
        for (const el of this.app.elements) {
            if (el.id === excludeId) continue;
            const anchors = getAnchorPoints(el);
            for (const a of anchors) {
                const d = Math.hypot(a.x - world.x, a.y - world.y);
                if (d < threshold && d < bestDist) {
                    bestDist = d; bestEl = el; bestAnchor = a;
                }
            }
        }
        return bestEl ? { element: bestEl, anchor: bestAnchor } : null;
    }

    onConnectorDown(world) {
        const snap = this.findNearestAnchor(world);
        if (snap) {
            this.connectorSource = { elementId: snap.element.id, anchor: snap.anchor.name };
            this.isDrawing = true;
            this.dragStart = { x: snap.anchor.x, y: snap.anchor.y };
        }
    }

    onConnectorMove(world) {
        // Update hovered anchor for visual feedback
        const snap = this.findNearestAnchor(world, this.connectorSource?.elementId);
        this.connectorHoveredEl = snap ? snap.element : null;
        this.connectorHoveredAnchor = snap ? snap.anchor : null;

        if (!this.isDrawing || !this.dragStart) return;
        const endX = snap ? snap.anchor.x : world.x;
        const endY = snap ? snap.anchor.y : world.y;
        this.previewElement = {
            type: 'arrow',
            x: this.dragStart.x, y: this.dragStart.y,
            x2: endX, y2: endY,
            color: this.app.currentColor,
            strokeWidth: this.app.currentStrokeWidth,
        };
    }

    onConnectorUp(world) {
        if (!this.isDrawing || !this.connectorSource) {
            this.isDrawing = false;
            this.previewElement = null;
            this.connectorSource = null;
            return;
        }
        this.isDrawing = false;
        this.previewElement = null;

        const snap = this.findNearestAnchor(world, this.connectorSource.elementId);
        if (snap) {
            const el = createConnector(
                this.connectorSource.elementId,
                snap.element.id,
                this.connectorSource.anchor,
                snap.anchor.name,
                this.app.currentColor,
                this.app.currentStrokeWidth,
            );
            this.app.addElement(el);
            this.app.selectedIds = new Set([el.id]);
            this.showConnectorConfig(el);
        }
        this.connectorSource = null;
    }

    startConnectorLabelEdit(el) {
        const pts = resolveConnectorEndpoints(el, this.app.elements);
        const mx = (pts.sx + pts.ex) / 2;
        const my = (pts.sy + pts.ey) / 2;

        const overlay = document.getElementById('text-input-overlay');
        const input = document.getElementById('text-input');
        const s = this.app.camera.worldToScreen(mx, my);

        overlay.style.display = 'block';
        overlay.style.left = (s.x - 50) + 'px';
        overlay.style.top = (s.y - 15) + 'px';
        input.value = el.label || '';
        input.style.width = '120px';
        input.style.height = '';
        input.focus();
        input.select();

        const submit = () => {
            const text = input.value.trim();
            overlay.style.display = 'none';
            input.style.width = '';
            input.removeEventListener('blur', submit);
            input.removeEventListener('keydown', onKey);
            this.app.updateElement(el.id, { label: text });
            this.app.saveHistory();
        };

        const onKey = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') {
                overlay.style.display = 'none';
                input.style.width = '';
                input.removeEventListener('blur', submit);
                input.removeEventListener('keydown', onKey);
            }
        };

        input.addEventListener('blur', submit);
        input.addEventListener('keydown', onKey);
    }

    // === Connector Config Panel ===
    setupConnectorConfig() {
        const panel = document.getElementById('connector-config');
        if (!panel) return;

        panel.querySelectorAll('.marker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const end = btn.dataset.end;    // 'source' or 'target'
                const marker = btn.dataset.marker;
                const group = btn.closest('.marker-group');
                group.querySelectorAll('.marker-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateSelectedConnectorProp(end === 'source' ? 'sourceMarker' : 'targetMarker', marker);
            });
        });

        panel.querySelectorAll('.line-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.style;
                panel.querySelectorAll('.line-style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateSelectedConnectorProp('lineStyle', style);
            });
        });
    }

    updateSelectedConnectorProp(prop, value) {
        for (const id of this.app.selectedIds) {
            const el = this.app.getElementById(id);
            if (el && el.type === 'connector') {
                this.app.updateElement(id, { [prop]: value });
            }
        }
        this.app.saveHistory();
    }

    showConnectorConfig(el) {
        const panel = document.getElementById('connector-config');
        if (!panel) return;
        panel.classList.add('visible');

        // Set active states
        panel.querySelectorAll('[data-end="source"].marker-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.marker === (el.sourceMarker || 'none'));
        });
        panel.querySelectorAll('[data-end="target"].marker-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.marker === (el.targetMarker || 'arrow'));
        });
        panel.querySelectorAll('.line-style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === (el.lineStyle || 'solid'));
        });
    }

    hideConnectorConfig() {
        document.getElementById('connector-config')?.classList.remove('visible');
    }

    startTextInput(wx, wy) {
        const overlay = document.getElementById('text-input-overlay');
        const input = document.getElementById('text-input');
        const s = this.app.camera.worldToScreen(wx, wy);

        overlay.style.display = 'block';
        overlay.style.left = s.x + 'px';
        overlay.style.top = s.y + 'px';
        input.value = '';
        input.style.width = '';
        input.style.height = '';
        input.focus();

        const submit = () => {
            const text = input.value.trim();
            overlay.style.display = 'none';
            input.removeEventListener('blur', submit);
            input.removeEventListener('keydown', onKey);
            if (text) {
                const el = createText(wx, wy, text, this.app.currentColor);
                this.app.addElement(el);
            }
        };

        const onKey = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape') {
                overlay.style.display = 'none';
                input.removeEventListener('blur', submit);
                input.removeEventListener('keydown', onKey);
            }
        };

        input.addEventListener('blur', submit);
        input.addEventListener('keydown', onKey);
    }

    startTextEdit(el) {
        const overlay = document.getElementById('text-input-overlay');
        const input = document.getElementById('text-input');
        const s = this.app.camera.worldToScreen(el.x, el.y);
        const cam = this.app.camera;

        overlay.style.display = 'block';
        overlay.style.left = s.x + 'px';
        overlay.style.top = s.y + 'px';
        input.value = el.content || '';

        if (el.type === 'sticky' || el.type === 'textbox') {
            input.style.width = (el.width * cam.zoom) + 'px';
            input.style.height = (el.height * cam.zoom) + 'px';
        } else {
            input.style.width = Math.max(100, (el.width || 100) * cam.zoom) + 'px';
            input.style.height = '';
        }
        input.focus();
        input.select();

        const submit = () => {
            const text = input.value;
            overlay.style.display = 'none';
            input.style.width = ''; input.style.height = '';
            input.removeEventListener('blur', submit);
            input.removeEventListener('keydown', onKey);
            this.app.updateElement(el.id, { content: text });
            this.app.saveHistory();
        };

        const onKey = (e) => {
            if (e.key === 'Enter' && !e.shiftKey && el.type !== 'sticky' && el.type !== 'textbox') {
                e.preventDefault(); submit();
            }
            if (e.key === 'Escape') {
                overlay.style.display = 'none';
                input.style.width = ''; input.style.height = '';
                input.removeEventListener('blur', submit);
                input.removeEventListener('keydown', onKey);
            }
        };

        input.addEventListener('blur', submit);
        input.addEventListener('keydown', onKey);
    }

    getSelectedConnector() {
        if (this.app.selectedIds.size !== 1) return null;
        const id = [...this.app.selectedIds][0];
        const el = this.app.getElementById(id);
        return el && el.type === 'connector' ? el : null;
    }

    // === Draw Preview ===
    drawPreview(ctx) {
        if (this.previewElement) {
            this.app.drawElement(ctx, this.previewElement);
        }

        // Connector tool: draw anchor points on all connectable elements
        if (this.currentTool === 'connector') {
            const cam = this.app.camera;
            for (const el of this.app.elements) {
                const anchors = getAnchorPoints(el);
                for (const a of anchors) {
                    const s = cam.worldToScreen(a.x, a.y);
                    const isHovered = this.connectorHoveredAnchor &&
                        this.connectorHoveredAnchor.x === a.x && this.connectorHoveredAnchor.y === a.y;
                    const radius = isHovered ? 6 : 4;

                    ctx.beginPath();
                    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = isHovered ? '#2196F3' : 'rgba(33, 150, 243, 0.3)';
                    ctx.fill();
                    ctx.strokeStyle = '#2196F3';
                    ctx.lineWidth = isHovered ? 2 : 1;
                    ctx.stroke();
                }
            }
        }

        // Show/hide connector config panel based on selection
        const selectedConnector = this.getSelectedConnector();
        if (selectedConnector) {
            this.showConnectorConfig(selectedConnector);
        } else {
            this.hideConnectorConfig();
        }

        // Freehand preview
        if (this.isDrawing && this.currentTool === 'draw' && this.drawPoints.length > 1) {
            const cam = this.app.camera;
            ctx.strokeStyle = this.app.currentColor;
            ctx.lineWidth = this.app.currentStrokeWidth * cam.zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const s0 = cam.worldToScreen(this.drawPoints[0].x, this.drawPoints[0].y);
            ctx.moveTo(s0.x, s0.y);
            for (let i = 1; i < this.drawPoints.length; i++) {
                const s = cam.worldToScreen(this.drawPoints[i].x, this.drawPoints[i].y);
                ctx.lineTo(s.x, s.y);
            }
            ctx.stroke();
        }

        // Selection rectangle
        if (this.selectionRect) {
            const cam = this.app.camera;
            const s1 = cam.worldToScreen(this.selectionRect.x1, this.selectionRect.y1);
            const s2 = cam.worldToScreen(this.selectionRect.x2, this.selectionRect.y2);
            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.fillStyle = 'rgba(33, 150, 243, 0.08)';
            const rx = Math.min(s1.x, s2.x), ry = Math.min(s1.y, s2.y);
            const rw = Math.abs(s2.x - s1.x), rh = Math.abs(s2.y - s1.y);
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);
        }
    }
}

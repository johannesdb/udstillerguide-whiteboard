// Tool Manager - handles all whiteboard tools and their interactions
import {
    createStickyNote, createRect, createCircle,
    createLine, createArrow, createDrawing, createText,
    hitTest, hitTestResizeHandle,
} from '/js/canvas.js';

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

        this.setupCanvasEvents();
        this.setupToolbarEvents();
    }

    setTool(tool) {
        this.currentTool = tool;
        // Update toolbar buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Update cursor
        const cursorMap = {
            select: 'default',
            pan: 'grab',
            sticky: 'crosshair',
            rect: 'crosshair',
            circle: 'crosshair',
            line: 'crosshair',
            arrow: 'crosshair',
            draw: 'crosshair',
            text: 'text',
        };
        this.app.canvas.style.cursor = cursorMap[tool] || 'default';

        // Hide color/stroke pickers unless relevant
        if (tool !== 'color') {
            document.getElementById('color-picker')?.classList.remove('visible');
        }
        if (tool !== 'stroke-width') {
            document.getElementById('stroke-picker')?.classList.remove('visible');
        }
    }

    setupToolbarEvents() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (tool === 'color') {
                    document.getElementById('color-picker')?.classList.toggle('visible');
                    document.getElementById('stroke-picker')?.classList.remove('visible');
                    return;
                }
                if (tool === 'stroke-width') {
                    document.getElementById('stroke-picker')?.classList.toggle('visible');
                    document.getElementById('color-picker')?.classList.remove('visible');
                    return;
                }
                this.setTool(tool);
            });
        });

        // Color swatches
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                this.app.currentColor = color;
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');

                // Update color button appearance
                const colorBtn = document.querySelector('[data-tool="color"] svg circle');
                if (colorBtn) {
                    colorBtn.setAttribute('fill', color);
                    colorBtn.setAttribute('stroke', color);
                }

                // Update selected elements' colors
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

        // Stroke width
        const strokeRange = document.getElementById('stroke-range');
        const strokeValue = document.getElementById('stroke-value');
        if (strokeRange) {
            strokeRange.addEventListener('input', () => {
                const val = parseInt(strokeRange.value);
                strokeValue.textContent = val;
                this.app.currentStrokeWidth = val;

                // Update selected elements
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

        // Space key for temporary pan mode
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
                if (!this.isPanning) {
                    this.setTool(this.currentTool); // restore cursor
                }
            }
        });

        canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Prevent context menu
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onMouseDown(e) {
        const canvas = this.app.canvas;
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);

        // Middle mouse button or space+click = pan
        if (e.button === 1 || this.spaceDown || this.currentTool === 'pan') {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
            return;
        }

        if (e.button !== 0) return;

        switch (this.currentTool) {
            case 'select':
                this.onSelectDown(world, e);
                break;
            case 'sticky':
                this.onStickyDown(world);
                break;
            case 'rect':
            case 'circle':
                this.onShapeDown(world);
                break;
            case 'line':
            case 'arrow':
                this.onLineDown(world);
                break;
            case 'draw':
                this.onDrawDown(world);
                break;
            case 'text':
                this.onTextDown(world);
                break;
        }
    }

    onMouseMove(e) {
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);

        // Send cursor position for collaboration
        this.app.syncManager.sendCursorPosition(world.x, world.y);

        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            cam.pan(dx, dy);
            this.panStart = { x: e.clientX, y: e.clientY };
            this.updateZoomDisplay();
            return;
        }

        switch (this.currentTool) {
            case 'select':
                this.onSelectMove(world, e);
                break;
            case 'rect':
            case 'circle':
                this.onShapeMove(world);
                break;
            case 'line':
            case 'arrow':
                this.onLineMove(world);
                break;
            case 'draw':
                this.onDrawMove(world);
                break;
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

        switch (this.currentTool) {
            case 'select':
                this.onSelectUp(world);
                break;
            case 'rect':
            case 'circle':
                this.onShapeUp(world);
                break;
            case 'line':
            case 'arrow':
                this.onLineUp(world);
                break;
            case 'draw':
                this.onDrawUp();
                break;
        }
    }

    onDoubleClick(e) {
        const cam = this.app.camera;
        const world = cam.screenToWorld(e.offsetX, e.offsetY);

        const el = this.app.hitTestElements(world.x, world.y);
        if (el && (el.type === 'sticky' || el.type === 'text')) {
            this.startTextEdit(el);
        }
    }

    onWheel(e) {
        e.preventDefault();
        this.app.camera.zoomAt(e.offsetX, e.offsetY, e.deltaY);
        this.updateZoomDisplay();
    }

    updateZoomDisplay() {
        const el = document.getElementById('zoom-level');
        if (el) {
            el.textContent = Math.round(this.app.camera.zoom * 100) + '%';
        }
    }

    // === Select Tool ===
    onSelectDown(world, e) {
        // Check for resize handles on selected elements
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
                // Toggle selection
                if (this.app.selectedIds.has(hit.id)) {
                    this.app.selectedIds.delete(hit.id);
                } else {
                    this.app.selectedIds.add(hit.id);
                }
            } else if (!this.app.selectedIds.has(hit.id)) {
                this.app.selectedIds = new Set([hit.id]);
            }
            // Start drag
            this.isDrawing = true;
            this.dragStart = { x: world.x, y: world.y };
            this.app.canvas.style.cursor = 'move';
        } else {
            // Start selection rectangle
            if (!e.shiftKey) {
                this.app.selectedIds.clear();
            }
            this.selectionRect = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
        }
    }

    onSelectMove(world, e) {
        if (this.resizeHandle && this.dragElement) {
            const el = this.dragElement;
            const dx = world.x - this.resizeStart.x;
            const dy = world.y - this.resizeStart.y;

            const updates = {};
            if (this.resizeHandle.includes('w')) {
                updates.x = el.x + dx;
                updates.width = el.width - dx;
            }
            if (this.resizeHandle.includes('e')) {
                updates.width = el.width + dx;
            }
            if (this.resizeHandle.includes('n')) {
                updates.y = el.y + dy;
                updates.height = el.height - dy;
            }
            if (this.resizeHandle.includes('s')) {
                updates.height = el.height + dy;
            }

            // Prevent negative dimensions
            if (updates.width !== undefined && updates.width < 10) return;
            if (updates.height !== undefined && updates.height < 10) return;

            Object.assign(el, updates);
            this.resizeStart = { x: world.x, y: world.y };
            this.app.syncManager.updateElement(el);
            return;
        }

        if (this.isDrawing && this.dragStart) {
            // Move selected elements
            const dx = world.x - this.dragStart.x;
            const dy = world.y - this.dragStart.y;

            for (const id of this.app.selectedIds) {
                const el = this.app.getElementById(id);
                if (!el) continue;

                el.x += dx;
                el.y += dy;
                if (el.type === 'line' || el.type === 'arrow') {
                    el.x2 += dx;
                    el.y2 += dy;
                }
                if (el.type === 'drawing') {
                    for (const p of el.points) {
                        p.x += dx;
                        p.y += dy;
                    }
                }
                this.app.syncManager.updateElement(el);
            }
            this.dragStart = { x: world.x, y: world.y };
        }

        if (this.selectionRect) {
            this.selectionRect.x2 = world.x;
            this.selectionRect.y2 = world.y;
        }
    }

    onSelectUp(world) {
        if (this.resizeHandle) {
            this.resizeHandle = null;
            this.resizeStart = null;
            this.dragElement = null;
            this.app.saveHistory();
            return;
        }

        if (this.isDrawing) {
            this.isDrawing = false;
            this.dragStart = null;
            this.app.canvas.style.cursor = 'default';
            this.app.saveHistory();
        }

        if (this.selectionRect) {
            const rect = this.selectionRect;
            const els = this.app.elementsInRect(rect.x1, rect.y1, rect.x2, rect.y2);
            for (const el of els) {
                this.app.selectedIds.add(el.id);
            }
            this.selectionRect = null;
        }
    }

    // === Sticky Note Tool ===
    onStickyDown(world) {
        const sticky = createStickyNote(world.x - 100, world.y - 100, this.app.stickyColor);
        this.app.addElement(sticky);
        this.app.selectedIds = new Set([sticky.id]);
        this.setTool('select');
    }

    // === Shape Tools ===
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
        };
    }

    onShapeUp(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.isDrawing = false;

        const w = Math.abs(world.x - this.dragStart.x);
        const h = Math.abs(world.y - this.dragStart.y);

        if (w < 5 && h < 5) {
            this.previewElement = null;
            return;
        }

        const x = Math.min(this.dragStart.x, world.x);
        const y = Math.min(this.dragStart.y, world.y);

        let el;
        if (this.currentTool === 'rect') {
            el = createRect(x, y, w, h, this.app.currentColor, this.app.currentFill);
        } else {
            el = createCircle(x, y, w / 2, h / 2, this.app.currentColor, this.app.currentFill);
            el.x = x;
            el.y = y;
            el.width = w;
            el.height = h;
        }

        el.strokeWidth = this.app.currentStrokeWidth;
        this.app.addElement(el);
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
            x: this.dragStart.x,
            y: this.dragStart.y,
            x2: world.x,
            y2: world.y,
            color: this.app.currentColor,
            strokeWidth: this.app.currentStrokeWidth,
        };
    }

    onLineUp(world) {
        if (!this.isDrawing || !this.dragStart) return;
        this.isDrawing = false;

        const dx = world.x - this.dragStart.x;
        const dy = world.y - this.dragStart.y;
        if (Math.hypot(dx, dy) < 5) {
            this.previewElement = null;
            return;
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

        const el = createDrawing(
            [...this.drawPoints],
            this.app.currentColor,
            this.app.currentStrokeWidth
        );
        this.app.addElement(el);
        this.drawPoints = [];
    }

    // === Text Tool ===
    onTextDown(world) {
        this.startTextInput(world.x, world.y);
    }

    startTextInput(wx, wy) {
        const overlay = document.getElementById('text-input-overlay');
        const input = document.getElementById('text-input');
        const s = this.app.camera.worldToScreen(wx, wy);

        overlay.style.display = 'block';
        overlay.style.left = s.x + 'px';
        overlay.style.top = s.y + 'px';
        input.value = '';
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
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
            }
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

        overlay.style.display = 'block';
        overlay.style.left = s.x + 'px';
        overlay.style.top = s.y + 'px';
        input.value = el.content || '';
        input.style.width = Math.max(100, el.width * this.app.camera.zoom) + 'px';
        if (el.type === 'sticky') {
            input.style.width = el.width * this.app.camera.zoom + 'px';
            input.style.height = el.height * this.app.camera.zoom + 'px';
        }
        input.focus();
        input.select();

        const submit = () => {
            const text = input.value;
            overlay.style.display = 'none';
            input.style.width = '';
            input.style.height = '';
            input.removeEventListener('blur', submit);
            input.removeEventListener('keydown', onKey);

            this.app.updateElement(el.id, { content: text });
            this.app.saveHistory();
        };

        const onKey = (e) => {
            if (e.key === 'Enter' && !e.shiftKey && el.type !== 'sticky') {
                e.preventDefault();
                submit();
            }
            if (e.key === 'Escape') {
                overlay.style.display = 'none';
                input.style.width = '';
                input.style.height = '';
                input.removeEventListener('blur', submit);
                input.removeEventListener('keydown', onKey);
            }
        };

        input.addEventListener('blur', submit);
        input.addEventListener('keydown', onKey);
    }

    // === Draw Preview ===
    drawPreview(ctx) {
        // Draw shape/line preview
        if (this.previewElement) {
            const el = this.previewElement;
            if (el.type === 'rect') {
                this.app.drawRect(ctx, el);
            } else if (el.type === 'circle') {
                this.app.drawCircleEl(ctx, el);
            } else if (el.type === 'line') {
                this.app.drawLine(ctx, el);
            } else if (el.type === 'arrow') {
                this.app.drawArrow(ctx, el);
            }
        }

        // Draw freehand preview
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

        // Draw selection rectangle
        if (this.selectionRect) {
            const cam = this.app.camera;
            const s1 = cam.worldToScreen(this.selectionRect.x1, this.selectionRect.y1);
            const s2 = cam.worldToScreen(this.selectionRect.x2, this.selectionRect.y2);

            ctx.strokeStyle = '#2196F3';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.fillStyle = 'rgba(33, 150, 243, 0.08)';
            const rx = Math.min(s1.x, s2.x);
            const ry = Math.min(s1.y, s2.y);
            const rw = Math.abs(s2.x - s1.x);
            const rh = Math.abs(s2.y - s1.y);
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);
        }
    }
}

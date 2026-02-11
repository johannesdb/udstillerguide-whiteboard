---
id: wb-1
title: "Fase 1: Plugin Registry"
type: feature
status: open
priority: 1
created: 2026-02-11
---

# Fase 1: Plugin Registry

Tilfoej et generisk plugin-system til whiteboard frontend.

## Opgaver

- [ ] `WhiteboardPlugins` klasse med `register()` metode
- [ ] Hook ind i canvas render-loop for custom element-typer
- [ ] Hook ind i tool manager for custom tools
- [ ] Sidebar-panel system for plugin-UI
- [ ] Element lifecycle hooks (create, update, delete)

## Filer

Nye:
- `backend/static/js/plugins.js` - Plugin Registry

AEndringer:
- `backend/static/js/canvas.js` - Hook for custom element-typer i render/hitTest
- `backend/static/js/tools.js` - Hook for custom tools
- `backend/static/js/ui.js` - Sidebar panel-system for plugins
- `backend/static/board.html` - Script-tags for nye filer

## Reference

Se [design-dokument](../../docs/plans/2026-02-11-ug-plugin-integration-design.md)

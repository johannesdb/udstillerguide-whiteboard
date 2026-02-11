---
id: wb-6
title: "Plugin Registry klasse"
type: task
status: closed
priority: 1
created: 2026-02-11
parent: wb-1
---

# Plugin Registry klasse

Opret `WhiteboardPlugins` static klasse som central registry for element-typer, sidebar-panels, toolbar-tools og lifecycle hooks.

## Opgaver

- [x] Opret `backend/static/js/plugins.js`
- [x] `WhiteboardPlugins` klasse med static members: `elementTypes` (Map), `panels` (Array), `tools` (Array), `hooks` (Object)
- [x] Static metoder: `registerElementType()`, `registerPanel()`, `registerTools()`, `register()`, `getElementType()`, `fireHook()`
- [x] Eksporter som named export

## Filer

Nye:
- `backend/static/js/plugins.js`
- `backend/static/tests/plugins.test.js` (17 tests, alle grønne)
- `backend/static/package.json` (Node test runner)

## Reference

Se [implementeringsplan](../../.claude/plans/nifty-meandering-bear.md) Task 1

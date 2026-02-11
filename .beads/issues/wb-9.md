---
id: wb-9
title: "Plugin tool registration"
type: task
status: closed
priority: 2
created: 2026-02-11
parent: wb-1
blocked-by:
  - wb-6
---

# Plugin tool registration

Tilfoej mulighed for at plugins kan registrere toolbar-knapper via `ToolManager`.

## Opgaver

- [x] Import `WhiteboardPlugins` i `tools.js`
- [x] Tilfoej `registerPluginTools()` metode til `ToolManager`
- [x] Kald `registerPluginTools()` i ToolManager constructor

## Filer

AEndringer:
- `backend/static/js/tools.js`

## Reference

Se [implementeringsplan](../../.claude/plans/nifty-meandering-bear.md) Task 4

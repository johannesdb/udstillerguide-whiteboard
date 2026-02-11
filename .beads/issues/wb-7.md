---
id: wb-7
title: "Register built-in element types"
type: task
status: closed
priority: 1
created: 2026-02-11
parent: wb-1
blocked-by:
  - wb-6
---

# Register built-in element types

Refaktorer `canvas.js` til at bruge plugin registry for element type dispatch. Registrer alle 13 built-in typer via `registerBuiltinTypes()`.

## Opgaver

- [x] Import `WhiteboardPlugins` i `canvas.js`
- [x] Opret `registerBuiltinTypes(app)` funktion der registrerer alle 13 typer
- [x] Kald `registerBuiltinTypes(this)` i WhiteboardApp constructor
- [x] Erstat `drawElement()` switch med registry dispatch
- [x] Erstat `hitTest()` switch med registry dispatch

## Filer

AEndringer:
- `backend/static/js/canvas.js`

## Reference

Se [implementeringsplan](../../.claude/plans/nifty-meandering-bear.md) Task 2

---
id: wb-2
title: "Fase 2: UG Plugin med mock-data"
type: feature
status: open
priority: 1
created: 2026-02-11
blocked-by:
  - wb-1
---

# Fase 2: UG Plugin med mock-data

Byg UG-pluginet med hardcoded demo messe-data og custom element-typer.

## Opgaver

- [ ] Definer mock messe-data (2 haller, 8 stande, taxonomier)
- [ ] Implementer `ug-hal` render/hitTest
- [ ] Implementer `ug-stand` render/hitTest med status-farver
- [ ] Implementer `ug-udstiller` render/hitTest
- [ ] Auto-generering af spatial gulvplan fra mock-data
- [ ] Auto-generering af hierarki-diagram fra mock-data
- [ ] Redigeringspanel ved dobbeltklik paa element

## Filer

Nye:
- `backend/static/js/plugins/ug-plugin.js` - UG Plugin registrering
- `backend/static/js/plugins/ug-elements.js` - Custom element render/hitTest
- `backend/static/js/plugins/ug-layout.js` - Auto-generering af views
- `backend/static/js/plugins/ug-mock-data.js` - Demo messe-data

## Reference

Se [design-dokument](../../docs/plans/2026-02-11-ug-plugin-integration-design.md)

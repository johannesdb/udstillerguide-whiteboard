---
id: wb-4
title: "Fase 4: Core integration"
type: feature
status: open
priority: 3
created: 2026-02-11
blocked-by:
  - wb-3
---

# Fase 4: Core integration

Erstat mock-data med reel integration til UG Core Rust-service via REST API.

## Opgaver

- [ ] Erstat mock-data med REST API kald til Core
- [ ] Implementer sync-flow (hent, opdater, opret)
- [ ] Sync-status indikatorer (synced/pending/conflict/local-only)
- [ ] Fejlhaandtering og retry
- [ ] Optimistic updates med rollback ved fejl

## Forudsaetninger

Kraever at UG Core Rust-service eksisterer med REST API for:
- `GET /api/messe/{id}/full` - Hent komplet messe-data
- `PUT /api/stande/{id}` - Opdater stand
- `POST /api/stande` - Opret ny stand

## Reference

Se [design-dokument](../../docs/plans/2026-02-11-ug-plugin-integration-design.md)

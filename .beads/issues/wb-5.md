# wb-5: Automatisk cache-busting for statiske filer

- **type**: task
- **status**: closed
- **priority**: 3
- **created**: 2026-02-11

## Beskrivelse

I dag bruger vi manuelle `?v=2` query-parametre på alle JS/CSS-imports for at busse CDN-cachen. Dette er fejlbehæftet og kræver at man husker at bumpe versionen i alle filer ved hver deploy.

Lav en automatisk løsning, f.eks.:
- Et build-script der erstatter `?v=X` med `?v=<git-short-hash>` eller `?v=<timestamp>` i alle HTML- og JS-filer
- Alternativt: server-side middleware i Axum der injicerer version-headers eller rewriter URLs
- Kunne også være en simpel `Makefile`/`justfile` target der kører som del af deploy

### Filer der skal opdateres

- `backend/static/index.html` (CSS + JS entry)
- `backend/static/board.html` (CSS + JS entry)
- `backend/static/js/app.js` (import af auth.js)
- `backend/static/js/canvas.js` (imports af tools.js, ui.js, sync.js, auth.js)
- `backend/static/js/ui.js` (import af auth.js)

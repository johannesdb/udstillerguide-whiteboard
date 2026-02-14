# Whiteboard Project

## Frontend-strategi

**Princip: Fejl skal fanges af compileren, ikke af brugeren.**

- **HTMX + Web Awesome + Askama** er primær frontend-teknologi — al UI-logik lever i Rust
- **Web Awesome Pro 3** (`@awesome.me/webawesome-pro`) er UI-komponentbibliotek
  - Web Components — virker nativt med HTMX uden framework-overhead
  - Brug `<wa-button>`, `<wa-input>`, `<wa-dialog>`, `<wa-card>` osv. direkte i Askama templates
  - Styling via CSS custom properties (theming)
  - npm-pakke fra Cloudsmith registry (kræver `WEBAWESOME_NPM_TOKEN`)
- **Font Awesome Sharp Duotone Thin** er standard ikon-stil overalt i UG
  - Syntax: `<wa-icon name="gauge" family="sharp-duotone" variant="thin"></wa-icon>`
  - VIGTIGT: `family="sharp-duotone-thin"` virker IKKE — brug altid `family` + `variant` separat
  - Duotone-farver: Primary (streg/outline) = teal `--brand-primary-base` (#314F59), Secondary (fyld/fill) = coral `--brand-accent` (#E07A5F)
  - CSS: `--primary-color`, `--secondary-color`, `--secondary-opacity: 1` på `wa-icon[family="sharp-duotone"]`
  - Status-badges bruger `family="sharp-duotone-solid"` (fyldte ikoner)
- **Server-side rendering** — HTML genereres i typechecked Rust-templates
- **Ingen SPA-framework** — ingen React/Vue/Angular
- **JavaScript kun hvor strengt nødvendigt:**
  - Canvas-operationer (standkort)
  - Global error-handling (`error-handler.js`)
  - Browser-API'er der ikke kan erstattes af HTMX
- **HTMX håndterer dynamik:** partial updates, formularer, søgning, modals via `hx-get`/`hx-post`/`hx-swap`

## Error Handling Policy

### Regel: Al kode SKAL have error handling

**JavaScript (frontend):**
- Alle async funktioner SKAL wrappe i try/catch
- Canvas-operationer SKAL wrappe i try/catch
- WebSocket message handlers SKAL wrappe i try/catch
- Global error handlers SKAL være aktive: `window.onerror` + `window.onunhandledrejection`
- Fejl SKAL sendes til backend via POST `/api/errors`
- Brugeren SKAL se en diskret fejlbesked (toast/snackbar) - ALDRIG stille fejl

**Rust (backend):**
- Alle handler-funktioner SKAL returnere Result<T, AppError>
- AppError SKAL implementere IntoResponse og logge til DB
- Panics SKAL fanges via tower CatchPanic middleware
- Alle externe kald (DB, filesystem, network) SKAL have explicit error handling
- BRUG IKKE .unwrap() eller .expect() i production-kode - kun i tests

**Generelt:**
- Fejl MÅ ALDRIG swallowes stille
- Alle fejl SKAL logges til error_log tabellen med fuld kontekst
- Kritiske fejl (severity: critical) SKAL oprette en Beads task automatisk

## Playwright / Browser Testing

- Playwright SKAL altid køre i **headless mode** som standard (`headless: true`)
- Headed mode kun hvis brugeren eksplicit beder om at se browseren
- Brug trace viewer (`context.tracing`) til debugging fremfor headed mode

## Deploy

- Deploy-script: `bash deploy.sh` (pusher til origin, SSH'er til server, puller og rebuilder Docker)
- Server: `udstillerguide` (SSH alias), remote dir: `/opt/udstillerguide-whiteboard`
- Docker build kræver `WEBAWESOME_NPM_TOKEN` i serverens `.env`

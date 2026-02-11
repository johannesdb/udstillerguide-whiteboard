# Whiteboard Project

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

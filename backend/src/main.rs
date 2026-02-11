mod api;
mod auth;
mod config;
mod db;
mod errors;
mod ws;

use std::sync::Arc;

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

use ws::handler::AppState;
use ws::room::RoomManager;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env file
    let _ = dotenvy::dotenv();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = config::Config::from_env()?;

    // Create database pool
    let pool = db::create_pool(&config.database_url).await?;

    // Run migrations
    db::run_migrations(&pool).await?;

    // Create shared state
    let state = Arc::new(AppState {
        pool,
        room_manager: RoomManager::new(),
        jwt_secret: config.jwt_secret.clone(),
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Auth middleware layer - injects jwt_secret into extensions
    let jwt_secret = config.jwt_secret.clone();
    let inject_secret =
        middleware::from_fn(move |mut request: axum::extract::Request, next: middleware::Next| {
            let secret = jwt_secret.clone();
            async move {
                request.extensions_mut().insert(secret);
                next.run(request).await
            }
        });

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/auth/register", post(api::users::register))
        .route("/api/auth/login", post(api::users::login))
        .route("/api/errors", post(api::errors::report_error))
        .route(
            "/api/share/:token",
            get(api::boards::get_board_by_share_token),
        )
        .route(
            "/api/boards/:board_id/images/:image_id",
            get(api::images::get_image),
        );

    // Protected routes (auth required)
    let protected_routes = Router::new()
        .route("/api/me", get(api::users::me))
        .route("/api/boards", get(api::boards::list_boards))
        .route("/api/boards", post(api::boards::create_board))
        .route("/api/boards/:id", get(api::boards::get_board))
        .route("/api/boards/:id", put(api::boards::update_board))
        .route("/api/boards/:id", delete(api::boards::delete_board))
        .route(
            "/api/boards/:id/collaborators",
            post(api::boards::add_collaborator),
        )
        .route(
            "/api/boards/:board_id/collaborators/:user_id",
            delete(api::boards::remove_collaborator),
        )
        .route(
            "/api/boards/:id/share-links",
            post(api::boards::create_share_link),
        )
        .route(
            "/api/boards/:id/share-links",
            get(api::boards::get_share_links),
        )
        .route(
            "/api/boards/:board_id/share-links/:link_id",
            delete(api::boards::delete_share_link),
        )
        .route(
            "/api/boards/:id/images",
            post(api::images::upload_image),
        )
        .layer(middleware::from_fn(auth::middleware::auth_middleware))
        .layer(inject_secret);

    // WebSocket route
    let ws_routes = Router::new().route("/ws/:board_id", get(ws::handler::ws_handler));

    // Static file serving
    let static_service = ServeDir::new("static").append_index_html_on_directories(true);

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .merge(ws_routes)
        .fallback_service(static_service)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

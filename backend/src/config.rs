use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub host: String,
    pub port: u16,
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_redirect_uri: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL must be set")?,
            jwt_secret: std::env::var("JWT_SECRET")
                .context("JWT_SECRET must be set")?,
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .context("PORT must be a valid number")?,
            google_client_id: std::env::var("GOOGLE_CLIENT_ID").ok(),
            google_client_secret: std::env::var("GOOGLE_CLIENT_SECRET").ok(),
            google_redirect_uri: std::env::var("GOOGLE_REDIRECT_URI").ok(),
        })
    }

    pub fn google_oauth_enabled(&self) -> bool {
        self.google_client_id.is_some()
            && self.google_client_secret.is_some()
            && self.google_redirect_uri.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Mutex to prevent parallel env var tests from interfering
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_config_from_env_with_all_vars() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::set_var("DATABASE_URL", "postgres://localhost/test");
        std::env::set_var("JWT_SECRET", "mysecret");
        std::env::set_var("HOST", "127.0.0.1");
        std::env::set_var("PORT", "8080");

        let config = Config::from_env().expect("should parse config");
        assert_eq!(config.database_url, "postgres://localhost/test");
        assert_eq!(config.jwt_secret, "mysecret");
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 8080);

        std::env::remove_var("HOST");
        std::env::remove_var("PORT");
    }

    #[test]
    fn test_config_defaults() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::set_var("DATABASE_URL", "postgres://localhost/test");
        std::env::set_var("JWT_SECRET", "secret");
        std::env::remove_var("HOST");
        std::env::remove_var("PORT");

        let config = Config::from_env().expect("should parse config");
        assert_eq!(config.host, "0.0.0.0");
        assert_eq!(config.port, 3000);
    }

    #[test]
    fn test_config_missing_database_url() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::remove_var("DATABASE_URL");
        std::env::set_var("JWT_SECRET", "secret");

        let result = Config::from_env();
        assert!(result.is_err());

        // Restore
        std::env::set_var("DATABASE_URL", "postgres://localhost/test");
    }

    #[test]
    fn test_config_missing_jwt_secret() {
        let _lock = ENV_MUTEX.lock().unwrap();
        std::env::set_var("DATABASE_URL", "postgres://localhost/test");
        std::env::remove_var("JWT_SECRET");

        let result = Config::from_env();
        assert!(result.is_err());

        // Restore
        std::env::set_var("JWT_SECRET", "secret");
    }
}

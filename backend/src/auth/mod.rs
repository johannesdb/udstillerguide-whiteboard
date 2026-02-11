pub mod google;
pub mod middleware;

use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub username: String,
    pub exp: usize,
    pub iat: usize,
}

pub fn create_token(user_id: Uuid, username: &str, secret: &str) -> anyhow::Result<String> {
    let now = Utc::now();
    let exp = now + Duration::hours(24);
    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn verify_token(token: &str, secret: &str) -> anyhow::Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_verify_token() {
        let user_id = Uuid::new_v4();
        let username = "testuser";
        let secret = "test-secret-key";

        let token = create_token(user_id, username, secret).expect("should create token");
        assert!(!token.is_empty());

        let claims = verify_token(&token, secret).expect("should verify token");
        assert_eq!(claims.sub, user_id);
        assert_eq!(claims.username, username);
        assert!(claims.exp > claims.iat);
    }

    #[test]
    fn test_verify_with_wrong_secret() {
        let user_id = Uuid::new_v4();
        let token = create_token(user_id, "user", "secret1").unwrap();
        let result = verify_token(&token, "secret2");
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_invalid_token() {
        let result = verify_token("not.a.valid.token", "secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_token_contains_correct_username() {
        let user_id = Uuid::new_v4();
        let token = create_token(user_id, "alice", "secret").unwrap();
        let claims = verify_token(&token, "secret").unwrap();
        assert_eq!(claims.username, "alice");
    }

    #[test]
    fn test_token_expiry_is_24h() {
        let user_id = Uuid::new_v4();
        let token = create_token(user_id, "user", "secret").unwrap();
        let claims = verify_token(&token, "secret").unwrap();
        let duration = claims.exp - claims.iat;
        assert_eq!(duration, 86400); // 24 hours in seconds
    }
}

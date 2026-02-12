use anyhow::{Context, Result};
use reqwest::Client;

use super::types::{UgChangesResponse, UgFullResponse, UgMesse};

pub struct UgClient {
    http: Client,
    base_url: String,
    api_key: String,
}

impl UgClient {
    pub fn new(base_url: &str, api_key: &str) -> Self {
        Self {
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("Failed to build HTTP client"),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
        }
    }

    pub async fn get_messe(&self, messe_id: &str) -> Result<UgMesse> {
        let url = format!("{}/api/v1/messer/{}", self.base_url, messe_id);
        let resp = self.http.get(&url)
            .header("X-API-Key", &self.api_key)
            .send().await
            .context("Failed to reach UG Core")?;
        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for GET {}", resp.status(), url);
        }
        resp.json().await.context("Invalid JSON from UG Core /messer")
    }

    pub async fn get_full(&self, messe_id: &str) -> Result<UgFullResponse> {
        let url = format!("{}/api/v1/messer/{}/full", self.base_url, messe_id);
        let resp = self.http.get(&url)
            .header("X-API-Key", &self.api_key)
            .send().await
            .context("Failed to reach UG Core /full")?;
        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for GET {}", resp.status(), url);
        }
        resp.json().await.context("Invalid JSON from UG Core /full")
    }

    pub async fn get_changes(&self, messe_id: &str, since: &str) -> Result<UgChangesResponse> {
        let url = format!("{}/api/v1/messer/{}/changes", self.base_url, messe_id);
        let resp = self.http.get(&url)
            .header("X-API-Key", &self.api_key)
            .query(&[("since", since)])
            .send().await
            .context("Failed to reach UG Core /changes")?;
        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for GET {}", resp.status(), url);
        }
        resp.json().await.context("Invalid JSON from UG Core /changes")
    }

    pub async fn update_stand(&self, stand_id: &str, body: &serde_json::Value) -> Result<()> {
        let url = format!("{}/api/v1/stande/{}", self.base_url, stand_id);
        let resp = self.http.put(&url)
            .header("X-API-Key", &self.api_key)
            .json(body)
            .send().await
            .context("Failed to push stand update to UG Core")?;
        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for PUT {}", resp.status(), url);
        }
        Ok(())
    }

    pub async fn update_taxonomi(&self, taxonomi_id: &str, body: &serde_json::Value) -> Result<()> {
        let url = format!("{}/api/v1/taxonomier/{}", self.base_url, taxonomi_id);
        let resp = self.http.put(&url)
            .header("X-API-Key", &self.api_key)
            .json(body)
            .send().await
            .context("Failed to push taxonomy update to UG Core")?;
        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for PUT {}", resp.status(), url);
        }
        Ok(())
    }
}

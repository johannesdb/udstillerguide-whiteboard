use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgMesse {
    pub id: String,
    pub navn: String,
    pub dato: String,
    pub lokation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgHal {
    pub id: String,
    pub navn: String,
    pub bredde: f64,
    pub hoejde: f64,
    pub farve: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgStandPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgStand {
    pub id: String,
    pub standnummer: String,
    pub hal_id: String,
    pub udstiller_id: Option<String>,
    pub bredde: f64,
    pub hoejde: f64,
    pub status: String,
    pub position: Option<UgStandPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgUdstiller {
    pub id: String,
    pub firmanavn: String,
    pub kontakt: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgTaxonomi {
    pub id: String,
    pub navn: String,
    pub parent: Option<String>,
    pub children: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgFullResponse {
    pub messe: UgMesse,
    pub haller: Vec<UgHal>,
    pub stande: Vec<UgStand>,
    pub udstillere: Vec<UgUdstiller>,
    pub taxonomier: Vec<UgTaxonomi>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgChange {
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub data: serde_json::Value,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgChangesResponse {
    pub changes: Vec<UgChange>,
    pub version: String,
}

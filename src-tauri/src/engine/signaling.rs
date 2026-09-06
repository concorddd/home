//! Signaling de SDP/ICE via Supabase Data API.
//!
//! Apenas mensagens de controle (ofertas, respostas, candidatos ICE) passam por
//! aqui — são pacotes de bytes, nunca mídia. O vídeo vai direto peer-to-peer.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalMessage {
    pub id: Option<i64>,
    pub room: String,
    pub sender: String,
    pub kind: String, // "offer" | "answer" | "ice" | "bye"
    pub payload: serde_json::Value,
    #[serde(default)]
    pub created_at: String,
}

pub struct Signaling {
    http: reqwest::Client,
    base: String,
    apikey: String,
    room: String,
    self_id: String,
    last_seen_id: i64,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl Signaling {
    pub fn new(supabase_url: &str, apikey: String, room: String, self_id: String) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        let _ = headers.insert("apikey", apikey.parse().unwrap_or_default());
        // RLS: o cliente usa o token do usuário quando disponível; para
        // simplicidade nativa usamos a service/anon key passada pelo frontend.
        let _ = headers.insert("Authorization", format!("Bearer {apikey}").parse().unwrap_or_default());
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(8))
            .build()
            .unwrap_or_default();
        Self {
            http,
            base: supabase_url.trim_end_matches('/').to_string(),
            apikey,
            room,
            self_id,
            last_seen_id: 0,
        }
    }

    fn url(&self) -> String {
        format!("{}/rest/v1/native_signaling", self.base)
    }

    /// Envia uma mensagem de sinalização.
    pub async fn send(&self, kind: &str, payload: serde_json::Value) -> Result<()> {
        let body = serde_json::json!({
            "room": self.room,
            "sender": self.self_id,
            "kind": kind,
            "payload": payload,
        });
        let resp = self
            .http
            .post(self.url())
            .header("Prefer", "return=minimal")
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("signaling send falhou: {}", resp.status()));
        }
        Ok(())
    }

    /// Lê mensagens de outros peers na sala (polling incremental por id).
    pub async fn poll(&mut self) -> Result<Vec<SignalMessage>> {
        let since = if self.last_seen_id > 0 {
            format!("id=gt.{},room=eq.{},sender=neq.{},id=order.asc&limit=50", self.last_seen_id, self.room, self.self_id)
        } else {
            format!("room=eq.{},sender=neq.{},id=order.asc&limit=50", self.room, self.self_id)
        };
        let resp = self
            .http
            .get(self.url())
            .query(&[("select", "id,room,sender,kind,payload,created_at")])
            .header("Range", since)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(anyhow!("signaling poll falhou: {}", resp.status()));
        }
        let msgs: Vec<SignalMessage> = resp.json().await.unwrap_or_default();
        if let Some(last) = msgs.last() {
            if let Some(id) = last.id {
                self.last_seen_id = id;
            }
        }
        Ok(msgs)
    }

    /// Remove mensagens antigas da sala (housekeeping).
    pub async fn cleanup(&self) {
        let cutoff = now_millis() - 10 * 60 * 1000;
        let _ = self
            .http
            .delete(self.url())
            .query(&[("room", self.room.as_str()), ("created_at", format!("lt.{cutoff}").as_str())])
            .send()
            .await;
    }

    pub fn apikey(&self) -> &str {
        &self.apikey
    }

    pub fn room(&self) -> &str {
        &self.room
    }
}

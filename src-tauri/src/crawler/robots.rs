use reqwest::Client;
use url::Url;

/// Simplified robots.txt rule set: only the `User-agent: *` group is honored.
/// Path matching is prefix-based, without wildcard/`$`-anchor support — this
/// covers the vast majority of real-world robots.txt files.
pub struct RobotsRules {
    disallow: Vec<String>,
    allow: Vec<String>,
}

impl RobotsRules {
    pub fn allow_all() -> Self {
        Self {
            disallow: Vec::new(),
            allow: Vec::new(),
        }
    }

    pub async fn fetch(client: &Client, origin: &Url) -> Self {
        let robots_url = match origin.join("/robots.txt") {
            Ok(u) => u,
            Err(_) => return Self::allow_all(),
        };

        let body = match client.get(robots_url).send().await {
            Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
            _ => return Self::allow_all(),
        };

        Self::parse(&body)
    }

    fn parse(body: &str) -> Self {
        let mut in_wildcard_group = false;
        let mut disallow = Vec::new();
        let mut allow = Vec::new();

        for raw_line in body.lines() {
            let line = raw_line.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim().to_string();

            match key.as_str() {
                "user-agent" => {
                    in_wildcard_group = value.trim() == "*";
                }
                "disallow" if in_wildcard_group && !value.is_empty() => disallow.push(value),
                "allow" if in_wildcard_group && !value.is_empty() => allow.push(value),
                _ => {}
            }
        }

        Self { disallow, allow }
    }

    /// Longest matching prefix wins; an Allow rule beats a Disallow rule of equal length.
    pub fn is_allowed(&self, path: &str) -> bool {
        let mut best_len: i64 = -1;
        let mut best_allowed = true;

        for rule in &self.disallow {
            if path.starts_with(rule.as_str()) && rule.len() as i64 > best_len {
                best_len = rule.len() as i64;
                best_allowed = false;
            }
        }
        for rule in &self.allow {
            if path.starts_with(rule.as_str()) && rule.len() as i64 > best_len {
                best_len = rule.len() as i64;
                best_allowed = true;
            }
        }

        best_allowed
    }
}

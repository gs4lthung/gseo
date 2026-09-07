use reqwest::Client;
use url::Url;

/// Simplified robots.txt rule set: only the `User-agent: *` group is honored.
/// Path matching is prefix-based, without wildcard/`$`-anchor support — this
/// covers the vast majority of real-world robots.txt files.
pub struct RobotsRules {
    disallow: Vec<String>,
    allow: Vec<String>,
    /// The `User-agent: *` group's `Crawl-delay`, in milliseconds, if the file specifies one.
    pub crawl_delay_ms: Option<u64>,
}

impl RobotsRules {
    pub fn allow_all() -> Self {
        Self {
            disallow: Vec::new(),
            allow: Vec::new(),
            crawl_delay_ms: None,
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
        let mut crawl_delay_ms = None;

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
                "crawl-delay" if in_wildcard_group => {
                    if let Ok(secs) = value.parse::<f64>() {
                        if secs.is_finite() && secs >= 0.0 {
                            crawl_delay_ms = Some((secs * 1000.0) as u64);
                        }
                    }
                }
                _ => {}
            }
        }

        Self { disallow, allow, crawl_delay_ms }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allow_all_has_no_rules_or_delay() {
        let rules = RobotsRules::allow_all();
        assert!(rules.is_allowed("/anything"));
        assert_eq!(rules.crawl_delay_ms, None);
    }

    #[test]
    fn disallow_blocks_matching_prefix() {
        let rules = RobotsRules::parse("User-agent: *\nDisallow: /admin\n");
        assert!(!rules.is_allowed("/admin"));
        assert!(!rules.is_allowed("/admin/settings"));
        assert!(rules.is_allowed("/blog"));
    }

    #[test]
    fn longer_allow_overrides_shorter_disallow() {
        let rules = RobotsRules::parse("User-agent: *\nDisallow: /private\nAllow: /private/public-page\n");
        assert!(!rules.is_allowed("/private/secret"));
        assert!(rules.is_allowed("/private/public-page"));
        assert!(rules.is_allowed("/private/public-page/sub"));
    }

    #[test]
    fn only_the_wildcard_user_agent_group_is_honored() {
        let rules = RobotsRules::parse("User-agent: Googlebot\nDisallow: /googlebot-only\n\nUser-agent: *\nDisallow: /everyone\n");
        assert!(rules.is_allowed("/googlebot-only"));
        assert!(!rules.is_allowed("/everyone"));
    }

    #[test]
    fn crawl_delay_is_parsed_as_milliseconds() {
        let rules = RobotsRules::parse("User-agent: *\nCrawl-delay: 2\n");
        assert_eq!(rules.crawl_delay_ms, Some(2000));
    }

    #[test]
    fn crawl_delay_supports_fractional_seconds() {
        let rules = RobotsRules::parse("User-agent: *\nCrawl-delay: 0.5\n");
        assert_eq!(rules.crawl_delay_ms, Some(500));
    }

    #[test]
    fn crawl_delay_outside_wildcard_group_is_ignored() {
        let rules = RobotsRules::parse("User-agent: Bingbot\nCrawl-delay: 10\n\nUser-agent: *\nDisallow: /x\n");
        assert_eq!(rules.crawl_delay_ms, None);
    }

    #[test]
    fn malformed_crawl_delay_is_ignored() {
        let rules = RobotsRules::parse("User-agent: *\nCrawl-delay: not-a-number\n");
        assert_eq!(rules.crawl_delay_ms, None);
    }

    #[test]
    fn comments_and_blank_lines_are_ignored() {
        let rules = RobotsRules::parse("# a comment\n\nUser-agent: *\n# another comment\nDisallow: /x # trailing comment\n");
        assert!(!rules.is_allowed("/x"));
        assert!(rules.is_allowed("/y"));
    }
}

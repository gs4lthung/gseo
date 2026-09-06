use reqwest::header::HeaderMap;

pub struct HeaderTech {
    pub server: Option<String>,
    pub powered_by: Option<String>,
    pub cdn: Option<String>,
}

pub fn detect_from_headers(headers: &HeaderMap) -> HeaderTech {
    let server = headers
        .get("server")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let powered_by = headers
        .get("x-powered-by")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let server_lower = server.as_deref().unwrap_or("").to_ascii_lowercase();
    let cdn = if headers.contains_key("cf-ray") || server_lower.contains("cloudflare") {
        Some("Cloudflare".to_string())
    } else if headers.contains_key("x-amz-cf-id") {
        Some("Amazon CloudFront".to_string())
    } else if headers
        .get("x-served-by")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_ascii_lowercase().contains("cache"))
        .unwrap_or(false)
    {
        Some("Fastly".to_string())
    } else if headers.contains_key("x-vercel-id") {
        Some("Vercel".to_string())
    } else if headers.contains_key("x-nf-request-id") {
        Some("Netlify".to_string())
    } else if headers.contains_key("x-akamai-request-id") || server_lower.contains("akamaighost") {
        Some("Akamai".to_string())
    } else {
        None
    };

    HeaderTech { server, powered_by, cdn }
}

/// Cheap substring-based fingerprinting of the raw homepage HTML. Not a full
/// Wappalyzer replacement, but catches the most common platforms/libraries
/// without needing a signature database.
pub fn detect_from_html(html: &str) -> (Option<String>, Vec<String>) {
    let lower = html.to_ascii_lowercase();
    let has = |needle: &str| lower.contains(needle);

    let cms = if has("wp-content") || has("wp-includes") {
        Some("WordPress")
    } else if has("/sites/default/files") || has("drupal.settings") {
        Some("Drupal")
    } else if has("joomla!") || has("/media/jui/") {
        Some("Joomla")
    } else if has("cdn.shopify.com") || has("shopify.theme") {
        Some("Shopify")
    } else if has("static.wixstatic.com") || has("wix.com") {
        Some("Wix")
    } else if has("squarespace") {
        Some("Squarespace")
    } else if has("cdn.webflow.com") {
        Some("Webflow")
    } else {
        None
    }
    .map(|s| s.to_string());

    let mut technologies = Vec::new();
    let mut push = |name: &str| technologies.push(name.to_string());

    if has("_next/static") || has("__next_data__") {
        push("Next.js");
    }
    if has("__nuxt__") {
        push("Nuxt.js");
    }
    if has("ng-version") {
        push("Angular");
    }
    if has("data-reactroot") || has("react-dom") {
        push("React");
    }
    if has("data-v-app") || has("vue.js") || has("__vue__") {
        push("Vue.js");
    }
    if has("jquery") {
        push("jQuery");
    }
    if has("bootstrap") {
        push("Bootstrap");
    }
    if has("tailwind") {
        push("Tailwind CSS");
    }
    if has("googletagmanager.com/gtm.js") {
        push("Google Tag Manager");
    }
    if has("google-analytics.com") || has("gtag(") {
        push("Google Analytics");
    }
    if has("cdn.jsdelivr.net") {
        push("jsDelivr CDN");
    }

    (cms, technologies)
}

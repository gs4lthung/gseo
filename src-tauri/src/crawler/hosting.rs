use reqwest::Client;
use serde::Deserialize;
use tokio::net::lookup_host;
use url::Url;

pub async fn resolve_ips(url: &Url) -> Vec<String> {
    let Some(host) = url.host_str() else {
        return Vec::new();
    };
    let port = url.port_or_known_default().unwrap_or(443);

    let addrs = match lookup_host((host, port)).await {
        Ok(iter) => iter,
        Err(_) => return Vec::new(),
    };

    let mut ips: Vec<String> = addrs.map(|addr| addr.ip().to_string()).collect();
    ips.sort();
    ips.dedup();
    ips
}

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    status: String,
    #[serde(default)]
    isp: Option<String>,
    #[serde(default)]
    org: Option<String>,
    #[serde(default)]
    #[serde(rename = "as")]
    asn: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

pub struct HostingOrgInfo {
    pub org: Option<String>,
    pub country: Option<String>,
}

/// Looks up the organization/ASN and country that own an IP via the free
/// ip-api.com endpoint. This sends the target site's public IP address to a
/// third-party service — only call this when the user has opted in.
pub async fn lookup_org(client: &Client, ip: &str) -> Option<HostingOrgInfo> {
    let api_url = format!("http://ip-api.com/json/{ip}?fields=status,message,country,isp,org,as");
    let resp = client.get(api_url).send().await.ok()?;
    let data: IpApiResponse = resp.json().await.ok()?;
    if data.status != "success" {
        return None;
    }
    let org = data.org.or(data.isp).or(data.asn);
    Some(HostingOrgInfo { org, country: data.country })
}

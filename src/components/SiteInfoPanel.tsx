import type { SiteInfo } from "../types";

interface SiteInfoPanelProps {
  siteInfo: SiteInfo;
}

export function SiteInfoPanel({ siteInfo }: SiteInfoPanelProps) {
  const chips: Array<{ label: string; value: string; tone?: "ok" | "warn" | "bad" }> = [];

  chips.push({
    label: "llms.txt",
    value: siteInfo.llmsTxtFound ? "Found" : "Not found",
    tone: siteInfo.llmsTxtFound ? "ok" : "warn",
  });
  if (siteInfo.cms) chips.push({ label: "CMS", value: siteInfo.cms });
  if (siteInfo.server) chips.push({ label: "Server", value: siteInfo.server });
  if (siteInfo.poweredBy) chips.push({ label: "Powered by", value: siteInfo.poweredBy });
  if (siteInfo.cdn) chips.push({ label: "CDN", value: siteInfo.cdn });
  if (siteInfo.technologies.length > 0) {
    chips.push({ label: "Tech", value: siteInfo.technologies.join(", ") });
  }
  if (siteInfo.ipAddresses.length > 0) {
    chips.push({ label: "IP", value: siteInfo.ipAddresses.join(", ") });
  }
  if (siteInfo.hostingOrg) {
    chips.push({
      label: "Hosting",
      value: siteInfo.hostingCountry ? `${siteInfo.hostingOrg} (${siteInfo.hostingCountry})` : siteInfo.hostingOrg,
    });
  }

  return (
    <div className="site-info-panel">
      {chips.map((c) => (
        <span key={c.label} className={`site-info-chip${c.tone ? ` site-info-${c.tone}` : ""}`}>
          <span className="site-info-label">{c.label}</span>
          <span className="site-info-value">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

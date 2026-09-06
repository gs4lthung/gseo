import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SiteInfo } from "../types";

interface SiteInfoPanelProps {
  siteInfo: SiteInfo;
}

const TONE_CLASSES: Record<"ok" | "warn" | "bad", string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  bad: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

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
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Badge
          key={c.label}
          variant="outline"
          className={cn("h-auto gap-1.5 py-1 font-normal", c.tone && TONE_CLASSES[c.tone])}
        >
          <span className="font-medium">{c.label}</span>
          <span className="max-w-[24rem] truncate">{c.value}</span>
        </Badge>
      ))}
    </div>
  );
}

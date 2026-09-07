import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CrawlConfig } from "@/types";

interface CrawlOptionsSheetProps {
  config: CrawlConfig;
  running: boolean;
  onChange: (config: CrawlConfig) => void;
}

export function CrawlOptionsSheet({ config, running, onChange }: CrawlOptionsSheetProps) {
  function set<K extends keyof CrawlConfig>(key: K, value: CrawlConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Crawl options">
          <Settings2 />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Crawl options</SheetTitle>
          <SheetDescription>Tuning applies to the next crawl you start.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max-pages">Max pages</Label>
              <Input
                id="max-pages"
                type="number"
                min={1}
                value={config.maxPages}
                disabled={running}
                onChange={(e) => set("maxPages", Number(e.target.value) || 1)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="max-depth">Max depth</Label>
              <Input
                id="max-depth"
                type="number"
                min={0}
                value={config.maxDepth}
                disabled={running}
                onChange={(e) => set("maxDepth", Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="concurrency">Concurrency</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={50}
                value={config.concurrency}
                disabled={running}
                onChange={(e) => set("concurrency", Number(e.target.value) || 1)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timeout">Timeout (s)</Label>
              <Input
                id="timeout"
                type="number"
                min={1}
                value={config.timeoutSecs}
                disabled={running}
                onChange={(e) => set("timeoutSecs", Number(e.target.value) || 1)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delay">Delay between requests (ms)</Label>
              <Input
                id="delay"
                type="number"
                min={0}
                value={config.delayMs}
                disabled={running}
                onChange={(e) => set("delayMs", Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Politeness pause before each new page request, on top of concurrency. If the site's robots.txt
            specifies a longer Crawl-delay, that value is used instead.
          </p>

          <Separator />

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={config.checkExternalLinks}
                disabled={running}
                onCheckedChange={(checked) => set("checkExternalLinks", checked === true)}
              />
              Check external links
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={config.checkImages}
                disabled={running}
                onCheckedChange={(checked) => set("checkImages", checked === true)}
              />
              Check images
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={config.respectRobots}
                disabled={running}
                onCheckedChange={(checked) => set("respectRobots", checked === true)}
              />
              Respect robots.txt
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={config.useSitemap}
                disabled={running}
                onCheckedChange={(checked) => set("useSitemap", checked === true)}
              />
              Seed from sitemap.xml
            </label>
          </div>

          <Separator />

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Render JavaScript</span>
                <span className="text-xs text-muted-foreground">
                  Renders each page with headless Chrome before parsing. Requires Chrome/Chromium; much slower per
                  page.
                </span>
              </div>
              <Switch
                checked={config.renderJs}
                disabled={running}
                onCheckedChange={(checked) =>
                  onChange({
                    ...config,
                    renderJs: checked,
                    runAccessibilityAudit: checked ? config.runAccessibilityAudit : false,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Accessibility audit</span>
                <span className="text-xs text-muted-foreground">
                  Runs axe-core on the rendered page. Requires Render JavaScript — enabling this turns it on
                  automatically.
                </span>
              </div>
              <Switch
                checked={config.runAccessibilityAudit}
                disabled={running}
                onCheckedChange={(checked) =>
                  onChange({
                    ...config,
                    runAccessibilityAudit: checked,
                    renderJs: checked ? true : config.renderJs,
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Look up hosting provider</span>
                <span className="text-xs text-muted-foreground">
                  Sends the site's resolved IP to the free ip-api.com service to identify the hosting provider/ASN.
                </span>
              </div>
              <Switch
                checked={config.lookupHosting}
                disabled={running}
                onCheckedChange={(checked) => set("lookupHosting", checked)}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-agent">User agent</Label>
            <Input
              id="user-agent"
              value={config.userAgent}
              disabled={running}
              onChange={(e) => set("userAgent", e.target.value)}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

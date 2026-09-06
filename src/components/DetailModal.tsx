import { openUrl } from "@tauri-apps/plugin-opener";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IssueSolution } from "../lib/issueSolutions";

interface DetailModalProps {
  title: string;
  fields: Array<{ label: string; value: string | number | boolean | null | undefined; isError?: boolean }>;
  issues?: IssueSolution[];
  onClose: () => void;
}

export function DetailModal({ title, fields, issues, onClose }: DetailModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex w-full max-w-2xl! flex-col gap-3 overflow-hidden sm:max-w-2xl!"
        style={{ maxHeight: "85vh" }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate pr-6" title={title}>
            {title}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea type="always" className="-mx-4 min-h-0 flex-1 px-4">
          <div className="flex flex-col gap-4 pb-1">
            {issues && issues.length > 0 && (
              <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Recommendations ({issues.length})
                </div>
                {issues.map((issue) => (
                  <div key={issue.title} className="flex flex-col gap-1 rounded-md bg-card p-3 ring-1 ring-foreground/10">
                    <div className="text-sm font-medium">{issue.title}</div>
                    <p className="text-sm text-muted-foreground">{issue.problem}</p>
                    <p className="text-sm">{issue.fix}</p>
                    <Button
                      variant="link"
                      className="h-auto justify-start self-start p-0 text-xs"
                      onClick={() => openUrl(issue.source.url)}
                    >
                      {issue.source.label} ↗
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {fields.map((f) => {
                const isEmpty = f.value === null || f.value === undefined || f.value === "";
                return (
                  <div key={f.label} className="flex flex-col gap-0.5 border-b py-1">
                    <div className="text-xs text-muted-foreground">{f.label}</div>
                    <div
                      className={cn(
                        "text-sm break-words",
                        f.isError && !isEmpty && "font-medium text-destructive",
                      )}
                    >
                      {isEmpty ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          —
                        </Badge>
                      ) : (
                        String(f.value)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

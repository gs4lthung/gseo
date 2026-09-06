import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CrawlActionsProps {
  running: boolean;
  paused: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function CrawlActions({ running, paused, canStart, onStart, onStop, onPause, onResume }: CrawlActionsProps) {
  if (!running) {
    return (
      <Button onClick={onStart} disabled={!canStart}>
        <Play className="fill-current" />
        Start Crawl
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {paused ? (
        <Button variant="outline" onClick={onResume}>
          <Play className="fill-current" />
          Resume
        </Button>
      ) : (
        <Button variant="outline" onClick={onPause}>
          <Pause className="fill-current" />
          Pause
        </Button>
      )}
      <Button variant="destructive" onClick={onStop}>
        <Square className="fill-current" />
        Stop
      </Button>
    </div>
  );
}

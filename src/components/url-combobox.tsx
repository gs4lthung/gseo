import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Globe, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { addUrlToHistory, clearUrlHistory, getUrlHistory, removeUrlFromHistory } from "@/lib/urlHistory";

interface UrlComboboxProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function UrlCombobox({ value, disabled, onChange, onSubmit }: UrlComboboxProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(getUrlHistory());
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(value), 150);
    return () => window.clearTimeout(handle);
  }, [value]);

  const filteredHistory = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = q ? history.filter((u) => u.toLowerCase().includes(q)) : history;
    return list.slice(0, 8);
  }, [history, debouncedQuery]);

  function selectHistoryUrl(url: string) {
    onChange(url);
    setOpen(false);
  }

  function handleRemove(e: MouseEvent, url: string) {
    e.stopPropagation();
    e.preventDefault();
    removeUrlFromHistory(url);
    setHistory((prev) => prev.filter((u) => u !== url));
  }

  function handleClear() {
    clearUrlHistory();
    setHistory([]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !disabled && value) {
      addUrlToHistory(value);
      setHistory(getUrlHistory());
      setOpen(false);
      onSubmit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && !disabled && filteredHistory.length > 0;

  return (
    <Popover open={showDropdown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={containerRef} className="relative w-full max-w-md">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            disabled={disabled}
            placeholder="https://example.com"
            className="pl-8"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-(--radix-popover-anchor-width) p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // The input is a PopoverAnchor, not a PopoverTrigger, so Radix's
          // dismissable-layer doesn't know clicks/focus on it are "inside" —
          // without this it treats the very click that opens the dropdown as
          // an outside interaction and closes it in the same tick.
          if (containerRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>No matching URLs.</CommandEmpty>
            <CommandGroup heading="Recent crawls">
              {filteredHistory.map((u) => (
                <CommandItem
                  key={u}
                  value={u}
                  onSelect={() => selectHistoryUrl(u)}
                  className="group/item justify-between"
                >
                  <span className="truncate">{u}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${u} from history`}
                    className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/item:opacity-100"
                    onClick={(e) => handleRemove(e, u)}
                  >
                    <X className="size-3.5" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {history.length > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-muted-foreground"
                onClick={handleClear}
              >
                Clear history
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

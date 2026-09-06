const STORAGE_KEY = "gseo:urlHistory";
const MAX_ENTRIES = 50;

export function getUrlHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export function addUrlToHistory(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;
  try {
    const current = getUrlHistory().filter((u) => u !== trimmed);
    const next = [trimmed, ...current].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, disabled storage, etc.) — history
    // just won't persist for this session, which is an acceptable degradation.
  }
}

export function removeUrlFromHistory(url: string): void {
  try {
    const next = getUrlHistory().filter((u) => u !== url);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearUrlHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

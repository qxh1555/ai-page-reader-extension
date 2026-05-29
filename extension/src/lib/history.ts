import type { PageContext, ChatMessage } from "./pageTypes";

export interface HistoryEntry {
  url: string;
  title: string;
  pageContext: PageContext;
  messages: ChatMessage[];
  updatedAt: number;
}

const HISTORY_KEY = "aiPageReader_history";
const MAX_ENTRIES = 50;

function normalizeUrl(url: string): string {
  // Strip trailing slashes and hash for consistent keys
  return url.replace(/#.*$/, "").replace(/\/+$/, "");
}

export async function loadAllHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const map = (result[HISTORY_KEY] || {}) as Record<string, HistoryEntry>;
  return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadHistory(url: string): Promise<HistoryEntry | null> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const map = (result[HISTORY_KEY] || {}) as Record<string, HistoryEntry>;
  return map[normalizeUrl(url)] || null;
}

export async function saveHistory(entry: HistoryEntry): Promise<void> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const map = (result[HISTORY_KEY] || {}) as Record<string, HistoryEntry>;

  const key = normalizeUrl(entry.url);
  map[key] = { ...entry, updatedAt: Date.now() };

  // Prune oldest entries if over limit
  const entries = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
  if (entries.length > MAX_ENTRIES) {
    for (const old of entries.slice(MAX_ENTRIES)) {
      delete map[normalizeUrl(old.url)];
    }
  }

  await chrome.storage.local.set({ [HISTORY_KEY]: map });
}

export async function deleteHistory(url: string): Promise<void> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  const map = (result[HISTORY_KEY] || {}) as Record<string, HistoryEntry>;
  delete map[normalizeUrl(url)];
  await chrome.storage.local.set({ [HISTORY_KEY]: map });
}

export async function clearAllHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY);
}

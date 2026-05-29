import { marked } from "marked";

// Configure marked for safe, clean output
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Simple renderer: parse markdown → sanitized HTML
export function renderMarkdown(text: string): string {
  if (!text) return "";
  try {
    return marked.parse(text) as string;
  } catch {
    return text;
  }
}

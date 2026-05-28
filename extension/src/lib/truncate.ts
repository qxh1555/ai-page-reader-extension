export function truncateMarkdown(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown;
  const truncated = markdown.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > maxChars * 0.8) {
    return truncated.slice(0, lastNewline) + "\n\n[Content truncated...]";
  }
  return truncated + "\n\n[Content truncated...]";
}

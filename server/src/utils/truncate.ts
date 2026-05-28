export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf("\n");
  if (lastNewline > maxChars * 0.8) {
    return truncated.slice(0, lastNewline) + "\n\n[Content truncated...]";
  }
  return truncated + "\n\n[Content truncated...]";
}

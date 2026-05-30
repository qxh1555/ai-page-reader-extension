export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}

const PROMPTS_KEY = "aiPageReader_prompts";

const DEFAULT_PROMPTS: SavedPrompt[] = [
  {
    id: "default-read",
    title: "Read & Summarize",
    content:
      "Please read through the content of this webpage carefully. First summarize the main topics and key points, then I will ask follow-up questions about specific details.",
  },
  {
    id: "default-explain",
    title: "Explain Concepts",
    content:
      "Please explain the key concepts and terminology used on this page in simple terms. Help me understand the core ideas even if I'm not familiar with the domain.",
  },
];

export async function loadPrompts(): Promise<SavedPrompt[]> {
  const result = await chrome.storage.local.get(PROMPTS_KEY);
  const stored = result[PROMPTS_KEY] as SavedPrompt[] | undefined;
  if (!stored || stored.length === 0) {
    // Initialize with defaults
    await chrome.storage.local.set({ [PROMPTS_KEY]: DEFAULT_PROMPTS });
    return [...DEFAULT_PROMPTS];
  }
  return stored;
}

export async function savePrompts(prompts: SavedPrompt[]): Promise<void> {
  await chrome.storage.local.set({ [PROMPTS_KEY]: prompts });
}

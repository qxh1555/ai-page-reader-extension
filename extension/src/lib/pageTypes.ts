/// <reference types="chrome" />

export interface PageContext {
  title: string;
  url: string;
  excerpt: string;
  byline: string;
  markdown: string;
  plainText: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  pageContext: PageContext | null;
  messages: ChatMessage[];
  question: string;
}

export interface ChatResponse {
  answer: string;
  error?: string;
}

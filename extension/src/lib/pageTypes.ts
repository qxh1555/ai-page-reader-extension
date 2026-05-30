/// <reference types="chrome" />

export interface ImageInfo {
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface EncodedImage {
  url: string;
  alt: string;
  base64: string;
  mediaType: string;
}

export interface PageContext {
  title: string;
  url: string;
  excerpt: string;
  byline: string;
  markdown: string;
  plainText: string;
  images: ImageInfo[];
  encodedImages: EncodedImage[];
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

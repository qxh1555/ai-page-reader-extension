import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { PageContext, ImageInfo, EncodedImage } from "./pageTypes";

export interface RawExtract {
  html: string;
  url: string;
  title: string;
  bodyText: string;
  mainText: string;
  images: ImageInfo[];
  encodedImages: EncodedImage[];
}

export type ExtractMode = "auto" | "readability" | "fullpage" | "plaintext";

function makeTurndown(): TurndownService {
  return new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
}

export function processRawExtract(raw: RawExtract, mode: ExtractMode): PageContext {
  const mkCtx = (title: string, md: string, text: string, ex?: string, bl?: string): PageContext => ({
    title, url: raw.url, excerpt: ex || "", byline: bl || "",
    markdown: md, plainText: text,
    images: raw.images,
    encodedImages: raw.encodedImages,
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw.html, "text/html");

  switch (mode) {
    // ── Readability only ──────────────────────────────────
    case "readability": {
      const article = new Readability(doc.cloneNode(true) as Document).parse();
      if (article) {
        const td = makeTurndown();
        return mkCtx(
          article.title || raw.title,
          td.turndown(article.content || ""),
          article.textContent || "",
          article.excerpt || "",
          article.byline || ""
        );
      }
      // Fall through to fullpage
      return processRawExtract(raw, "fullpage");
    }

    // ── Full page (de-noise + Markdown) ───────────────────
    case "fullpage": {
      const td = makeTurndown();
      const md = td.turndown(doc.body.innerHTML);
      return mkCtx(raw.title, md, doc.body.textContent || "");
    }

    // ── Plain text (live DOM direct extract) ──────────────
    case "plaintext": {
      const text = raw.mainText || raw.bodyText || "";
      return mkCtx(raw.title, text, text);
    }

    // ── Auto (smart) ──────────────────────────────────────
    case "auto":
    default: {
      // Try Readability first
      const article = new Readability(doc.cloneNode(true) as Document).parse();
      if (article && (article.textContent?.length || 0) >= 500) {
        const td = makeTurndown();
        return mkCtx(
          article.title || raw.title,
          td.turndown(article.content || ""),
          article.textContent || "",
          article.excerpt || "",
          article.byline || ""
        );
      }
      // Readability gave too little → fall back to fullpage
      return processRawExtract(raw, "fullpage");
    }
  }
}

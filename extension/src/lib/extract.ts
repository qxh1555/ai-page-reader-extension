import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { PageContext, ImageInfo } from "./pageTypes";

export interface RawExtract {
  html: string;
  url: string;
  images: ImageInfo[];
}

export function processRawExtract(raw: RawExtract): PageContext {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw.html, "text/html");
  const reader = new Readability(doc);
  const article = reader.parse();

  if (article) {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    const markdown = td.turndown(article.content || "");
    const plainText = article.textContent || "";

    return {
      title: article.title || doc.title,
      url: raw.url,
      excerpt: article.excerpt || "",
      byline: article.byline || "",
      markdown,
      plainText,
      images: raw.images,
    };
  }

  // Fallback: use full body text
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  const markdown = td.turndown(doc.body.innerHTML);
  const plainText = doc.body.innerText || "";

  return {
    title: doc.title,
    url: raw.url,
    excerpt: plainText.slice(0, 300).trim(),
    byline: "",
    markdown,
    plainText,
    images: raw.images,
  };
}

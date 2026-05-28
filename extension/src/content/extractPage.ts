import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

interface ImageInfo {
  url: string;
  alt: string;
  width: number;
  height: number;
}

const MAX_IMAGES = 20;

function extractImages(): ImageInfo[] {
  const images: ImageInfo[] = [];
  const seen = new Set<string>();

  for (const img of document.querySelectorAll("img")) {
    if (images.length >= MAX_IMAGES) break;

    const src = img.src || img.getAttribute("data-src") || "";
    if (
      !src ||
      src.startsWith("data:") ||
      seen.has(src) ||
      src.includes("avatar") ||
      src.includes("icon")
    )
      continue;

    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;

    // Skip tiny images (likely tracking pixels, icons, spacers)
    if ((w > 0 && w < 80) || (h > 0 && h < 80)) continue;

    seen.add(src);
    images.push({
      url: src,
      alt: img.alt || "",
      width: w,
      height: h,
    });
  }
  return images;
}

(function () {
  try {
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone);
    const article = reader.parse();

    let result: {
      title: string;
      url: string;
      excerpt: string;
      byline: string;
      markdown: string;
      plainText: string;
      images: ImageInfo[];
    };

    if (article) {
      const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      const markdown = td.turndown(article.content || "");
      const plainText = article.textContent || "";

      result = {
        title: article.title || document.title,
        url: window.location.href,
        excerpt: article.excerpt || "",
        byline: article.byline || "",
        markdown,
        plainText,
        images: extractImages(),
      };
    } else {
      const bodyText = document.body.innerText || "";
      const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });
      const markdown = td.turndown(document.body.innerHTML);

      result = {
        title: document.title,
        url: window.location.href,
        excerpt: bodyText.slice(0, 300).trim(),
        byline: "",
        markdown,
        plainText: bodyText,
        images: extractImages(),
      };
    }

    return result;
  } catch (err) {
    return {
      title: document.title,
      url: window.location.href,
      excerpt: "",
      byline: "",
      markdown: document.body.innerText || "",
      plainText: document.body.innerText || "",
      images: [],
    };
  }
})();

import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

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
      };
    } else {
      // Fallback to innerText
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
      };
    }

    return result;
  } catch (err) {
    // Last-resort fallback
    return {
      title: document.title,
      url: window.location.href,
      excerpt: "",
      byline: "",
      markdown: document.body.innerText || "",
      plainText: document.body.innerText || "",
    };
  }
})();

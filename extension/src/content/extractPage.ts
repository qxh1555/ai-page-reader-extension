// Content script — collects DOM, encodes images via canvas, and extracts text.
// Canvas-based encoding: no CORS issues for same-origin images,
// works instantly from browser cache without re-fetching.

(function () {
  // ── Collect & encode images ──────────────────────────────────
  interface ImageRef { url: string; alt: string; width: number; height: number; }
  interface EncodedImg { url: string; alt: string; base64: string; mediaType: string; }

  const imageRefs: ImageRef[] = [];
  const encodedImgs: EncodedImg[] = [];
  const seen = new Set<string>();
  const imgs = document.querySelectorAll("img");
  const MAX_COUNT = 5;

  for (const img of imgs) {
    if (imageRefs.length >= 20) break;
    const src = img.src || img.getAttribute("data-src") || "";
    if (!src || src.startsWith("data:") || seen.has(src)) continue;
    if (src.includes("avatar") || src.includes("icon")) continue;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((w > 0 && w < 80) || (h > 0 && h < 80)) continue;
    seen.add(src);
    imageRefs.push({ url: src, alt: img.alt || "", width: w, height: h });

    // Try canvas-based encoding for first MAX_COUNT images
    if (encodedImgs.length < MAX_COUNT) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        if (base64 && base64.length > 10) {
          encodedImgs.push({ url: src, alt: img.alt || "", base64, mediaType: "image/png" });
        }
      } catch {
        // Canvas tainted (cross-origin without CORS) — skip
      }
    }
  }

  // ── Direct text extraction ──────────────────────────────────
  const bodyClone = document.body.cloneNode(true) as HTMLElement;
  const noise = bodyClone.querySelectorAll(
    "nav, header, footer, aside, script, style, noscript, iframe, " +
    ".nav, .navbar, .header, .footer, .sidebar, .menu, .navigation, .breadcrumb"
  );
  noise.forEach((el) => el.remove());
  const bodyText = bodyClone.innerText || document.body.innerText || "";

  // ── Main content area ────────────────────────────────────────
  let mainHTML = "";
  let mainText = "";
  const contentSelectors = [
    ".forum-container", "main", ".note-content",
    ".forum-note", '[class*="note-content"]',
    "article", '[role="main"]',
    ".post-content", ".article-content", ".entry-content",
    "#content", ".content", ".markdown-body",
  ];
  for (const sel of contentSelectors) {
    const el = document.querySelector(sel);
    if (el && (el.textContent?.length || 0) > 200) {
      mainHTML = (el as HTMLElement).outerHTML;
      mainText = el.textContent || "";
      break;
    }
  }

  return {
    url: window.location.href,
    title: document.title,
    html: mainHTML || document.documentElement.outerHTML,
    bodyText: bodyText,
    mainText: mainText,
    images: imageRefs,
    encodedImages: encodedImgs,
  };
})();

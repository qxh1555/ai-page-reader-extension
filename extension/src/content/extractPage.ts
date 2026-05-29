// Minimal content script — collects DOM, images, and direct text extraction.
// All heavy processing (Readability + Turndown) happens in the side panel.

(function () {
  // ── Images ──────────────────────────────────────────────────
  const images: { url: string; alt: string; width: number; height: number }[] = [];
  const seen = new Set<string>();
  const imgs = document.querySelectorAll("img");

  for (const img of imgs) {
    if (images.length >= 20) break;
    const src = img.src || img.getAttribute("data-src") || "";
    if (!src || src.startsWith("data:") || seen.has(src)) continue;
    if (src.includes("avatar") || src.includes("icon")) continue;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((w > 0 && w < 80) || (h > 0 && h < 80)) continue;
    seen.add(src);
    images.push({ url: src, alt: img.alt || "", width: w, height: h });
  }

  // ── Direct text extraction (guaranteed fallback) ─────────────
  const bodyClone = document.body.cloneNode(true) as HTMLElement;
  const noise = bodyClone.querySelectorAll(
    "nav, header, footer, aside, script, style, noscript, iframe, " +
    ".nav, .navbar, .header, .footer, .sidebar, .menu, .navigation, .breadcrumb"
  );
  noise.forEach((el) => el.remove());
  const bodyText = bodyClone.innerText || document.body.innerText || "";

  // ── Try extracting from main content areas ──────────────────
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
    // Full HTML for Readability attempt
    html: mainHTML || document.documentElement.outerHTML,
    // Direct text from live DOM (guaranteed to work)
    bodyText: bodyText,
    // Pre-extracted text from content area
    mainText: mainText,
    images,
  };
})();

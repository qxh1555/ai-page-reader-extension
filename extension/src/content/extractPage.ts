// Minimal content script — only collects raw DOM and image URLs.
// Heavy processing (Readability + Turndown) is done in the side panel
// to avoid bundle conflicts from repeated injection.

(function () {
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

  return {
    html: document.documentElement.outerHTML,
    url: window.location.href,
    images,
  };
})();

import type { PageContext } from "./pageTypes";

export async function extractPageContext(): Promise<PageContext> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chromewebstore.google.com/")
  ) {
    throw new Error(
      "Cannot extract content from this page type (chrome://, edge://, about:, Chrome Web Store, etc.)"
    );
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["extractPage.js"],
  });

  if (results?.[0]?.result) {
    return results[0].result as PageContext;
  }

  const errorMsg =
    chrome.runtime.lastError?.message || "Failed to extract page content";
  throw new Error(errorMsg);
}

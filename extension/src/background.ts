chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error("Failed to open side panel:", err);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_PAGE") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tab = tabs[0];
        if (!tab?.id) {
          sendResponse({ error: "No active tab found" });
          return;
        }

        const url = tab.url || "";
        if (
          url.startsWith("chrome://") ||
          url.startsWith("edge://") ||
          url.startsWith("about:") ||
          url.startsWith("chrome-extension://") ||
          url.startsWith("https://chromewebstore.google.com/")
        ) {
          sendResponse({
            error:
              "Cannot extract content from this page type (chrome://, edge://, about:, Chrome Web Store, etc.)",
          });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["extractPage.js"],
        });

        if (results && results[0]?.result) {
          sendResponse({ data: results[0].result });
        } else {
          sendResponse({ error: "Failed to extract page content" });
        }
      } catch (err) {
        sendResponse({
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    })();
    return true; // keep sendResponse alive for async
  }
});

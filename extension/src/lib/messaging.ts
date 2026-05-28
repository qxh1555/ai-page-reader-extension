import type { PageContext } from "./pageTypes";

export async function extractPageContext(): Promise<PageContext> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "EXTRACT_PAGE" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      if (response?.data) {
        resolve(response.data as PageContext);
      } else {
        reject(new Error("Failed to extract page content"));
      }
    });
  });
}

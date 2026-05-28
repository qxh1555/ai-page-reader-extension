chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error("Failed to open side panel:", err);
  });
});

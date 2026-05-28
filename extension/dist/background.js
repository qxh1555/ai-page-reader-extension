chrome.action.onClicked.addListener(e=>{e.id&&chrome.sidePanel.open({tabId:e.id}).catch(o=>{console.error("Failed to open side panel:",o)})});

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('index.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length > 0 && existing[0].id != null) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId != null) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
});

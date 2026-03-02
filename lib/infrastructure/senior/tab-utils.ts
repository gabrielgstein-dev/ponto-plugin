export async function findSeniorTab(): Promise<chrome.tabs.Tab | null> {
  const allTabs = await chrome.tabs.query({});
  return allTabs.find(t => t.url?.includes('senior.com.br')) ?? null;
}

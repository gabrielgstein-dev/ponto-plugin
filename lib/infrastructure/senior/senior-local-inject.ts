import { findSeniorTab } from './tab-utils';

export async function injectPunchIntoLocalStorage(time: string): Promise<boolean> {
  const tab = await findSeniorTab();
  if (!tab?.id) return false;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [time],
      func: (punchTime: string) => {
        try {
          const raw = localStorage.getItem('clockingEventsStorage');
          const data = raw ? JSON.parse(raw) : {};
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

          for (const key of Object.keys(data)) {
            const employee = data[key];
            if (!employee.clockingEventImported) employee.clockingEventImported = [];
            employee.clockingEventImported.push({ dateEvent: dateStr, timeEvent: `${punchTime}:00.000` });
          }

          localStorage.setItem('clockingEventsStorage', JSON.stringify(data));
          return true;
        } catch (_) { return false; }
      },
    });

    return results?.[0]?.result ?? false;
  } catch (_) { return false; }
}

import { padZero } from '../../domain/time-utils';

export async function seedMockPunches(): Promise<void> {
  const mock: Record<string, string[]> = {};
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
    const entH = 8 + Math.floor(Math.random() * 2);
    const entM = Math.floor(Math.random() * 30);
    const almH = 12 + Math.floor(Math.random() * 1);
    const almM = Math.floor(Math.random() * 30);
    const volH = almH + 1;
    const volM = Math.floor(Math.random() * 15);
    const saiH = 17 + Math.floor(Math.random() * 2);
    const saiM = Math.floor(Math.random() * 45);
    mock[key] = [
      `${padZero(entH)}:${padZero(entM)}`,
      `${padZero(almH)}:${padZero(almM)}`,
      `${padZero(volH)}:${padZero(volM)}`,
      `${padZero(saiH)}:${padZero(saiM)}`,
    ];
  }
  const data = await chrome.storage.local.get(['manualPunches']);
  const existing = data.manualPunches || {};
  await chrome.storage.local.set({ manualPunches: { ...existing, ...mock } });
}

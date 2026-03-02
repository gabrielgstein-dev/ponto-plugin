const TIME_KEYS = ['hora', 'time', 'marcac', 'clocking', 'batida', 'entrada', 'saida', 'almoco'];
const TIME_PATTERN = /^([0-1]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function extractTimesFromApiResponse(json: unknown): string[] {
  const times: string[] = [];
  walk(json, times);
  return [...new Set(times)].sort();
}

function walk(obj: unknown, times: string[]): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => walk(item, times)); return; }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const kl = key.toLowerCase();
    const isTimeKey = TIME_KEYS.some(k => kl.includes(k));

    if (isTimeKey && typeof val === 'string') {
      addIfValidTime(val, times);
    } else if (!isTimeKey && typeof val === 'string' && TIME_PATTERN.test(val.trim())) {
      addIfValidTime(val, times);
    }

    if (typeof val === 'object') walk(val, times);
  }
}

function addIfValidTime(val: string, times: string[]): void {
  const m = val.match(/([0-1]?\d|2[0-3]):([0-5]\d)/);
  if (!m) return;
  const h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (h >= 5 && h <= 22) {
    times.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
}

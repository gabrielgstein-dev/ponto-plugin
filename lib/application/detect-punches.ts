import type { IPunchProvider, IPunchDetector } from '../domain/interfaces';
import type { PunchDetectionResult } from '../domain/types';

export class PunchDetector implements IPunchDetector {
  private providers: IPunchProvider[];

  constructor(providers: IPunchProvider[]) {
    this.providers = [...providers].sort((a, b) => a.priority - b.priority);
  }

  async detect(date: Date, aggressive = false): Promise<PunchDetectionResult | null> {
    const merged = new Set<string>();
    let bestSource = '';

    for (const provider of this.providers) {
      try {
        const times = await provider.fetchPunches(date, aggressive);
        if (times.length > 0) {
          console.log(`[Senior Ponto] ${provider.name}: ${times.length} batimento(s) →`, times.join(', '));
          for (const t of times) merged.add(t);
          if (!bestSource) bestSource = provider.name;
        } else if (aggressive) {
          console.log(`[Senior Ponto] ${provider.name}: sem resultados`);
        }
      } catch (e) {
        if (aggressive) {
          console.warn(`[Senior Ponto] ${provider.name} falhou:`, (e as Error).message);
        }
      }
    }

    if (merged.size === 0) return null;
    return { times: [...merged].sort(), source: bestSource };
  }
}

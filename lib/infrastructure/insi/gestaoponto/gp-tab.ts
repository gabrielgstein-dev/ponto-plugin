import { getOrCreateGpTab, safeCloseTab } from './gp-tab-utils';
import { waitForGpSession } from './gp-tab-session';
import { executeGpFetch } from './gp-tab-fetch';
import { debugLog, debugWarn } from '../../../domain/debug';

export async function fetchGpViaTabs(allowCreate = false): Promise<string[]> {
  const tabInfo = await getOrCreateGpTab(allowCreate);
  if (!tabInfo) {
    debugLog('GP viaTabs: sem aba GP disponível (allowCreate:', allowCreate, ')');
    return [];
  }

  const { tab, created } = tabInfo;
  debugLog('GP viaTabs: aba encontrada (id:', tab.id, 'created:', created, ')');
  try {
    const waitTime = created ? 45000 : 15000;
    const ready = await waitForGpSession(tab.id!, waitTime);
    if (!ready) {
      debugWarn('GP viaTabs: sessão não disponível após', waitTime, 'ms');
      if (created) safeCloseTab(tab.id!);
      return [];
    }

    const result = await executeGpFetch(tab.id!);
    if (created) safeCloseTab(tab.id!);

    if (result?.logs) {
      result.logs.forEach(l => debugLog('GP tab:', l));
    }
    if (result?.error) {
      debugWarn('GP viaTabs erro interno:', result.error);
    }

    if (result?.colaboradorId) {
      const save: Record<string, unknown> = { gestaoPontoColaboradorId: result.colaboradorId };
      if (result.codigoCalculo) save.gestaoPontoCodigoCalculo = result.codigoCalculo;
      chrome.storage.local.set(save);
    }

    debugLog('GP viaTabs resultado:', result?.times?.length ?? 0, 'marcações');
    return result?.times ?? [];
  } catch (e) {
    debugWarn('GP viaTabs erro:', (e as Error).message);
    if (created) safeCloseTab(tab.id!);
    return [];
  }
}

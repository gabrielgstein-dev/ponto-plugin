/**
 * Inicialização DEFENSIVA do storage no `chrome.runtime.onInstalled`.
 *
 * Bug histórico: o handler antigo usava `if (!result.pontoState)` pra decidir
 * se inicializava o storage. Esse check é true tanto pra `undefined` (primeira
 * instalação) quanto pra `null` (estado normal após `dailyReset` à meia-noite).
 * Em qualquer atualização do plugin (ou do Chrome) após a virada do dia,
 * `pontoSettings` era reescrito como null — user perdia jornada, horários,
 * som customizado, etc.
 *
 * Esta função só inicializa keys que NUNCA foram definidas (`=== undefined`).
 * Idempotente: rodar N vezes seguidas é equivalente a rodar 1 vez.
 *
 * Exportada pra que o handler de produção (background.ts) e os testes usem o
 * MESMO código — evitando divergência entre réplica de teste e implementação.
 */
export async function initializeStorageIfNeeded(): Promise<void> {
  const result = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
  const updates: Record<string, unknown> = {};
  if (result.pontoState === undefined) updates.pontoState = null;
  if (result.pontoSettings === undefined) updates.pontoSettings = null;
  if (result.pontoDate === undefined) updates.pontoDate = new Date().toDateString();
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

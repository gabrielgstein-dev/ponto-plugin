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

/**
 * Migração de storage do rebrand Meta X → Insi X (0.13.0).
 *
 * O rename renomeou as chaves persistidas do feature. Para a base já
 * instalada, copia os valores antigos (`metaX*`) para os novos (`insiX*`)
 * ANTES de qualquer leitura no formato novo — senão o user perderia a
 * preferência do lembrete e o "respondido essa semana".
 *
 * Só migra quando a chave NOVA ainda não existe: idempotente e sem
 * sobrescrever dados já no formato novo (rodar N vezes = rodar 1 vez).
 *
 * Migra apenas dado real do usuário:
 *   - `metaXState`                  → `insiXState`                  (respondido essa semana)
 *   - `pontoSettings.metaXReminder` → `pontoSettings.insiXReminder` (preferência on/off)
 *
 * Chaves efêmeras de runtime (`metaXPopupWindowId`, `metaXPopupContext`,
 * `metaXGateSaidaExpectedTime`) são descartáveis entre sessões — não migra,
 * apenas remove se sobraram. Alarmes antigos (`meta_x_*`) são limpos pra não
 * ficarem disparando sem handler correspondente.
 */
export async function migrateInsiXStorageKeys(): Promise<void> {
  const EPHEMERAL = ['metaXPopupWindowId', 'metaXPopupContext', 'metaXGateSaidaExpectedTime'] as const;
  const data = await chrome.storage.local.get(['metaXState', 'insiXState', 'pontoSettings', ...EPHEMERAL]);

  const updates: Record<string, unknown> = {};
  const removals: string[] = [];

  // 1. metaXState → insiXState (preserva o novo se já existir)
  if (data.metaXState !== undefined) {
    if (data.insiXState === undefined) updates.insiXState = data.metaXState;
    removals.push('metaXState');
  }

  // 2. pontoSettings.metaXReminder → pontoSettings.insiXReminder
  const settings = data.pontoSettings;
  if (settings && typeof settings === 'object' && 'metaXReminder' in settings) {
    const s = settings as Record<string, unknown>;
    if (s.insiXReminder === undefined) s.insiXReminder = s.metaXReminder;
    delete s.metaXReminder;
    updates.pontoSettings = s;
  }

  // 3. Chaves efêmeras remanescentes — só descarta
  for (const k of EPHEMERAL) {
    if (data[k] !== undefined) removals.push(k);
  }

  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
  if (removals.length > 0) await chrome.storage.local.remove(removals);

  // 4. Alarmes antigos do feature — limpa os órfãos (nomes mudaram meta_x_* → insi_x_*)
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await chrome.alarms.clear('meta_x_snooze');
    await chrome.alarms.clear('meta_x_notify');
  }
}

/**
 * Migração de hosts (0.15.0): `gestaoponto.meta.com.br` → `gestaoponto.insi.com`,
 * `plataforma.meta.com.br` → `plataforma.insi.com`, `api.meta.com.br` → `api.insi.com`. Ver docs/roadmaps/roadmap-migracao-gp-insi.md.
 *
 * Adicionar host em `host_permissions` faz o Chrome desabilitar a extensão no
 * update até o usuário aceitar. Normalmente, ao reabilitar, a permissão já
 * vem concedida — mas o usuário pode ter clicado sem ler, ou o Chrome pode
 * ter mantido a extensão sem o host. Este módulo garante que o popup mostre
 * UM aviso claro com botão "Ativar" (`permissions.request`) e, assim que a
 * permissão existir, limpe caches do host antigo e force uma sync — sem o
 * usuário precisar "reconectar" nada.
 */

export const GP_HOST_ORIGIN_PATTERN = '*://gestaoponto.insi.com/*';
/** Todos os hosts novos da 0.15.0 (GP + plataforma/API do Timesheet). Um único prompt. */
export const NEW_HOST_ORIGIN_PATTERNS = [GP_HOST_ORIGIN_PATTERN, '*://plataforma.insi.com/*', '*://api.insi.com/*'];
export const PENDING_GP_HOST_MIGRATION_KEY = 'pendingGpHostMigration';
/** Primeira versão que fala com o host novo. Updates vindos de antes disso precisam da migração. */
export const GP_HOST_MIGRATION_VERSION = '0.15.0';

// Caches emitidos/derivados do host antigo — descartáveis; o próximo auth/g7
// no host novo recria tudo.
const STALE_GP_KEYS = ['gpAssertion', 'gpAssertionTs', 'gpUnreachableTs', 'gpUnreachableUrl', 'metaTsToken', 'metaTsTokenTs', 'tsAutoConnectTs'];

export function isVersionBefore(version: string | undefined, target: string): boolean {
  if (!version) return true; // desconhecida → assume antiga (seguro: só mostra um banner a mais)
  const a = version.split('.').map(n => parseInt(n, 10) || 0);
  const b = target.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** Handler do `runtime.onInstalled`. Idempotente. */
export async function markGpHostMigrationOnUpdate(details: { reason: string; previousVersion?: string }): Promise<void> {
  if (details.reason !== 'update') return;
  if (!isVersionBefore(details.previousVersion, GP_HOST_MIGRATION_VERSION)) return;
  await chrome.storage.local.set({ [PENDING_GP_HOST_MIGRATION_KEY]: true });
  await chrome.storage.local.remove(STALE_GP_KEYS);
}

export async function hasGpHostPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: NEW_HOST_ORIGIN_PATTERNS });
  } catch {
    // API indisponível (contexto de teste / build antigo): não bloqueia o usuário.
    return true;
  }
}

export type GpHostMigrationState = 'none' | 'pending';

/**
 * Chamado quando o popup abre. Se a migração está pendente mas o Chrome já
 * concedeu o host (caso comum: usuário aceitou no aviso do próprio Chrome),
 * resolve em silêncio e dispara uma sync. Só devolve 'pending' quando o
 * banner é realmente necessário.
 */
export async function resolveGpHostMigration(): Promise<GpHostMigrationState> {
  const data = await chrome.storage.local.get([PENDING_GP_HOST_MIGRATION_KEY]);
  if (!data[PENDING_GP_HOST_MIGRATION_KEY]) return 'none';
  if (await hasGpHostPermission()) {
    await finishGpHostMigration();
    return 'none';
  }
  return 'pending';
}

/** Clique em "Ativar". Precisa rodar dentro de um gesto do usuário. */
export async function requestGpHostPermission(): Promise<boolean> {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: NEW_HOST_ORIGIN_PATTERNS });
  } catch {
    granted = false;
  }
  if (granted) await finishGpHostMigration();
  return granted;
}

async function finishGpHostMigration(): Promise<void> {
  await chrome.storage.local.remove([PENDING_GP_HOST_MIGRATION_KEY, ...STALE_GP_KEYS]);
  // Sync imediata: o usuário vê as marcações voltando na hora, sem abrir aba.
  try { await chrome.runtime.sendMessage({ type: 'FORCE_REDETECT' }); } catch { /* SW dormindo — próximo alarm resolve */ }
}

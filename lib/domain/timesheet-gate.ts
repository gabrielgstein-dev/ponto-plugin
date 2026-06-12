import { ENABLE_META_TIMESHEET } from './build-flags';

/**
 * Gate único de timesheet — combina build-flag com perfil do usuário.
 *
 * Usado tanto na UI (popup/sidepanel) quanto no background (alarms,
 * webRequest, sync). Mantém uma fonte só de verdade pra "este usuário
 * tem timesheet?".
 *
 * Default = true quando o user ainda não respondeu o onboarding —
 * preserva o comportamento atual pra quem já tem o plugin instalado
 * e vai ver o overlay pela primeira vez na próxima abertura.
 */
export async function isTimesheetEnabled(): Promise<boolean> {
  if (!ENABLE_META_TIMESHEET) return false;
  const data = await chrome.storage.local.get('userProfile');
  const profile = data.userProfile as { hasTimesheet?: boolean | null } | undefined;
  return profile?.hasTimesheet !== false;
}

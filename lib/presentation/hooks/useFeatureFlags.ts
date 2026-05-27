import { useEffect, useState } from 'react';
import { ENABLE_META_TIMESHEET } from '../../domain/build-flags';
import { DEFAULT_USER_PROFILE, type UserProfile } from '../../domain/user-profile';
import { loadUserProfile } from '../../infrastructure/user-profile-repo';

/**
 * Fonte única de verdade pras flags de UI derivadas do perfil do usuário.
 *
 * Componentes consultam esse hook em vez de checar `ENABLE_META_TIMESHEET`
 * direto — assim, quando o user responder "não preencho timesheet" no
 * onboarding, qualquer ponto do popup/sidepanel que escutar atualiza
 * automaticamente via storage listener.
 *
 * Importante: durante o `loading` inicial, devolve as flags em estado
 * "permissivo" (showTimesheet = ENABLE_META_TIMESHEET) pra evitar piscar
 * a UI escondendo elementos pra users que TÊM timesheet.
 */
export interface FeatureFlags {
  showTimesheet: boolean;
  loading: boolean;
}

function compute(profile: UserProfile): Omit<FeatureFlags, 'loading'> {
  return {
    showTimesheet: ENABLE_META_TIMESHEET && profile.hasTimesheet !== false,
  };
}

export function useFeatureFlags(): FeatureFlags {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadUserProfile().then(setProfile);
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.userProfile) return;
      const next = changes.userProfile.newValue as Partial<UserProfile> | undefined;
      setProfile({ ...DEFAULT_USER_PROFILE, ...(next ?? {}) });
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  if (!profile) {
    return { showTimesheet: ENABLE_META_TIMESHEET, loading: true };
  }
  return { ...compute(profile), loading: false };
}

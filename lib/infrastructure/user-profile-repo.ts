import { DEFAULT_USER_PROFILE, type UserProfile } from '../domain/user-profile';

const STORAGE_KEY = 'userProfile';

export async function loadUserProfile(): Promise<UserProfile> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const stored = data[STORAGE_KEY] as Partial<UserProfile> | undefined;
  return { ...DEFAULT_USER_PROFILE, ...(stored ?? {}) };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: profile });
}

export async function updateUserProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = await loadUserProfile();
  const updated: UserProfile = { ...current, ...patch };
  await saveUserProfile(updated);
  return updated;
}

export async function resetUserProfile(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

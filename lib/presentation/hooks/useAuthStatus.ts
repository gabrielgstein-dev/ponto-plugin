import { useState, useEffect } from 'react';
import { checkAuthStatus, COMPANY_AUTH_STORAGE_KEYS } from '#company/providers';

export function useAuthStatus() {
  const [hasAuth, setHasAuth] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      checkAuthStatus().then(ok => { if (!cancelled) setHasAuth(ok); });
    };

    check();

    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (COMPANY_AUTH_STORAGE_KEYS.some(k => changes[k])) check();
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(onChange);
    };
  }, []);

  return hasAuth;
}

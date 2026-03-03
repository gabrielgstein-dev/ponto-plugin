import { useState, useEffect } from 'react';

export function useAuthStatus() {
  const [hasAuth, setHasAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      chrome.storage.local.get(['gpAssertion', 'gpAssertionTs', 'seniorToken', 'seniorTokenTs'], (data) => {
        const gpOk = !!data.gpAssertion && !!data.gpAssertionTs;
        const tokenOk = !!data.seniorToken && !!data.seniorTokenTs && Date.now() - data.seniorTokenTs < 3600000;
        setHasAuth(gpOk || tokenOk);
      });
    };

    check();

    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.gpAssertion || changes.seniorToken) check();
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => chrome.storage.local.onChanged.removeListener(onChange);
  }, []);

  return hasAuth;
}

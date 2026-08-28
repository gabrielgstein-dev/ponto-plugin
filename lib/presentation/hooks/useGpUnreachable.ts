import { useState, useEffect } from 'react';

const KEY = 'gpUnreachableTs';

/**
 * `true` quando o último fetch ao GestãoPonto foi redirecionado pelo host —
 * o domínio mudou e o plugin precisa de update. É um estado diferente de
 * "deslogado": a sessão Senior pode estar perfeitamente válida.
 */
export function useGpUnreachable(): boolean {
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get([KEY]).then(v => { if (!cancelled) setUnreachable(!!v[KEY]); });

    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[KEY]) return;
      setUnreachable(!!changes[KEY].newValue);
    };
    chrome.storage.local.onChanged.addListener(onChange);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(onChange);
    };
  }, []);

  return unreachable;
}

import { useEffect, useState } from 'react';
import type { InsiXState } from '../../domain/types';
import { DEFAULT_INSI_X_STATE } from '../../domain/types';

export function useInsiXState(): { insiXState: InsiXState } {
  const [insiXState, setInsiXState] = useState<InsiXState>({ ...DEFAULT_INSI_X_STATE });

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get('insiXState').then(data => {
      if (cancelled) return;
      if (data.insiXState) setInsiXState(data.insiXState as InsiXState);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.insiXState) return;
      const next = changes.insiXState.newValue as InsiXState | undefined;
      setInsiXState(next ?? { ...DEFAULT_INSI_X_STATE });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { insiXState };
}

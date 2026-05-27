import { useEffect, useState } from 'react';
import type { MetaXState } from '../../domain/types';
import { DEFAULT_META_X_STATE } from '../../domain/types';

export function useMetaXState(): { metaXState: MetaXState } {
  const [metaXState, setMetaXState] = useState<MetaXState>({ ...DEFAULT_META_X_STATE });

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get('metaXState').then(data => {
      if (cancelled) return;
      if (data.metaXState) setMetaXState(data.metaXState as MetaXState);
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.metaXState) return;
      const next = changes.metaXState.newValue as MetaXState | undefined;
      setMetaXState(next ?? { ...DEFAULT_META_X_STATE });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { metaXState };
}

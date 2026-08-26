import { useState, useEffect, useCallback } from 'react';
import { resolveGpHostMigration, requestGpHostPermission } from '../../application/gp-host-migration';

export function useGpHostMigration() {
  const [pending, setPending] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveGpHostMigration()
      .then(state => { if (!cancelled) setPending(state === 'pending'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activate = useCallback(async () => {
    setActivating(true);
    try {
      const granted = await requestGpHostPermission();
      if (granted) setPending(false);
    } finally {
      setActivating(false);
    }
  }, []);

  return { pending, activating, activate };
}

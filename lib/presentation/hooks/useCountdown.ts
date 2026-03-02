import { useState, useEffect } from 'react';
import { timeToMinutes, formatCountdown } from '../../domain/time-utils';

export function useCountdown(targetTime: string | null) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    if (!targetTime) { setCountdown(''); return; }

    const update = () => {
      const targetMin = timeToMinutes(targetTime);
      if (targetMin == null) { setCountdown(''); return; }

      const now = new Date();
      const nowMs = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
      const targetMs = targetMin * 60000;
      const diffMs = targetMs - nowMs;

      setCountdown(diffMs > 0 ? formatCountdown(diffMs) : '00:00');
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  return countdown;
}

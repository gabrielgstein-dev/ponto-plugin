import { useEffect, useState } from 'react';
import type { PunchReminderSlot } from '../../domain/types';
import type { AutoPunchView } from '../hooks/useAutoPunchStatus';

const SLOT_LABELS: Record<PunchReminderSlot, string> = {
  entrada: 'entrada',
  almoco: 'almoço',
  volta: 'volta',
  saida: 'saída',
};

function hhmm(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "em 3 min" / "em 1h12" / "agora" — granularidade que importa aqui. */
function humanize(msLeft: number): string {
  if (msLeft <= 60000) return 'agora';
  const min = Math.round(msLeft / 60000);
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  return `em ${h}h${String(min % 60).padStart(2, '0')}`;
}

interface AutoPunchBannerProps {
  view: AutoPunchView;
  /** Algum slot tem batida automática ligada? Sem isso o bloco não aparece. */
  enabled: boolean;
}

/**
 * Diz, sem ambiguidade, se o ponto vai ser batido sozinho e quando.
 *
 * Motivação: com o lembrete tocando às 08:00 não havia como saber se a batida
 * automática ia acontecer — o usuário ficava esperando sem saber o quê. Agora
 * ou aparece o horário e a contagem, ou aparece o motivo de não haver nada
 * agendado.
 */
export function AutoPunchBanner({ view, enabled }: AutoPunchBannerProps) {
  const { next, waitingFor, lastResult } = view;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!next) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [next]);

  if (!enabled) return null;

  if (lastResult && lastResult.status === 'failed') {
    return (
      <div className="autopunch-banner autopunch-failed">
        <span className="autopunch-icon" aria-hidden="true">✕</span>
        <span className="autopunch-text">
          Não consegui bater {SLOT_LABELS[lastResult.slot]} sozinho — bata manualmente.
        </span>
      </div>
    );
  }

  if (lastResult && lastResult.status === 'unconfirmed') {
    return (
      <div className="autopunch-banner autopunch-unconfirmed">
        <span className="autopunch-icon" aria-hidden="true">!</span>
        <span className="autopunch-text">
          Enviei {SLOT_LABELS[lastResult.slot]}, mas o Senior não confirmou. Confira no Senior.
        </span>
      </div>
    );
  }

  if (next) {
    const left = next.fireAt - now;
    return (
      <div className="autopunch-banner autopunch-scheduled">
        <span className="autopunch-icon" aria-hidden="true">⚡</span>
        <span className="autopunch-text">
          Bate <strong>{SLOT_LABELS[next.slot]}</strong> sozinho às <strong>{hhmm(next.fireAt)}</strong>
        </span>
        <span className="autopunch-countdown">{humanize(left)}</span>
      </div>
    );
  }

  if (waitingFor) {
    return (
      <div className="autopunch-banner autopunch-waiting">
        <span className="autopunch-icon" aria-hidden="true">⏸</span>
        <span className="autopunch-text">
          Batida automática aguardando <strong>{SLOT_LABELS[waitingFor]}</strong> ser batida
          {waitingFor === 'entrada' ? ' — esta você bate manualmente' : ''}.
        </span>
      </div>
    );
  }

  if (lastResult && lastResult.status === 'confirmed') {
    return (
      <div className="autopunch-banner autopunch-confirmed">
        <span className="autopunch-icon" aria-hidden="true">✓</span>
        <span className="autopunch-text">
          Bati {SLOT_LABELS[lastResult.slot]}{lastResult.time ? ` às ${lastResult.time}` : ''} automaticamente.
        </span>
      </div>
    );
  }

  return null;
}

import {
  HORA_EXTRA_MAX,
  HORA_EXTRA_MIN,
  HORA_EXTRA_STEP,
  clampHoraExtra,
  formatHoraExtra,
} from '../../domain/hora-extra';

interface HoraExtraRowProps {
  /** Minutos de hora extra escolhidos para hoje (pode ser negativo). */
  minutes: number | null | undefined;
  onChange: (minutes: number) => void;
  /** Saída estimada já com o ajuste aplicado — o feedback do que mudou. */
  estimatedExit: string | null;
}

/**
 * Ajuste de hora extra do dia.
 *
 * É DELTA sobre a jornada do contrato, nunca total: "+1h" significa o mesmo pra
 * quem tem contrato de 6h e pra quem tem 8h. Pedir o total obrigaria o usuário
 * a saber a própria jornada de cor — e a errar quando ela mudasse.
 *
 * O saldo do banco de horas não é tocado: continua sendo apurado contra a
 * jornada contratual, que é o que faz a extra aparecer como saldo positivo.
 */
export function HoraExtraRow({ minutes, onChange, estimatedExit }: HoraExtraRowProps) {
  const value = clampHoraExtra(minutes);
  const atMax = value >= HORA_EXTRA_MAX;
  const atMin = value <= HORA_EXTRA_MIN;

  return (
    <div className="hora-extra-row">
      <div className="hora-extra-head">
        <span className="hora-extra-label">Hora extra hoje</span>
        {value !== 0 && (
          <button
            type="button"
            className="hora-extra-clear"
            onClick={() => onChange(0)}
            aria-label="Remover hora extra de hoje"
          >
            zerar
          </button>
        )}
      </div>
      <div className="hora-extra-control">
        <button
          type="button"
          className="hora-extra-step"
          onClick={() => onChange(value - HORA_EXTRA_STEP)}
          disabled={atMin}
          aria-label={`Diminuir ${HORA_EXTRA_STEP} minutos`}
        >
          −
        </button>
        <span className={`hora-extra-value${value === 0 ? ' zero' : ''}`} data-testid="hora-extra-value">
          {value === 0 ? 'sem extra' : formatHoraExtra(value)}
        </span>
        <button
          type="button"
          className="hora-extra-step"
          onClick={() => onChange(value + HORA_EXTRA_STEP)}
          disabled={atMax}
          aria-label={`Aumentar ${HORA_EXTRA_STEP} minutos`}
        >
          +
        </button>
      </div>
      {estimatedExit && (
        <div className="hora-extra-hint">
          Saída {value === 0 ? 'prevista' : 'ajustada'} para <strong>{estimatedExit}</strong>
        </div>
      )}
    </div>
  );
}

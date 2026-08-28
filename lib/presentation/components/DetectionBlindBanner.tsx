interface DetectionBlindBannerProps {
  /** true = o plugin não tem NENHUMA fonte de auth para consultar batidas. */
  blind: boolean;
  loginUrl: string;
  companyLabel: string;
}

/**
 * Avisa que o plugin está CEGO — não que você não bateu.
 *
 * Incidente que originou (2026-07-21): após reinstalar a extensão, todos os
 * tokens sumiram e o backend do gestão de ponto estava em 502. Nenhuma fonte
 * respondeu, os cards mostraram `--:--` e o usuário concluiu que ainda não
 * tinha batido — bateu de novo às 08:35 um ponto que já existia às 08:05 no
 * servidor. Ausência de dado não pode se parecer com ausência de batida.
 */
export function DetectionBlindBanner({ blind, loginUrl, companyLabel }: DetectionBlindBannerProps) {
  if (!blind) return null;

  return (
    <div className="detection-blind-banner" role="alert">
      <span className="detection-blind-icon" aria-hidden="true">⚠</span>
      <div className="detection-blind-text">
        <strong>Não consegui verificar suas batidas.</strong>{' '}
        Os horários abaixo podem estar incompletos — <strong>confira no {companyLabel} antes
        de bater</strong>, para não registrar em duplicidade.{' '}
        <a href={loginUrl} target="_blank" rel="noreferrer" className="detection-blind-link">
          Abrir {companyLabel}
        </a>
      </div>
    </div>
  );
}

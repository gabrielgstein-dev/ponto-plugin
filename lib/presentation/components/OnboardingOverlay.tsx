import { useUserProfile } from '../hooks/useUserProfile';
import type { OnboardingOption, OnboardingValue } from '../../domain/user-profile';

/**
 * Overlay de onboarding (estilo carrocel Nubank). Bloqueia o popup
 * enquanto o user não responder todas as perguntas.
 *
 * Pra adicionar nova pergunta no futuro: basta acrescentar um item em
 * `ONBOARDING_STEPS` — o overlay já desenha o carrocel certinho.
 */
export function OnboardingOverlay() {
  const { needsOnboarding, loading, step, currentStep, totalSteps, isLastStep, answer, prev } = useUserProfile();

  if (loading || !needsOnboarding) return null;

  const handlePick = (opt: OnboardingOption) => {
    void answer(opt.value as OnboardingValue);
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-question">
      <div className="onboarding-card">
        <div className="onboarding-progress" aria-hidden="true">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={`onboarding-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`} />
          ))}
        </div>

        <div className="onboarding-header">
          <span className="onboarding-step-label">
            {currentStep + 1} de {totalSteps}
          </span>
        </div>

        <h2 id="onboarding-question" className="onboarding-question">
          {step.question}
        </h2>

        {step.description && (
          <p className="onboarding-description">{step.description}</p>
        )}

        <div className="onboarding-options">
          {step.options.map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              className="onboarding-option"
              onClick={() => handlePick(opt)}
            >
              {opt.emoji && <span className="onboarding-option-emoji">{opt.emoji}</span>}
              <span className="onboarding-option-label">{opt.label}</span>
            </button>
          ))}
        </div>

        {currentStep > 0 && (
          <button type="button" className="onboarding-back" onClick={prev}>
            ← Voltar
          </button>
        )}

        {isLastStep && (
          <p className="onboarding-footnote">Última pergunta</p>
        )}
      </div>
    </div>
  );
}

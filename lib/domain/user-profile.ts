/**
 * Perfil do usuário capturado pelo onboarding inicial.
 *
 * Pensado pra crescer com novas perguntas no estilo Nubank (carrocel):
 * basta adicionar campos no `UserProfile` e steps em `ONBOARDING_STEPS`.
 *
 * `hasTimesheet === false` é o ÚNICO valor que desliga o módulo de
 * timesheet. `null` (não respondeu ainda) e `true` mantêm tudo ativo —
 * isso preserva o comportamento atual pra users já instalados que vão
 * ver o overlay pela primeira vez na próxima abertura do popup.
 */
export interface UserProfile {
  hasTimesheet: boolean | null;
  onboardingCompleted: boolean;
  completedAt?: string;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  hasTimesheet: null,
  onboardingCompleted: false,
};

export type OnboardingValue = boolean | string | number;

export interface OnboardingOption {
  value: OnboardingValue;
  label: string;
  emoji?: string;
  description?: string;
}

export interface OnboardingStep {
  id: keyof UserProfile;
  question: string;
  description?: string;
  options: OnboardingOption[];
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'hasTimesheet',
    question: 'Você preenche timesheet?',
    description:
      'Se sim, mantemos lembretes, banco de horas e a aba de Timesheet. Se não, deixamos a interface focada só no ponto.',
    options: [
      { value: true, label: 'Sim, preencho', emoji: '✅' },
      { value: false, label: 'Não preencho', emoji: '🚫' },
    ],
  },
];

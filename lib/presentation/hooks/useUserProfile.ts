import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_USER_PROFILE,
  ONBOARDING_STEPS,
  type OnboardingValue,
  type UserProfile,
} from '../../domain/user-profile';
import { loadUserProfile, updateUserProfile } from '../../infrastructure/user-profile-repo';

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    loadUserProfile().then(p => {
      setProfile(p);
      setLoading(false);
    });

    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.userProfile) return;
      const next = changes.userProfile.newValue as Partial<UserProfile> | undefined;
      setProfile({ ...DEFAULT_USER_PROFILE, ...(next ?? {}) });
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const totalSteps = ONBOARDING_STEPS.length;
  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep >= totalSteps - 1;
  const needsOnboarding = !loading && !profile.onboardingCompleted;

  const answer = useCallback(async (value: OnboardingValue) => {
    const patch: Partial<UserProfile> = { [step.id]: value } as Partial<UserProfile>;
    if (isLastStep) {
      patch.onboardingCompleted = true;
      patch.completedAt = new Date().toISOString();
    }
    const updated = await updateUserProfile(patch);
    setProfile(updated);
    if (!isLastStep) setCurrentStep(s => s + 1);
  }, [step, isLastStep]);

  const next = useCallback(() => setCurrentStep(s => Math.min(s + 1, totalSteps - 1)), [totalSteps]);
  const prev = useCallback(() => setCurrentStep(s => Math.max(s - 1, 0)), []);

  return {
    profile,
    loading,
    needsOnboarding,
    currentStep,
    step,
    totalSteps,
    isLastStep,
    answer,
    next,
    prev,
  };
}

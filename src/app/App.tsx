import { useEffect, useState } from 'react';
import { useSettings, isOnboarded } from '@/state/settings.store';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { Board } from './board/Board';

export default function App() {
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());
  const state = useSettings();

  useEffect(() => {
    if (useSettings.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useSettings.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-zinc-600">
        Loading…
      </div>
    );
  }

  return isOnboarded(state) ? <Board /> : <OnboardingFlow />;
}

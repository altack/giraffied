import { useEffect, useState } from 'react';
import { useSettings, isOnboarded } from '@/state/settings.store';
import { OnboardingFlow } from './onboarding/OnboardingFlow';
import { Board } from './board/Board';

export default function App() {
  const [hydrated, setHydrated] = useState(() => useSettings.persist.hasHydrated());
  const state = useSettings();

  useEffect(() => {
    if (hydrated) return;
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-500 flex items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  return isOnboarded(state) ? <Board /> : <OnboardingFlow />;
}

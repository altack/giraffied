import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/state/settings.store';

export function Board() {
  const { org, projectName, teamName, reset } = useSettings();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Jirafied</h1>
          <span className="text-zinc-500 text-sm">
            {org} · {projectName} · {teamName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Sign out" onClick={() => reset()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center text-zinc-500">
        <div className="text-center space-y-2">
          <p>Taskboard renders here in Phase 3.</p>
          <p className="text-xs">Connected and ready.</p>
        </div>
      </main>
    </div>
  );
}

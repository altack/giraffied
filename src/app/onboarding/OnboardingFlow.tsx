import { useState, type FormEvent } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listProjects, listTeams } from '@/ado/endpoints';
import { AdoError } from '@/ado/client';
import { useSettings } from '@/state/settings.store';
import type { AdoProject, AdoTeam } from '@/ado/types';

type Step = 'credentials' | 'project' | 'team';

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('credentials');
  const [org, setOrg] = useState('');
  const [pat, setPat] = useState('');
  const [projects, setProjects] = useState<AdoProject[]>([]);
  const [teams, setTeams] = useState<AdoTeam[]>([]);
  const [selectedProject, setSelectedProject] = useState<AdoProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanOrg = org.trim().replace(/^https?:\/\/dev\.azure\.com\//i, '').replace(/\/$/, '');
      if (!cleanOrg) throw new Error('Organization cannot be empty');
      if (!pat.trim()) throw new Error('PAT cannot be empty');

      const res = await listProjects({ org: cleanOrg, pat: pat.trim() });
      if (res.value.length === 0) {
        setError('Connected, but no projects visible. Does your PAT have the Work scope?');
        return;
      }
      useSettings.getState().setCredentials(cleanOrg, pat.trim());
      setOrg(cleanOrg);
      setProjects(res.value);
      setStep('project');
    } catch (err) {
      if (err instanceof AdoError) {
        if (err.status === 401 || err.status === 203) {
          setError('Authentication failed. Double-check your PAT and that it has the Work (Read & write) scope.');
        } else if (err.status === 404) {
          setError(`Organization not found at https://dev.azure.com/${org.trim()}`);
        } else {
          setError(`${err.status} ${err.statusText}: ${err.body.slice(0, 200)}`);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleProject(project: AdoProject) {
    setError(null);
    setBusy(true);
    setSelectedProject(project);
    try {
      const res = await listTeams(project.id);
      useSettings.getState().setProject(project.id, project.name);
      setTeams(res.value);
      setStep('team');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setBusy(false);
    }
  }

  function handleTeam(team: AdoTeam) {
    useSettings.getState().setTeam(team.id, team.name);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Connect to Azure DevOps</h1>
          <p className="text-sm text-zinc-400">
            Jirafied talks directly to the Azure DevOps REST API from your browser. Nothing goes through a server.
          </p>
        </header>

        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org">Organization</Label>
              <Input
                id="org"
                placeholder="myorg"
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-zinc-500">
                The segment after <code className="text-zinc-300">dev.azure.com/</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pat">Personal Access Token</Label>
              <Input
                id="pat"
                type="password"
                placeholder="••••••••••••••••"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                <span>Needs scope</span>
                <code className="text-zinc-300">Work Items (Read &amp; write)</code>.
                <a
                  href={
                    org.trim()
                      ? `https://dev.azure.com/${encodeURIComponent(org.trim())}/_usersSettings/tokens`
                      : 'https://dev.azure.com'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-indigo-400 hover:underline"
                >
                  Create one <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
            {error && (
              <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </form>
        )}

        {step === 'project' && (
          <div className="space-y-4">
            <div className="text-sm text-zinc-400">
              Connected to <code className="text-zinc-200">{org}</code>. Choose a project.
            </div>
            {error && (
              <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <ul className="max-h-96 overflow-y-auto rounded-md border border-zinc-800 divide-y divide-zinc-800">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleProject(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 disabled:opacity-50"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-zinc-500 line-clamp-1">{p.description}</div>
                      )}
                    </div>
                    {busy && selectedProject?.id === p.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={() => setStep('credentials')}>
              ← Change organization
            </Button>
          </div>
        )}

        {step === 'team' && selectedProject && (
          <div className="space-y-4">
            <div className="text-sm text-zinc-400">
              Project <code className="text-zinc-200">{selectedProject.name}</code>. Choose a team — this picks the default sprint board.
            </div>
            <ul className="max-h-96 overflow-y-auto rounded-md border border-zinc-800 divide-y divide-zinc-800">
              {teams.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handleTeam(t)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900"
                  >
                    <div>
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-zinc-500 line-clamp-1">{t.description}</div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={() => setStep('project')}>
              ← Change project
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

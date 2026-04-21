import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, ExternalLink, Search } from 'lucide-react';
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
  const [projectFilter, setProjectFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProjects = useMemo(
    () => filterByName(projects, projectFilter),
    [projects, projectFilter],
  );
  const filteredTeams = useMemo(() => filterByName(teams, teamFilter), [teams, teamFilter]);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanOrg = org.trim().replace(/^https?:\/\/dev\.azure\.com\//i, '').replace(/\/$/, '');
      if (!cleanOrg) throw new Error('Organization cannot be empty');
      if (!pat.trim()) throw new Error('PAT cannot be empty');

      const list = await listProjects({ org: cleanOrg, pat: pat.trim() });
      if (list.length === 0) {
        setError('Connected, but no projects visible. Does your PAT have the Work scope?');
        return;
      }
      useSettings.getState().setCredentials(cleanOrg, pat.trim());
      setOrg(cleanOrg);
      setProjects(list);
      setProjectFilter('');
      setStep('project');
    } catch (err) {
      if (err instanceof AdoError) {
        if (err.status === 401 || err.status === 203) {
          setError(
            'Authentication failed. Double-check your PAT and that it has the Work (Read & write) scope.',
          );
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
      const list = await listTeams(project.id);
      useSettings.getState().setProject(project.id, project.name);
      setTeams(list);
      setTeamFilter('');
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
            Jirafied talks directly to the Azure DevOps REST API from your browser. Nothing goes
            through a server.
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
            <SearchInput
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="Search projects…"
              total={projects.length}
              shown={filteredProjects.length}
              autoFocus
            />
            {error && (
              <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <PickerList
              items={filteredProjects}
              emptyLabel={projectFilter ? 'No matches.' : 'No projects visible.'}
              renderItem={(p) => (
                <>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-zinc-500 line-clamp-1">{p.description}</div>
                    )}
                  </div>
                  {busy && selectedProject?.id === p.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                  )}
                </>
              )}
              onSelect={handleProject}
              disabled={busy}
            />
            <Button variant="ghost" size="sm" onClick={() => setStep('credentials')}>
              ← Change organization
            </Button>
          </div>
        )}

        {step === 'team' && selectedProject && (
          <div className="space-y-4">
            <div className="text-sm text-zinc-400">
              Project <code className="text-zinc-200">{selectedProject.name}</code>. Choose a team —
              this picks the default sprint board.
            </div>
            <SearchInput
              value={teamFilter}
              onChange={setTeamFilter}
              placeholder="Search teams…"
              total={teams.length}
              shown={filteredTeams.length}
              autoFocus
            />
            <PickerList
              items={filteredTeams}
              emptyLabel={teamFilter ? 'No matches.' : 'No teams in this project.'}
              renderItem={(t) => (
                <div>
                  <div className="font-medium">{t.name}</div>
                  {t.description && (
                    <div className="text-xs text-zinc-500 line-clamp-1">{t.description}</div>
                  )}
                </div>
              )}
              onSelect={handleTeam}
              disabled={false}
            />
            <Button variant="ghost" size="sm" onClick={() => setStep('project')}>
              ← Change project
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function filterByName<T extends { name: string; description?: string }>(
  items: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (x) =>
      x.name.toLowerCase().includes(q) ||
      (x.description?.toLowerCase().includes(q) ?? false),
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  total,
  shown,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  total: number;
  shown: number;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          autoFocus={autoFocus}
        />
      </div>
      <div className="text-xs text-zinc-500 px-1">
        {value ? `${shown} of ${total}` : `${total} total`}
      </div>
    </div>
  );
}

function PickerList<T extends { id: string }>({
  items,
  onSelect,
  renderItem,
  emptyLabel,
  disabled,
}: {
  items: T[];
  onSelect: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
  emptyLabel: string;
  disabled: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className="max-h-96 overflow-y-auto rounded-md border border-zinc-800 divide-y divide-zinc-800">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 disabled:opacity-50"
          >
            {renderItem(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

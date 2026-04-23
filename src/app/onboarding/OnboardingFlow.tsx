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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle ambient gradient — the only "glow" moment on this surface. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(80% 50% at 50% 0%, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.04) 35%, transparent 70%)',
        }}
      />
      <div className="relative w-full max-w-md space-y-7">
        <header className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
            Giraffied 🦒
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight">
            Connect to Azure DevOps
          </h1>
          <p className="text-[13px] text-zinc-500 leading-relaxed">
            Giraffied talks directly to the Azure DevOps REST API from your browser. Nothing goes
            through a server.
          </p>
        </header>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5 lit-top">
          {step === 'credentials' && (
            <form onSubmit={handleCredentials} className="space-y-4">
              <Field label="Organization" htmlFor="org">
                <Input
                  id="org"
                  placeholder="myorg"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <Hint>
                  The segment after <code className="mono text-zinc-400">dev.azure.com/</code>
                </Hint>
              </Field>
              <Field label="Personal Access Token" htmlFor="pat">
                <Input
                  id="pat"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Hint>
                  Needs scope <code className="mono text-zinc-400">Work Items (Read &amp; write)</code>.{' '}
                  <a
                    href={
                      org.trim()
                        ? `https://dev.azure.com/${encodeURIComponent(org.trim())}/_usersSettings/tokens`
                        : 'https://dev.azure.com'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-indigo-300 hover:text-indigo-200"
                  >
                    Create one <ExternalLink className="h-3 w-3" />
                  </a>
                </Hint>
              </Field>
              {error && <ErrorRow>{error}</ErrorRow>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {busy ? 'Connecting…' : 'Connect'}
              </Button>
            </form>
          )}

          {step === 'project' && (
            <div className="space-y-4">
              <div className="text-[13px] text-zinc-400">
                Connected to <code className="mono text-zinc-200">{org}</code>. Choose a project.
              </div>
              <SearchInput
                value={projectFilter}
                onChange={setProjectFilter}
                placeholder="Search projects…"
                total={projects.length}
                shown={filteredProjects.length}
                autoFocus
              />
              {error && <ErrorRow>{error}</ErrorRow>}
              <PickerList
                items={filteredProjects}
                emptyLabel={projectFilter ? 'No matches.' : 'No projects visible.'}
                renderItem={(p) => (
                  <>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-zinc-100 truncate">
                        {p.name}
                      </div>
                      {p.description && (
                        <div className="text-[11.5px] text-zinc-500 line-clamp-1">
                          {p.description}
                        </div>
                      )}
                    </div>
                    {busy && selectedProject?.id === p.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
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
              <div className="text-[13px] text-zinc-400">
                Project <code className="mono text-zinc-200">{selectedProject.name}</code>. Choose a
                team — this picks the default sprint board.
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
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-100 truncate">{t.name}</div>
                    {t.description && (
                      <div className="text-[11.5px] text-zinc-500 line-clamp-1">
                        {t.description}
                      </div>
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
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] text-zinc-500 flex items-center gap-1">{children}</p>;
}

function ErrorRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-200 lit-top">
      {children}
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
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-600 pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
          autoFocus={autoFocus}
        />
      </div>
      <div className="text-[11px] text-zinc-600 px-1 mono">
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
      <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[12.5px] text-zinc-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <ul className="max-h-80 overflow-y-auto rounded-md border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(item)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          >
            {renderItem(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

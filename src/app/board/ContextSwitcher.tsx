import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  FolderOpen,
  Loader2,
  LogOut,
  Search,
  Users,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/state/settings.store';
import { listProjects, listTeams } from '@/ado/endpoints';
import type { AdoProject, AdoTeam } from '@/ado/types';
import { cn } from '@/lib/cn';

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 440;

type View = 'menu' | 'projects' | 'teams';

export function ContextSwitcher() {
  const org = useSettings((s) => s.org);
  const projectId = useSettings((s) => s.projectId);
  const projectName = useSettings((s) => s.projectName);
  const teamId = useSettings((s) => s.teamId);
  const teamName = useSettings((s) => s.teamName);
  const setTeam = useSettings((s) => s.setTeam);
  const setProjectAndTeam = useSettings((s) => s.setProjectAndTeam);
  const reset = useSettings((s) => s.reset);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  // While switching project, we hold the user's pending choice here so we can
  // commit project+team atomically at team-pick time. Without this, calling
  // setProject() clears teamId, the App-level isOnboarded guard flips false,
  // and OnboardingFlow flashes until the user also picks a team.
  const [pendingProject, setPendingProject] = useState<AdoProject | null>(null);
  // View direction — menu (0) → projects (1) → teams (2). Going to a deeper
  // view slides in from the right (forward); stepping back slides in from
  // the left. Tracked via ref so the comparison at render time is against
  // the *previous* view, not the current one.
  const prevViewRef = useRef<View>('menu');
  const viewOrder = (v: View) => (v === 'menu' ? 0 : v === 'projects' ? 1 : 2);
  const viewDirection: 'fwd' | 'back' =
    viewOrder(view) >= viewOrder(prevViewRef.current) ? 'fwd' : 'back';
  useEffect(() => {
    prevViewRef.current = view;
  }, [view]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setView('menu');
    setPendingProject(null);
  }, []);

  function toggle() {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    if (open) close();
    else setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const placement = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4) : rect.bottom + 4;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
        const origin = flipUp ? 'from-bottom-left' : 'from-top-left';
        return {
          style: { position: 'fixed', top, left, width: POPOVER_WIDTH } as React.CSSProperties,
          origin,
        };
      })()
    : null;

  function handlePickProject(p: AdoProject) {
    if (p.id === projectId) {
      // User picked the same project — no need to re-enter team selection.
      setView('menu');
      return;
    }
    setPendingProject(p);
    setView('teams');
  }

  function handlePickTeam(t: AdoTeam) {
    if (pendingProject) {
      setProjectAndTeam(pendingProject.id, pendingProject.name, t.id, t.name);
    } else {
      setTeam(t.id, t.name);
    }
    close();
  }

  const teamsForProjectId = pendingProject?.id ?? projectId;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5',
          'text-[12px] text-[var(--color-ink-muted)]',
          'hover:bg-[var(--color-overlay-1)] hover:text-[var(--color-ink)] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/40',
          open && 'bg-[var(--color-overlay-1)] text-[var(--color-ink)]',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch project or team"
      >
        <span className="truncate">
          {org}
          <span className="text-[var(--color-ink-dim)] mx-1">/</span>
          {projectName}
          <span className="text-[var(--color-ink-dim)] mx-1">/</span>
          <span className="text-[var(--color-ink)]">{teamName}</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[var(--color-ink-dim)] group-hover:text-[var(--color-ink-muted)] transition-colors" />
      </button>
      {open &&
        placement &&
        createPortal(
          <div
            ref={popRef}
            style={{ ...placement.style, zIndex: 60 }}
            className={cn(
              'rounded-md overflow-hidden jfd-glass-panel jfd-popover-enter',
              placement.origin,
            )}
          >
            {/* Each view lives inside a keyed wrapper so React remounts on
                view change and fires the directional slide keyframe. */}
            <div
              key={view}
              className={viewDirection === 'fwd' ? 'jfd-view-fwd' : 'jfd-view-back'}
            >
              {view === 'menu' && (
                <MenuView
                  org={org}
                  projectName={projectName}
                  teamName={teamName}
                  onSwitchProject={() => setView('projects')}
                  onSwitchTeam={() => setView('teams')}
                  onSignOut={() => {
                    reset();
                    close();
                  }}
                />
              )}
              {view === 'projects' && (
                <ProjectPicker
                  currentId={projectId}
                  onBack={() => {
                    setView('menu');
                    setPendingProject(null);
                  }}
                  onPick={handlePickProject}
                />
              )}
              {view === 'teams' && teamsForProjectId && (
                <TeamPicker
                  projectId={teamsForProjectId}
                  projectLabel={pendingProject?.name ?? projectName ?? ''}
                  currentTeamId={pendingProject ? null : teamId}
                  onBack={() => {
                    if (pendingProject) {
                      setView('projects');
                    } else {
                      setView('menu');
                    }
                  }}
                  onPick={handlePickTeam}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── Views ────────────────────────────────────────────────────────────────── */

function MenuView({
  org,
  projectName,
  teamName,
  onSwitchProject,
  onSwitchTeam,
  onSignOut,
}: {
  org: string | null;
  projectName: string | null;
  teamName: string | null;
  onSwitchProject: () => void;
  onSwitchTeam: () => void;
  onSignOut: () => void;
}) {
  return (
    <div>
      <div className="px-3 py-2 border-b border-[var(--color-hairline)] text-[11.5px] text-[var(--color-ink-muted)] truncate">
        {org}
        <span className="text-[var(--color-ink-dim)] mx-1">/</span>
        {projectName}
        <span className="text-[var(--color-ink-dim)] mx-1">/</span>
        <span className="text-[var(--color-ink)]">{teamName}</span>
      </div>
      <div className="py-1">
        <MenuRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Switch project…" onClick={onSwitchProject} />
        <MenuRow icon={<Users className="h-3.5 w-3.5" />} label="Switch team…" onClick={onSwitchTeam} />
      </div>
      <div className="border-t border-[var(--color-hairline)] py-1">
        <MenuRow
          icon={<LogOut className="h-3.5 w-3.5" />}
          label="Sign out / change organization"
          onClick={onSignOut}
          tone="danger"
        />
      </div>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-left transition-colors',
        tone === 'danger'
          ? 'text-[var(--color-ink-muted)] hover:bg-red-500/[0.08] hover:text-red-300'
          : 'text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]',
      )}
    >
      <span className={cn(tone === 'danger' ? 'text-red-300/80' : 'text-[var(--color-ink-muted)]')}>{icon}</span>
      {label}
    </button>
  );
}

function ProjectPicker({
  currentId,
  onBack,
  onPick,
}: {
  currentId: string | null;
  onBack: () => void;
  onPick: (p: AdoProject) => void;
}) {
  const [filter, setFilter] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['switcher', 'projects'],
    queryFn: () => listProjects(),
    staleTime: 60_000,
  });
  const filtered = useMemo(() => filterByName(data ?? [], filter), [data, filter]);
  return (
    <PickerShell title="Switch project" onBack={onBack} value={filter} onChange={setFilter}>
      {isLoading && <PickerSpinner />}
      {error && <PickerError error={error} />}
      {!isLoading && !error && (
        <PickerList
          items={filtered}
          empty={filter ? 'No matches.' : 'No projects visible.'}
          render={(p) => (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--color-ink)] truncate">{p.name}</div>
                {p.description && (
                  <div className="text-[11px] text-[var(--color-ink-muted)] line-clamp-1">{p.description}</div>
                )}
              </div>
              {p.id === currentId && <Check className="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />}
            </>
          )}
          onSelect={onPick}
        />
      )}
    </PickerShell>
  );
}

function TeamPicker({
  projectId,
  projectLabel,
  currentTeamId,
  onBack,
  onPick,
}: {
  projectId: string;
  projectLabel: string;
  currentTeamId: string | null;
  onBack: () => void;
  onPick: (t: AdoTeam) => void;
}) {
  const [filter, setFilter] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['switcher', 'teams', projectId],
    queryFn: () => listTeams(projectId),
    staleTime: 60_000,
  });
  const filtered = useMemo(() => filterByName(data ?? [], filter), [data, filter]);
  return (
    <PickerShell
      title="Switch team"
      subtitle={projectLabel}
      onBack={onBack}
      value={filter}
      onChange={setFilter}
    >
      {isLoading && <PickerSpinner />}
      {error && <PickerError error={error} />}
      {!isLoading && !error && (
        <PickerList
          items={filtered}
          empty={filter ? 'No matches.' : 'No teams in this project.'}
          render={(t) => (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-[var(--color-ink)] truncate">{t.name}</div>
                {t.description && (
                  <div className="text-[11px] text-[var(--color-ink-muted)] line-clamp-1">{t.description}</div>
                )}
              </div>
              {t.id === currentTeamId && <Check className="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />}
            </>
          )}
          onSelect={onPick}
        />
      )}
    </PickerShell>
  );
}

/* ── Picker shell primitives ──────────────────────────────────────────────── */

function PickerShell({
  title,
  subtitle,
  onBack,
  value,
  onChange,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-hairline)]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center h-6 w-6 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]"
          aria-label="Back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[var(--color-ink)] leading-tight">{title}</div>
          {subtitle && (
            <div className="text-[10.5px] text-[var(--color-ink-muted)] truncate leading-tight">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="p-1.5 border-b border-[var(--color-hairline)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-ink-dim)] pointer-events-none" />
          <Input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search…"
            className="h-7 pl-7"
          />
        </div>
      </div>
      <div className="max-h-72 overflow-auto py-1">{children}</div>
    </div>
  );
}

function PickerList<T extends { id: string }>({
  items,
  render,
  onSelect,
  empty,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <div className="px-3 py-4 text-center text-[12px] text-[var(--color-ink-dim)]">{empty}</div>;
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-overlay-1)] transition-colors"
          >
            {render(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PickerSpinner() {
  return (
    <div className="flex items-center justify-center py-6 text-[var(--color-ink-dim)]">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}

function PickerError({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-2 my-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[12px] text-red-200">
      {msg}
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

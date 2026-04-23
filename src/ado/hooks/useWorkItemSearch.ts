import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamFieldValues,
  getWorkItemsBatch,
  getWorkItemsBatchOrg,
  queryWiql,
} from '@/ado/endpoints';
import type { AdoWorkItem } from '@/ado/types';
import { useSettings } from '@/state/settings.store';

export type SearchScope = 'sprint' | 'team' | 'project' | 'org';

export const SEARCH_SCOPES: readonly SearchScope[] = [
  'sprint',
  'team',
  'project',
  'org',
] as const;

export interface SearchContext {
  iterationPath: string | undefined;
}

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 220;
const MAX_RESULTS = 40;

/** WIQL single-quote strings use doubled single-quotes for escapes. */
function wiqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Parse a user query — if it's a bare number (optionally prefixed with `#`),
 *  we AND a `[System.Id] = N` clause OR'd with the title match, so entering a
 *  work-item id jumps straight to that card. */
function parseIdQuery(q: string): number | null {
  const m = q.trim().match(/^#?(\d{1,10})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function buildWiql(query: string, scopeClause: string | null): string {
  const q = wiqlEscape(query);
  const idMatch = parseIdQuery(query);
  const textClause = idMatch
    ? `([System.Title] CONTAINS '${q}' OR [System.Id] = ${idMatch})`
    : `[System.Title] CONTAINS '${q}'`;
  const where = [
    `[System.State] <> 'Removed'`,
    textClause,
    ...(scopeClause ? [scopeClause] : []),
  ].join(' AND ');
  return `SELECT [System.Id] FROM WorkItems WHERE ${where} ORDER BY [System.ChangedDate] DESC`;
}

/** Debounce a value so we don't fire a WIQL per keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Run the WIQL + batch fetch for a given (query, scope) pair.
 *  Returns null while the query is too short / disabled. */
export function useWorkItemSearch(
  rawQuery: string,
  scope: SearchScope,
  context: SearchContext,
  enabled: boolean,
) {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const projectName = useSettings((s) => s.projectName);

  const debouncedQuery = useDebounced(rawQuery.trim(), DEBOUNCE_MS);
  const canRun = enabled && debouncedQuery.length >= MIN_QUERY_LEN;

  // For team scope we need the team's default area path; fetched lazily and
  // cached for an hour. Cheap — one call per session.
  const teamAreaQuery = useQuery({
    queryKey: ['teamFieldValues', projectId, teamId],
    queryFn: () => getTeamFieldValues(projectId!, teamId!),
    enabled: canRun && scope === 'team' && !!projectId && !!teamId,
    staleTime: 60 * 60 * 1000,
  });

  const searchKey = useMemo(
    () =>
      [
        'workItemSearch',
        scope,
        debouncedQuery,
        projectId,
        scope === 'sprint' ? context.iterationPath ?? null : null,
        scope === 'team' ? teamAreaQuery.data?.defaultValue ?? null : null,
      ] as const,
    [
      scope,
      debouncedQuery,
      projectId,
      context.iterationPath,
      teamAreaQuery.data?.defaultValue,
    ],
  );

  // Gate per-scope readiness: sprint needs an iteration path; team needs the
  // resolved default area path. Otherwise the query would either 400 or scope
  // incorrectly.
  const scopeReady = (() => {
    if (!canRun) return false;
    if (scope === 'sprint') return !!context.iterationPath;
    if (scope === 'team') return !!teamAreaQuery.data?.defaultValue;
    if (scope === 'project' || scope === 'org') return !!projectId;
    return false;
  })();

  const search = useQuery({
    queryKey: searchKey,
    queryFn: async (): Promise<AdoWorkItem[]> => {
      if (!projectId) throw new Error('Missing project');

      let scopeClause: string | null = null;
      let useProjectEndpoint = true;
      if (scope === 'sprint') {
        scopeClause = `[System.IterationPath] = '${wiqlEscape(context.iterationPath ?? '')}'`;
      } else if (scope === 'team') {
        const area = teamAreaQuery.data?.defaultValue ?? '';
        scopeClause = `[System.AreaPath] UNDER '${wiqlEscape(area)}'`;
      } else if (scope === 'project') {
        // Project endpoint already scopes; no extra WHERE needed.
        scopeClause = projectName
          ? `[System.TeamProject] = '${wiqlEscape(projectName)}'`
          : null;
      } else {
        // Org scope uses org-level WIQL endpoint; no project path segment.
        useProjectEndpoint = false;
        scopeClause = null;
      }

      const wiql = buildWiql(debouncedQuery, scopeClause);
      const res = await queryWiql(
        wiql,
        useProjectEndpoint ? projectId : undefined,
        MAX_RESULTS,
      );
      const ids = res.workItems.slice(0, MAX_RESULTS).map((w) => w.id);
      if (ids.length === 0) return [];

      const items =
        scope === 'org'
          ? await getWorkItemsBatchOrg(ids)
          : await getWorkItemsBatch(projectId, ids);

      // Preserve WIQL's order (ChangedDate DESC) — batch response is unordered.
      const byId = new Map(items.map((w) => [w.id, w] as const));
      const ordered: AdoWorkItem[] = [];
      for (const id of ids) {
        const w = byId.get(id);
        if (w) ordered.push(w);
      }

      // Deliberately NOT priming the `['workitem-full', …]` cache here. The
      // batch fetch only asks for DEFAULT_WORKITEM_FIELDS, which omits
      // things like Repro Steps / Acceptance Criteria / relations that the
      // modal's layout-driven form needs. Priming would satisfy
      // useWorkItemFull's 30s staleTime with a partial record and the
      // custom HTML fields would render empty with no visible refetch.
      // The modal's own fetch (~300ms) is a better tradeoff than a
      // permanently-empty form.
      return ordered;
    },
    enabled: scopeReady,
    // Search results go stale quickly because ChangedDate is the sort key.
    staleTime: 15_000,
    // Keep prior results visible while typing so the list doesn't flash empty.
    placeholderData: (prev) => prev,
    retry: false,
  });

  return {
    query: debouncedQuery,
    isShort: rawQuery.trim().length > 0 && rawQuery.trim().length < MIN_QUERY_LEN,
    isTyping: rawQuery.trim() !== debouncedQuery,
    isLoading: search.isLoading || search.isFetching,
    error: search.error,
    results: search.data ?? [],
  };
}

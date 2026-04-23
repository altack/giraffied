import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getTeamFieldValues,
  getWorkItemsBatch,
  getWorkItemsBatchOrg,
  queryWiql,
} from '@/ado/endpoints';
import type { AdoWorkItem } from '@/ado/types';
import { useOrgFields } from '@/ado/hooks/useOrgFields';
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

/** Text fields we try to include in the CONTAINS clause. Which of these are
 *  actually usable depends on the org's field registry — WIQL 400s if you
 *  reference a field that doesn't exist in the queried scope. The hook
 *  filters this list against `useOrgFields().byRef` at query time.
 *
 *  Order matters for how we document behavior to the user, but doesn't
 *  affect WIQL execution (CONTAINS is evaluated against whichever row
 *  matches first anyway). Title/Description/Tags are effectively universal;
 *  Repro Steps / System Info / Acceptance Criteria are on standard template
 *  WITs (Bug, Story/PBI/Issue) but might be missing in very custom orgs.
 *
 *  Note: WIQL cannot query comments — they live in a separate entity and
 *  aren't indexed by the query engine. For comment-aware search we'd need
 *  the almsearch.dev.azure.com Work Item Search API, which also needs an
 *  extra host permission in the manifest. */
const SEARCH_TEXT_FIELDS = [
  'System.Title',
  'System.Description',
  'System.Tags',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.TCM.SystemInfo',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
] as const;

/** WIQL single-quote strings use doubled single-quotes for escapes. */
function wiqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Parse a user query — if it's a bare number (optionally prefixed with `#`),
 *  we AND a `[System.Id] = N` clause OR'd with the text matches, so entering
 *  a work-item id jumps straight to that card. */
function parseIdQuery(q: string): number | null {
  const m = q.trim().match(/^#?(\d{1,10})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function buildWiql(
  query: string,
  scopeClause: string | null,
  fields: readonly string[],
): string {
  const q = wiqlEscape(query);
  const idMatch = parseIdQuery(query);

  // OR together every `[field] CONTAINS 'q'` we have. Title is guaranteed
  // present; the rest depend on the filtered candidate list.
  const textParts = fields.map((f) => `[${f}] CONTAINS '${q}'`);
  if (idMatch != null) textParts.push(`[System.Id] = ${idMatch}`);
  const textClause = `(${textParts.join(' OR ')})`;

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
  const orgFields = useOrgFields();

  const debouncedQuery = useDebounced(rawQuery.trim(), DEBOUNCE_MS);
  const canRun = enabled && debouncedQuery.length >= MIN_QUERY_LEN;

  // Which candidate text fields actually exist in this org — anything not in
  // the org-field registry would make WIQL 400. Title is universal so we
  // always include it even if the registry hasn't loaded yet (the first
  // keystroke would otherwise fire a query with no text clause and match
  // everything).
  const availableFields = useMemo<readonly string[]>(() => {
    const byRef = orgFields.data?.byRef;
    if (!byRef) return ['System.Title'];
    const filtered = SEARCH_TEXT_FIELDS.filter((f) => byRef.has(f));
    return filtered.length > 0 ? filtered : ['System.Title'];
  }, [orgFields.data]);

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
        // Bake the available-field list into the key: when orgFields finally
        // lands and widens the field set from ['System.Title'] to the full
        // list, the cached result under the narrower key stays but a fresh
        // broader search runs under the new key.
        availableFields.join(','),
      ] as const,
    [
      scope,
      debouncedQuery,
      projectId,
      context.iterationPath,
      teamAreaQuery.data?.defaultValue,
      availableFields,
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

      const wiql = buildWiql(debouncedQuery, scopeClause, availableFields);
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

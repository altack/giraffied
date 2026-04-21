import { useSettings, getOrgUrl } from '@/state/settings.store';

export interface AdoRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  contentType?: 'application/json' | 'application/json-patch+json';
  apiVersion?: string;
  signal?: AbortSignal;
  /** If provided, overrides the stored org/pat (used during onboarding before persist) */
  override?: { org: string; pat: string };
}

export class AdoError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string,
  ) {
    super(`ADO ${status} ${statusText}: ${body.slice(0, 200)}`);
    this.name = 'AdoError';
  }
}

export async function adoRaw(opts: AdoRequestOptions): Promise<Response> {
  const settings = useSettings.getState();
  const org = opts.override?.org ?? settings.org;
  const pat = opts.override?.pat ?? settings.pat;
  if (!org || !pat) throw new Error('Not authenticated');

  const orgUrl = opts.override
    ? `https://dev.azure.com/${encodeURIComponent(opts.override.org)}`
    : getOrgUrl(settings);
  if (!orgUrl) throw new Error('No org URL configured');

  const apiVersion = opts.apiVersion ?? '7.1';
  const sep = opts.path.includes('?') ? '&' : '?';
  const url = `${orgUrl}${opts.path}${sep}api-version=${apiVersion}`;

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(':' + pat)}`,
    Accept: 'application/json',
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = opts.contentType ?? 'application/json';
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AdoError(res.status, res.statusText, body);
  }
  return res;
}

export async function ado<T>(opts: AdoRequestOptions): Promise<T> {
  const res = await adoRaw(opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Fetches a paginated Azure DevOps collection endpoint to exhaustion,
 * following the `x-ms-continuationtoken` response header. Returns the
 * flattened `value` array across all pages.
 */
export async function adoPaged<T>(opts: AdoRequestOptions): Promise<T[]> {
  const all: T[] = [];
  let token: string | undefined;
  // Safety cap to avoid runaway loops if ADO misbehaves.
  const MAX_PAGES = 50;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = opts.path.includes('?') ? '&' : '?';
    const path = token
      ? `${opts.path}${sep}continuationToken=${encodeURIComponent(token)}`
      : opts.path;
    const res = await adoRaw({ ...opts, path });
    const body = (await res.json()) as { value: T[] };
    all.push(...body.value);
    token = res.headers.get('x-ms-continuationtoken') ?? undefined;
    if (!token) return all;
  }
  return all;
}

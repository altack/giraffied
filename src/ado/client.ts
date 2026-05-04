import { useSettings, getOrgUrl } from '@/state/settings.store';

export interface AdoRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  contentType?:
    | 'application/json'
    | 'application/json-patch+json'
    | 'application/octet-stream';
  /** When true, send `body` as-is (must be a BodyInit value: Blob, ArrayBuffer,
   *  FormData, etc.) without JSON.stringify. Used by attachment uploads. */
  rawBody?: boolean;
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
    body:
      opts.body === undefined
        ? undefined
        : opts.rawBody
          ? (opts.body as BodyInit)
          : JSON.stringify(opts.body),
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

/** Fetch an absolute ADO URL with the stored PAT and return its body as a Blob.
 *
 *  Used to load attachment images/videos embedded in rich-text fields
 *  *without* relying on the user's dev.azure.com session cookie — which is
 *  the path `<img>` and `<video>` elements take by default and which fails
 *  silently whenever the cookie has expired (the symptom: a broken image
 *  in the description even though everything else in the modal works).
 *
 *  **`credentials: 'omit'` is load-bearing.** When the user has stale
 *  dev.azure.com cookies in this profile (expired, partial, or for a
 *  different tenant) ADO short-circuits the attachment endpoint with a
 *  302 → `spsprodweu2.vssps.visualstudio.com/_signin?…` *before* it
 *  evaluates the `Authorization` header. fetch follows the redirect, the
 *  sign-in page returns 500, and Chromium starts throttling the redirect
 *  chain. Telling fetch not to send cookies at all forces ADO to
 *  authenticate via the PAT we put in the header — which is the path
 *  every other API call in the app already takes.
 *
 *  Caller is responsible for `URL.createObjectURL` / `URL.revokeObjectURL`
 *  lifecycle. */
export async function fetchAuthedBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const { pat } = useSettings.getState();
  if (!pat) throw new Error('Not authenticated');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${btoa(':' + pat)}`,
      // image/* covers png/jpg/webp/etc; video/* covers mp4/webm/etc.
      // application/octet-stream is the catch-all ADO falls back to.
      Accept: 'image/*,video/*,application/octet-stream;q=0.9,*/*;q=0.5',
    },
    credentials: 'omit',
    // Surface server errors as our own AdoError instead of fetch silently
    // following a 302 → sign-in chain that ends in throttling. We only
    // expect 200s on this endpoint when authenticated correctly.
    redirect: 'follow',
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AdoError(res.status, res.statusText, body);
  }
  return res.blob();
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

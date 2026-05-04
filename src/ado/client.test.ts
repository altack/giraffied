import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdoError, ado, adoPaged, adoRaw } from './client';
import { useSettings } from '@/state/settings.store';

/**
 * Credential setup: the client reads org/pat from the persisted settings store.
 * We seed via setCredentials and reset between tests so each scenario starts
 * from a known authenticated state.
 */
function seedCredentials() {
  useSettings.getState().setCredentials('myorg', 'pat-token');
}

function mockFetchOnce(...responses: Response[]): ReturnType<typeof vi.fn> {
  const queue = [...responses];
  const fetchMock = vi.fn(async () => {
    const res = queue.shift();
    if (!res) throw new Error('mockFetchOnce: no more queued responses');
    return res;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, init?: ResponseInit & { headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
}

describe('ado client', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    seedCredentials();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('adoRaw', () => {
    it('throws when not authenticated', async () => {
      useSettings.getState().reset();
      await expect(adoRaw({ path: '/_apis/projects' })).rejects.toThrow(/not authenticated/i);
    });

    it('builds the URL with the org and api-version, sets Basic auth header', async () => {
      const fetchMock = mockFetchOnce(jsonResponse({ value: [] }));
      await adoRaw({ path: '/_apis/projects' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dev.azure.com/myorg/_apis/projects?api-version=7.1');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${btoa(':pat-token')}`,
      );
      expect((init.headers as Record<string, string>).Accept).toBe('application/json');
      expect(init.method).toBe('GET');
    });

    it('appends api-version with `&` when path already has a query string', async () => {
      const fetchMock = mockFetchOnce(jsonResponse({}));
      await adoRaw({ path: '/_apis/projects?$top=10' });
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('https://dev.azure.com/myorg/_apis/projects?$top=10&api-version=7.1');
    });

    it('uses a custom api-version when supplied', async () => {
      const fetchMock = mockFetchOnce(jsonResponse({}));
      await adoRaw({ path: '/work/taskboardcolumns', apiVersion: '7.1-preview.1' });
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('api-version=7.1-preview.1');
    });

    it('JSON-stringifies the body and sets Content-Type when body is provided', async () => {
      const fetchMock = mockFetchOnce(jsonResponse({}));
      await adoRaw({
        path: '/_apis/wit/workitemsbatch',
        method: 'POST',
        body: { ids: [1, 2] },
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{"ids":[1,2]}');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('passes raw body through unchanged when rawBody is true', async () => {
      const fetchMock = mockFetchOnce(jsonResponse({}));
      const blob = new Blob(['hello']);
      await adoRaw({
        path: '/_apis/wit/attachments',
        method: 'POST',
        body: blob,
        rawBody: true,
        contentType: 'application/octet-stream',
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBe(blob);
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/octet-stream',
      );
    });

    it('uses override.org/pat instead of stored credentials when supplied (onboarding flow)', async () => {
      useSettings.getState().reset();
      const fetchMock = mockFetchOnce(jsonResponse({ value: [] }));
      await adoRaw({
        path: '/_apis/projects',
        override: { org: 'other-org', pat: 'other-pat' },
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url.startsWith('https://dev.azure.com/other-org')).toBe(true);
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${btoa(':other-pat')}`,
      );
    });

    it('throws AdoError on a non-ok response with status, statusText, and body', async () => {
      mockFetchOnce(
        new Response('boom: things went wrong', {
          status: 400,
          statusText: 'Bad Request',
        }),
      );
      const error = await adoRaw({ path: '/whatever' }).catch((e) => e);
      expect(error).toBeInstanceOf(AdoError);
      expect((error as AdoError).status).toBe(400);
      expect((error as AdoError).statusText).toBe('Bad Request');
      expect((error as AdoError).body).toBe('boom: things went wrong');
      expect((error as AdoError).message).toMatch(/ADO 400 Bad Request/);
    });
  });

  describe('ado<T>', () => {
    it('returns parsed JSON on success', async () => {
      mockFetchOnce(jsonResponse({ id: 'abc', name: 'Project' }));
      const data = await ado<{ id: string; name: string }>({ path: '/p' });
      expect(data).toEqual({ id: 'abc', name: 'Project' });
    });

    it('returns undefined for 204 No Content', async () => {
      mockFetchOnce(new Response(null, { status: 204 }));
      const data = await ado({ path: '/p' });
      expect(data).toBeUndefined();
    });
  });

  describe('adoPaged', () => {
    it('flattens a single-page result with no continuation token', async () => {
      mockFetchOnce(jsonResponse({ value: [{ id: 1 }, { id: 2 }] }));
      const out = await adoPaged<{ id: number }>({ path: '/_apis/projects' });
      expect(out).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('follows x-ms-continuationtoken across pages and stops when missing', async () => {
      const fetchMock = mockFetchOnce(
        jsonResponse(
          { value: [{ id: 1 }, { id: 2 }] },
          { headers: { 'x-ms-continuationtoken': 'token-A' } },
        ),
        jsonResponse(
          { value: [{ id: 3 }] },
          { headers: { 'x-ms-continuationtoken': 'token-B' } },
        ),
        jsonResponse({ value: [{ id: 4 }] }),
      );

      const out = await adoPaged<{ id: number }>({ path: '/_apis/projects' });

      expect(out).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls[0]).toBe('https://dev.azure.com/myorg/_apis/projects?api-version=7.1');
      expect(urls[1]).toContain('continuationToken=token-A');
      expect(urls[2]).toContain('continuationToken=token-B');
    });

    it('url-encodes the continuation token', async () => {
      const fetchMock = mockFetchOnce(
        jsonResponse(
          { value: [] },
          { headers: { 'x-ms-continuationtoken': 'a b/c+d' } },
        ),
        jsonResponse({ value: [] }),
      );
      await adoPaged({ path: '/_apis/projects' });
      const secondUrl = fetchMock.mock.calls[1][0] as string;
      expect(secondUrl).toContain(`continuationToken=${encodeURIComponent('a b/c+d')}`);
    });

    it('uses & when the path already has a query string when appending the token', async () => {
      const fetchMock = mockFetchOnce(
        jsonResponse(
          { value: [] },
          { headers: { 'x-ms-continuationtoken': 'tok' } },
        ),
        jsonResponse({ value: [] }),
      );
      await adoPaged({ path: '/_apis/projects?$top=5' });
      const secondUrl = fetchMock.mock.calls[1][0] as string;
      // Two query separators: one for $top (already there), one for our continuation hand-off.
      expect(secondUrl).toContain('$top=5&continuationToken=tok');
    });
  });
});

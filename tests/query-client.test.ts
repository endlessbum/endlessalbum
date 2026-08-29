import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { csrfFetch, csrfUploadFetch, apiRequest, getQueryFn } from '@/lib/queryClient';

const CSRF_TOKEN = 'test-csrf-token';

function mockFetchWith(routeHandler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/csrf-token')) {
      return new Response(JSON.stringify({ csrfToken: CSRF_TOKEN }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return routeHandler(urlStr, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('csrfFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = mockFetchWith(() => jsonResponse({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects X-CSRF-Token only for mutating methods', async () => {
    await csrfFetch('/api/x', { method: 'GET' });
    const getCall = fetchMock.mock.calls[0];
    expect((getCall[1] as RequestInit).headers).not.toHaveProperty('X-CSRF-Token');

    await csrfFetch('/api/x', { method: 'POST', body: '{}' });
    const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit).method === 'POST');
    const headers = new Headers((postCall![1] as RequestInit).headers);
    expect(headers.get('X-CSRF-Token')).toBe(CSRF_TOKEN);
  });

  it('sets Content-Type to application/json only when the body is a string', async () => {
    await csrfFetch('/api/x', { method: 'POST', body: '{"a":1}' });
    const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit).method === 'POST');
    const headers = new Headers((postCall![1] as RequestInit).headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('defaults to credentials include', async () => {
    await csrfFetch('/api/x', { method: 'GET' });
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include');
  });
});

describe('csrfUploadFetch (FormData)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = mockFetchWith(() => jsonResponse({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the CSRF header but leaves Content-Type to the browser (multipart boundary)', async () => {
    await csrfUploadFetch('/api/upload', 'POST', new FormData());
    const call = fetchMock.mock.calls[0];
    const headers = new Headers((call[1] as RequestInit).headers);
    expect(headers.get('X-CSRF-Token')).toBe(CSRF_TOKEN);
    expect(headers.get('Content-Type')).toBeNull();
  });
});

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the response for 2xx', async () => {
    mockFetchWith(() => jsonResponse({ id: 1 }));
    const res = await apiRequest('/api/counters', 'POST', { name: 'x' });
    expect(res.status).toBe(200);
  });

  it('rejects with "<status>: <statusText>" for errors', async () => {
    mockFetchWith(() => new Response('', { status: 400, statusText: 'Bad Request' }));
    await expect(apiRequest('/api/counters', 'POST', {})).rejects.toThrow('400: Bad Request');
  });
});

describe('getQueryFn', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ctx = { queryKey: ['/api/counters'] } as any;

  it('returns null on 401 when on401 is returnNull', async () => {
    mockFetchWith(() => new Response('', { status: 401 }));
    const result = await getQueryFn({ on401: 'returnNull' })(ctx);
    expect(result).toBeNull();
  });

  it('throws on 401 when on401 is throw', async () => {
    mockFetchWith(() => new Response('', { status: 401, statusText: 'Unauthorized' }));
    await expect(getQueryFn({ on401: 'throw' })(ctx)).rejects.toThrow('401: Unauthorized');
  });

  it('parses the JSON body on success', async () => {
    mockFetchWith(() => jsonResponse([{ id: 'c1' }]));
    const result = await getQueryFn({ on401: 'returnNull' })(ctx);
    expect(result).toEqual([{ id: 'c1' }]);
  });
});

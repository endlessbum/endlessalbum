import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

let csrfTokenCache: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const res = await fetch("/api/csrf-token", {
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to get CSRF token: ${res.status}`);
  }

  const data = await res.json();
  if (typeof data?.csrfToken !== "string" || data.csrfToken.length === 0) {
    throw new Error("Invalid CSRF token response");
  }

  csrfTokenCache = data.csrfToken;
  return data.csrfToken;
}

function isMutatingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

async function buildHeaders(method: string, hasJsonBody: boolean, headers?: HeadersInit): Promise<Headers> {
  const result = new Headers(headers);

  if (hasJsonBody && !result.has("Content-Type")) {
    result.set("Content-Type", "application/json");
  }

  if (isMutatingMethod(method)) {
    result.set("X-CSRF-Token", await getCsrfToken());
  }

  return result;
}

export async function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = init.method || "GET";
  const headers = await buildHeaders(method, typeof init.body === "string", init.headers);

  return fetch(input, {
    ...init,
    method,
    headers,
    credentials: init.credentials ?? "include",
  });
}

export async function csrfUploadFetch(url: string, method: string, body: FormData): Promise<Response> {
  const headers = await buildHeaders(method, false);

  return fetch(url, {
    method,
    body,
    headers,
    credentials: "include",
  });
}

export async function attachCsrfHeader(xhr: XMLHttpRequest): Promise<void> {
  xhr.setRequestHeader("X-CSRF-Token", await getCsrfToken());
}

async function throwIfResNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    if (res.status >= 500) {
      const text = (await res.text()) || res.statusText;
      let message = text;
      try {
        const json = JSON.parse(text);
        if (json?.message) message = json.message;
      } catch {}
      toast({ title: `Ошибка сервера (${res.status})`, description: message, variant: "destructive" });
    }
    throw new Error(`${res.status}: ${res.statusText}`);
  }
}

export async function apiRequest(
  url: string,
  method: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await csrfFetch(url, {
    method,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await csrfFetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated") {
    const { query } = event;
    if (query.state.status === "error" && query.state.error) {
      toast({
        title: "Ошибка запроса",
        description: query.state.error.message || "Не удалось загрузить данные",
        variant: "destructive",
      });
    }
  }
});

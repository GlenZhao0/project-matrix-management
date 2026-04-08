const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body = options.body;

  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (body && typeof body !== 'string') {
      body = JSON.stringify(body);
    }
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

export const apiClient = {
  get: <T>(url: string) => request<T>(url),
  post: <T, U>(url: string, data: U) =>
    request<T>(url, { method: 'POST', body: data as any }),
  request: <T>(url: string, options: RequestInit) => request<T>(url, options),
};

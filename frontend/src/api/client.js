function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Thin fetch wrapper: always sends cookies, attaches the CSRF header on
 * unsafe methods (Django's session-authenticated CSRF check applies to
 * every mutating call once a session exists), and JSON-encodes plain
 * object bodies. FormData bodies (receipt uploads) are passed through
 * untouched so the browser sets its own multipart Content-Type/boundary.
 */
export async function apiFetch(path, { method = 'GET', body, headers = {}, ...rest } = {}) {
  const finalHeaders = { ...headers };
  if (UNSAFE_METHODS.has(method.toUpperCase())) {
    finalHeaders['X-CSRFToken'] = getCookie('csrftoken') || '';
  }

  let finalBody = body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    finalHeaders['Content-Type'] = 'application/json';
    finalBody = JSON.stringify(body);
  }

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: finalHeaders,
    body: finalBody,
    ...rest,
  });
  return response;
}

/** Same as apiFetch, but throws with the server's error detail on failure
 * and returns parsed JSON on success — for the common case where the
 * caller just wants the data or a clear error message. */
export async function apiJson(path, options) {
  const response = await apiFetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const detail = (data && (data.detail || JSON.stringify(data))) || response.statusText;
    throw new ApiError(detail, response.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export { getCookie };

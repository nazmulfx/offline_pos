/**
 * call.ts — Frappe API caller (doppio-independent)
 * Calls /api/method/<method> via fetch.
 * Handles CSRF, auth errors, and Frappe error format.
 */

import router from '../router';

interface CallOptions {
  /** If true, skip the automatic redirect to Login on 401/403.
   *  Use for background operations like sync that handle auth errors themselves. */
  skipAuthRedirect?: boolean;
}

export default async function call(
  method: string,
  args?: Record<string, any>,
  options: CallOptions = {}
): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  };

  // Attach CSRF token if available (set by Frappe on page load)
  const csrfToken = (window as any).csrf_token;
  if (csrfToken && csrfToken !== '{{ csrf_token }}') {
    headers['X-Frappe-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args || {}),
    credentials: 'include',
  });

  if (res.ok) {
    // Update CSRF token from response headers if Frappe sends a fresh one
    const newCsrf = res.headers.get('X-Frappe-CSRF-Token');
    if (newCsrf) (window as any).csrf_token = newCsrf;

    const data = await res.json();
    // frappe.client.* calls return data.message
    // login returns data directly
    if (data.docs || method === 'login') {
      return data;
    }
    return data.message;
  }

  // Error handling — parse Frappe error format
  let errorBody: any = {};
  try {
    errorBody = await res.json();
  } catch {
    errorBody = { _error_message: 'Internal Server Error' };
  }

  const errorParts = [
    [method, errorBody.exc_type, errorBody._error_message].filter(Boolean).join(' '),
  ];

  let exception = errorBody.exc;
  if (exception) {
    try {
      exception = JSON.parse(exception)[0];
    } catch { /* ignore */ }
    errorParts.push(exception);
  }

  const err: any = new Error(errorParts.join('\n'));
  err.exc_type = errorBody.exc_type;
  err.exc = exception;
  err.status = res.status;
  err.messages = errorBody._server_messages
    ? JSON.parse(errorBody._server_messages)
    : [];
  err.messages = err.messages.concat(errorBody.message);
  err.messages = err.messages
    .map((m: any) => {
      try { return JSON.parse(m).message; } catch { return m; }
    })
    .filter(Boolean);

  if (!err.messages.length) {
    err.messages = errorBody._error_message
      ? [errorBody._error_message]
      : ['Internal Server Error'];
  }

  // Redirect to login on 401/403 — but NOT during background sync
  if (!options.skipAuthRedirect && [401, 403].includes(res.status)) {
    const currentRoute = router.currentRoute.value;
    if (currentRoute.name !== 'Login') {
      router.push({ name: 'Login' });
    }
  }

  throw err;
}

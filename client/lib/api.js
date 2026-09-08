/**
 * Thin fetch wrapper for one demo seat.
 *
 * The seat header only chooses which session cookie jar the server should read.
 * It grants nothing: the server decides the role from its own session record.
 */
export function createApi(seat) {
  let csrfToken = '';

  async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const headers = { 'X-Fleet-Seat': seat };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrfToken;
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const error = new Error(payload?.error ?? `Request failed (${res.status})`);
      error.status = res.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    seat,
    get csrfToken() {
      return csrfToken;
    },
    async session() {
      const data = await request('/session');
      csrfToken = data.csrfToken;
      return data;
    },
    async signIn(username, password) {
      const data = await request('/session/login', { method: 'POST', body: { username, password } });
      csrfToken = data.csrfToken;
      return data.user;
    },
    async signOut() {
      await request('/session/logout', { method: 'POST', body: {} });
      csrfToken = '';
    },
    reference: () => request('/reference'),
    autocomplete: (query, city) =>
      request(`/locations/autocomplete?q=${encodeURIComponent(query)}${city ? `&city=${encodeURIComponent(city)}` : ''}`),
    searchUK: (query, city) =>
      request(`/locations/search?q=${encodeURIComponent(query)}${city ? `&city=${encodeURIComponent(city)}` : ''}`),
    location: (id) => request(`/bookings/${id}/location`),
    sendLocation: (id,body) => request(`/bookings/${id}/location`,{method:'POST',body}),
    state: () => request('/state'),
    booking: (id) => request(`/bookings/${id}`),
    // Live flight status for one airport booking. Read-only.
    flight: (id) => request(`/bookings/${id}/flight`),
    notifications: () => request('/notifications'),
    createBooking: (input, idempotencyKey) =>
      request('/bookings', { method: 'POST', body: input, idempotencyKey }),
    act: (id, action) =>
      request(`/bookings/${id}/actions`, {
        method: 'POST',
        body: { key: crypto.randomUUID(), ...action },
      }),
    setDuty: (duty) => request('/driver/duty', { method: 'POST', body: { duty } }),
    // Returns a draft form only. Booking still goes through createBooking.
    assistantDraft: (message, draft) =>
      request('/assistant/draft', { method: 'POST', body: { message, draft } }),
    askFleet: (message, bookingReference) =>
      request('/assistant/ask', { method: 'POST', body: { message, ...(bookingReference ? { bookingReference } : {}) } }),
  };
}

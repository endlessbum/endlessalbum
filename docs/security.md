# Security

## CSRF protection

The server uses layered CSRF protection for mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`):

1. Origin or referer must match the current host.
2. A per-session CSRF token is stored in the session.
3. The same token is exposed via a `csrf-token` cookie.
4. The client must send the token in the `X-CSRF-Token` header.
5. The request is accepted only if session token, cookie token, and header token all match.

## Client integration

- `GET /api/csrf-token` returns `{ csrfToken }`.
- `apiRequest()` automatically attaches the CSRF header for mutating JSON requests.
- `csrfFetch()` is available for custom `fetch()` calls.
- `csrfUploadFetch()` and `attachCsrfHeader()` are available for uploads and XHR requests.

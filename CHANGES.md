# ShopAdmin — Authorization Audit

## The Gap

The backend role check is missing from `backend/routes/products.js` on the four write routes: `POST /api/products` (line 58), `PUT /api/products/:id` (line 88), `DELETE /api/products/:id` (line 123), and `PATCH /api/products/:id/publish` (line 149). Each route runs `verifyToken` but no authorization middleware, so any valid customer JWT is accepted and the handler executes.

The frontend only hides the controls in `frontend/src/components/ProductActions.jsx` with `if (user?.role !== 'admin') { return null; }` at lines 19–22. That presentation decision does not protect a directly addressed API endpoint.

## Before — Bypass Proof

The app was seeded with the supplied customer account, and the customer token was used directly against both admin-only endpoints. The token value is intentionally omitted from this document.

### Customer login

```bash
curl -X POST http://localhost:3001/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"customer@shopadmin.com","password":"password123"}'
```

### Customer DELETE request

```bash
curl -X DELETE http://localhost:3001/api/products/cmt1bs9b20006rxmxjhlvbre8 \\
  -H 'Authorization: Bearer YOUR_CUSTOMER_TOKEN_HERE'
```

Response: **HTTP 200 OK**

```json
{"success":true,"message":"Product deleted","deleted":{"id":"cmt1bs9b20006rxmxjhlvbre8","name":"Merino Wool Running Socks (3-Pack)"}}
```

### Customer publish request

```bash
curl -X PATCH http://localhost:3001/api/products/cmt1bs9b10005rxmxdaonga4i/publish \\
  -H 'Authorization: Bearer YOUR_CUSTOMER_TOKEN_HERE'
```

Response: **HTTP 200 OK**

```json
{"id":"cmt1bs9b10005rxmxdaonga4i","name":"Mechanical Keyboard — Compact 75%","description":"Hot-swappable switches, RGB backlight, and aluminium frame. Not yet released.","price":139,"category":"Electronics","published":true,"createdAt":"2026-08-20T09:35:58.237Z","updatedAt":"2026-08-20T09:35:58.392Z"}
```

The customer account could also log in successfully, and the customer UI did not render Delete or Publish because `ProductActions.jsx` returned `null` for every user whose role was not `admin`. The successful 200 responses prove that the hidden controls were not backend security.

## The Fix

`backend/middleware/requireRole.js` provides reusable role-based authorization. `verifyToken` remains responsible for authenticating the JWT and populating `req.user`; `requireRole` only checks the already-authenticated role. It returns HTTP 401 when no authenticated user is available and HTTP 403 with the required roles and actual role when authorization fails.

The middleware is applied after `verifyToken` to all four protected product routes: create, update, delete, and publish. The GET routes remain authenticated-only and do not require the admin role.

## After — Protection Confirmed

The final verification results will be added after the middleware is applied:

| Request | Token | Expected result | Actual result |
|---|---|---:|---:|
| `DELETE /api/products/:id` | None | 401 | Pending fix verification |
| `DELETE /api/products/:id` | Customer | 403 | Pending fix verification |
| `DELETE /api/products/:id` | Admin | 200 | Pending fix verification |
| `GET /api/products` | None | 401 | Pending fix verification |
| `GET /api/products` | Customer | 200 | Pending fix verification |
| `GET /api/products` | Admin | 200 | Pending fix verification |

The customer 403 response must include `yourRole: "customer"`; the admin request must continue to succeed.

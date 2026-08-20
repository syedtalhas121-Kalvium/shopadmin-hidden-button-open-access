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

```js
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorised: no valid session',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden: insufficient permissions',
        required: roles,
        yourRole: req.user.role,
      });
    }

    next();
  };
}
```

The middleware is applied after `verifyToken` to all four protected product routes: `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, and `PATCH /api/products/:id/publish`. The GET routes remain authenticated-only and do not require the admin role. Authentication and authorisation are intentionally separate concerns: the first middleware proves who the caller is, and the second proves that the caller has the required role.

## After — Protection Confirmed

The same external API calls were rerun against a freshly seeded database after the fix. Customer and unauthenticated requests were rejected before the route handlers ran, while the admin request continued to work.

| Request | Token | Expected result | Actual result |
|---|---|---:|---:|
| `DELETE /api/products/:id` | None | 401 | **401** — `{"error":"No token provided"}` |
| `DELETE /api/products/:id` | Customer | 403 | **403** — `{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}` |
| `DELETE /api/products/:id` | Admin | 200 | **200** — `{"success":true,"message":"Product deleted"...}` |
| `PATCH /api/products/:id/publish` | Customer | 403 | **403** — `{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}` |
| `POST /api/products` | Customer | 403 | **403** — `{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}` |
| `PUT /api/products/:id` | Customer | 403 | **403** — `{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}` |
| `GET /api/products` | None | 401 | **401** — `{"error":"No token provided"}` |
| `GET /api/products` | Customer | 200 | **200** — product list returned |
| `GET /api/products` | Admin | 200 | **200** — product list returned |

The required customer DELETE proof can be reproduced with:

```bash
curl -i -X DELETE http://localhost:3001/api/products/cmt1buau80006wb8tssdw9t3h \\
  -H 'Authorization: Bearer YOUR_CUSTOMER_TOKEN_HERE'
```

```http
HTTP/1.1 403 Forbidden
```

```json
{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}
```

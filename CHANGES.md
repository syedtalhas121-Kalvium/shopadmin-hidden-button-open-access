# ShopAdmin — Authorization Audit

## The Gap

The backend role check was missing from `backend/routes/products.js` on the four write routes: `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, and `PATCH /api/products/:id/publish`. Each route ran `verifyToken` but no authorization middleware, so any valid customer JWT was accepted and the handler executed. A valid customer token was sufficient because authentication proved only that the caller had a valid session; it did not prove that the caller had the `admin` role.

The frontend only hides the controls in `frontend/src/components/ProductActions.jsx`:

```jsx
if (user?.role !== 'admin') {
  return null;
}
```

This presentation decision does not protect a directly addressed API endpoint.

## Before — Bypass Proof

The before-proof was committed before the authorization implementation in the submitted branch as:

```text
proof: document customer bypass of admin endpoints before fix
```

With the original routes, the seeded customer account received successful responses from both admin-only endpoints.

### Customer login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@shopadmin.com","password":"password123"}'
```

The response included a customer JWT. The token value is omitted here.

### Customer DELETE request

```bash
curl -X DELETE http://localhost:3001/api/products/cmt1bs9b20006rxmxjhlvbre8 \
  -H 'Authorization: Bearer YOUR_CUSTOMER_TOKEN_HERE'
```

Response: **HTTP 200 OK**

```json
{"success":true,"message":"Product deleted","deleted":{"id":"cmt1bs9b20006rxmxjhlvbre8","name":"Merino Wool Running Socks (3-Pack)"}}
```

### Customer publish request

```bash
curl -X PATCH http://localhost:3001/api/products/cmt1bs9b10005rxmxdaonga4i/publish \
  -H 'Authorization: Bearer YOUR_CUSTOMER_TOKEN_HERE'
```

Response: **HTTP 200 OK**

```json
{"id":"cmt1bs9b10005rxmxdaonga4i","name":"Mechanical Keyboard — Compact 75%","description":"Hot-swappable switches, RGB backlight, and aluminium frame. Not yet released.","price":139,"category":"Electronics","published":true,"createdAt":"2026-08-20T09:35:58.237Z","updatedAt":"2026-08-20T09:35:58.392Z"}
```

The customer UI did not render Delete or Publish because `ProductActions.jsx` returned `null` for every user whose role was not `admin`. The successful 200 responses prove that the hidden controls were not backend security.

## The Fix

`backend/middleware/requireRole.js` provides reusable role-based authorization. `verifyToken` remains responsible for authenticating the JWT and populating `req.user`; `requireRole` only checks the already-authenticated role and does not re-verify the JWT.

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

The middleware is applied after `verifyToken` to all four protected product routes:

```js
router.post('/', verifyToken, requireRole('admin'), handler);
router.put('/:id', verifyToken, requireRole('admin'), handler);
router.delete('/:id', verifyToken, requireRole('admin'), handler);
router.patch('/:id/publish', verifyToken, requireRole('admin'), handler);
```

The GET routes remain authenticated-only and do not require the admin role.

## After — Protection Confirmed

These results were run against the seeded local backend after the fix. Product IDs are from that seeded run; tokens are omitted.

### Customer token → DELETE returns 403

```bash
curl -i -X DELETE http://localhost:3001/api/products/cmwdba8ge0006vgiopdtzlt3w \
  -H 'Authorization: Bearer CUSTOMER_TOKEN'
```

```text
HTTP/1.1 403 Forbidden
```

```json
{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}
```

### Customer token → PATCH publish returns 403

```bash
curl -i -X PATCH http://localhost:3001/api/products/cmwdba8gc0005vgiogu740urf/publish \
  -H 'Authorization: Bearer CUSTOMER_TOKEN'
```

```text
HTTP/1.1 403 Forbidden
```

```json
{"error":"Forbidden: insufficient permissions","required":["admin"],"yourRole":"customer"}
```

### Admin token → DELETE returns 200

```bash
curl -i -X DELETE http://localhost:3001/api/products/cmwdba8ge0006vgiopdtzlt3w \
  -H 'Authorization: Bearer ADMIN_TOKEN'
```

```text
HTTP/1.1 200 OK
```

```json
{"success":true,"message":"Product deleted","deleted":{"id":"cmwdba8ge0006vgiopdtzlt3w","name":"Merino Wool Running Socks (3-Pack)"}}
```

### No token → DELETE returns 401

```text
HTTP/1.1 401 Unauthorized
{"error":"No token provided"}
```

### Complete protection matrix

| Request | Token | Expected | Actual |
|---|---|---:|---:|
| `DELETE /api/products/:id` | None | 401 | 401 |
| `DELETE /api/products/:id` | Customer | 403 | 403 |
| `DELETE /api/products/:id` | Admin | 200 | 200 |
| `GET /api/products` | None | 401 | 401 |
| `GET /api/products` | Customer | 200 | 200 |
| `GET /api/products` | Admin | 200 | 200 |

The implementation therefore distinguishes authentication failure (401) from insufficient role authorization (403), while preserving admin write access and customer/admin authenticated GET access.

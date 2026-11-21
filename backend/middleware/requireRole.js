/**
 * Authorisation middleware for role-protected routes.
 *
 * verifyToken runs first and is responsible for validating the JWT and setting
 * req.user. This middleware only checks whether the authenticated user's role
 * is allowed to perform the requested action.
 */
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

module.exports = { requireRole };

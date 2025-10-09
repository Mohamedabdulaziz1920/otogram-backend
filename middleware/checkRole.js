/**
 * Middleware for role-based authorization.
 * It efficiently checks if the authenticated user's role is in the list of allowed roles.
 *
 * IMPORTANT: This middleware MUST be used immediately after the `auth` middleware,
 * as it relies on `req.user` which is populated by `auth`.
 * It does NOT make any database calls, making it very fast.
 *
 * @param {string[]} allowedRoles - An array of strings representing the roles permitted to access the route.
 *                                   Example: ['creator', 'admin']
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // 1. تحقق من وجود كائن المستخدم أولاً (يجب أن يكون موجوداً بفضل `auth` middleware)
    if (!req.user || !req.user.role) {
      // هذا يعتبر خطأ في الخادم لأن `auth` يجب أن يمنع الطلب قبل الوصول إلى هنا
      console.error("checkRole middleware was called without a valid req.user object. Ensure 'auth' middleware runs first.");
      return res.status(403).json({ message: 'Access forbidden. User information is missing.' });
    }

    // 2. تحقق مما إذا كانت صلاحية المستخدم ضمن الصلاحيات المسموح بها
    const hasPermission = allowedRoles.includes(req.user.role);

    if (!hasPermission) {
      return res.status(403).json({ 
        message: 'ليس لديك الصلاحية الكافية للقيام بهذا الإجراء.',
        // يمكنك إزالة هذه التفاصيل في بيئة الإنتاج إذا أردت
        // requiredRoles: allowedRoles, 
        // userRole: req.user.role 
      });
    }

    // 3. الصلاحية صحيحة، اسمح للطلب بالمرور
    next();
  };
};

module.exports = checkRole;

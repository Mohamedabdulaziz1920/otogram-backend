// ملف: middleware/isAdmin.js

const isAdmin = (req, res, next) => {
  // نفترض أن auth middleware قد تم تشغيله قبله وأرفق req.user
  if (req.user && req.user.role === 'admin') {
    next(); // المستخدم هو أدمن، اسمح له بالمرور
  } else {
    // إذا لم يكن أدمن، أرسل خطأ "Forbidden"
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};

module.exports = isAdmin;

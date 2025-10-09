const jwt = require('jsonwebtoken');
const User = require('../models/User'); // تأكد من أن مسار هذا الموديل صحيح

/**
 * Middleware for authenticating users using JWT.
 * It performs the following steps:
 * 1. Extracts the token from the 'Authorization' header.
 * 2. Verifies the token's validity.
 * 3. Fetches the complete user object from the database using the ID from the token.
 * 4. Attaches the user object to the request (`req.user`) for use in subsequent middlewares and routes.
 *
 * This consolidated approach prevents multiple database queries for the same user within a single request lifecycle.
 */
const auth = async (req, res, next) => {
  // 1. تحقق من وجود JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET is not defined.');
    return res.status(500).json({ error: 'Internal server configuration error.' });
  }

  // 2. استخراج التوكن من الهيدر
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.substring(7); // "Bearer ".length === 7

  try {
    // 3. التحقق من التوكن وفك تشفيره للحصول على payload
    const decodedPayload = jwt.verify(token, jwtSecret);
    
    // 4. ✨ التحسين الأساسي: جلب بيانات المستخدم كاملة من قاعدة البيانات
    // نستخدم decodedPayload.userId (الذي قمنا بتعيينه عند إنشاء التوكن) للبحث عن المستخدم.
    // .select('-password') يضمن عدم إرسال كلمة المرور.
    const user = await User.findById(decodedPayload.userId).select('-password');

    // 5. التحقق من وجود المستخدم في قاعدة البيانات
    if (!user) {
      return res.status(401).json({ error: 'Authentication failed. User not found.' });
    }

    // 6. إرفاق كائن المستخدم الكامل بالطلب ليكون متاحاً للجميع
    req.user = user;
    
    // (اختياري) للحفاظ على التوافق مع أي كود قديم قد يستخدم req.userId
    req.userId = user._id;

    next(); // كل شيء سليم، انتقل إلى الخطوة التالية

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access denied. Token has expired.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Access denied. Invalid token.' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed due to a server error.' });
  }
};

module.exports = auth;

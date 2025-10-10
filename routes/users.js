const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const User = require('../models/User');
const Video = require('../models/Video');
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const { uploadImageToR2, deleteImageFromR2 } = require('../config/r2');

const router = express.Router();

// --- إعداد Multer لرفع الصور إلى الذاكرة (RAM) ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الصورة غير مدعوم. يرجى استخدام JPEG, PNG, GIF أو WEBP'), false);
    }
  }
});

// ================== المسارات الخاصة بالمستخدم الحالي ==================

// ✨ جلب بيانات المستخدم الحالي
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    res.json(user);
  } catch (error) {
    console.error('❌ Error fetching current user:', error);
    res.status(500).json({ error: 'فشل جلب بيانات المستخدم' });
  }
});

// ✨ تحديث صورة البروفايل باستخدام Cloudflare R2 ✨
router.post('/me/update-profile-image', auth, upload.single('profileImage'), async (req, res) => {
  try {
    console.log('📸 Starting profile image update for user:', req.user._id);
    
    if (!req.file) {
      console.warn('⚠️ No file received in request');
      return res.status(400).json({ error: 'لم يتم استلام أي ملف صورة.' });
    }
    
    console.log('📁 File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: `${(req.file.size / 1024).toFixed(2)} KB`
    });

    // الحصول على بيانات المستخدم الحالية
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // حذف الصورة القديمة من R2 (إذا كانت موجودة)
    if (user.profileImage && user.profileImage.includes(process.env.R2_PUBLIC_URL)) {
      try {
        console.log('🗑️ Attempting to delete old profile image');
        await deleteImageFromR2(user.profileImage);
        console.log('✅ Old image deleted successfully');
      } catch (deleteError) {
        console.warn('⚠️ Could not delete old image:', deleteError.message);
        // نستمر حتى لو فشل حذف الصورة القديمة
      }
    }

    // رفع الصورة الجديدة إلى R2
    console.log('📤 Uploading new profile image to R2...');
    const uploadedImage = await uploadImageToR2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'profiles' // مجلد خاص بصور البروفايل
    );

    console.log('✅ Image uploaded to R2:', uploadedImage.url);

    // تحديث قاعدة البيانات
    user.profileImage = uploadedImage.url;
    // إزالة الحقول القديمة من GridFS إن وجدت
    if (user.profileImageFileId) {
      user.profileImageFileId = undefined;
    }
    await user.save();

    console.log('✅ User profile updated successfully');

    res.status(200).json({
      message: 'تم تحديث صورة البروفايل بنجاح',
      profileImage: user.profileImage,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        bio: user.bio,
        role: user.role
      }
    });

  } catch (error) {
    console.error('❌ Error updating profile image:', error);
    res.status(500).json({ 
      error: 'حدث خطأ أثناء تحديث صورة البروفايل',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✨ حذف صورة البروفايل
router.delete('/me/profile-image', auth, async (req, res) => {
  try {
    console.log('🗑️ Deleting profile image for user:', req.user._id);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // حذف من R2 إذا كانت محفوظة في R2
    if (user.profileImage && user.profileImage.includes(process.env.R2_PUBLIC_URL)) {
      try {
        await deleteImageFromR2(user.profileImage);
        console.log('✅ Image deleted from R2');
      } catch (error) {
        console.warn('⚠️ Error deleting from R2:', error.message);
      }
    }

    // تحديث قاعدة البيانات (استخدام الصورة الافتراضية)
    user.profileImage = '/default-avatar.png';
    user.profileImageFileId = undefined;
    await user.save();

    console.log('✅ Profile image removed successfully');

    res.json({ 
      message: 'تم حذف صورة الملف الشخصي',
      profileImage: user.profileImage,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage
      }
    });

  } catch (error) {
    console.error('❌ Error deleting profile image:', error);
    res.status(500).json({ error: 'فشل حذف صورة الملف الشخصي' });
  }
});

// جلب الفيديوهات المعجب بها
router.get('/me/liked-videos', auth, async (req, res) => {
  try {
    console.log('💖 Fetching liked videos for user:', req.user._id);
    
    const likedVideos = await Video.find({ likes: req.user._id })
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        populate: { path: 'user', select: 'username profileImage' }
      })
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`✅ Found ${likedVideos.length} liked videos`);
    
    res.json(likedVideos);
  } catch (error) {
    console.error('❌ Error fetching liked videos:', error);
    res.status(500).json({ error: 'فشل في جلب الفيديوهات المعجب بها' });
  }
});

// جلب الفيديوهات المحفوظة
router.get('/me/saved-videos', auth, async (req, res) => {
  try {
    console.log('🔖 Fetching saved videos for user:', req.user._id);
    
    const savedVideos = await Video.find({ saved: req.user._id })
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        populate: { path: 'user', select: 'username profileImage' }
      })
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`✅ Found ${savedVideos.length} saved videos`);
    
    res.json(savedVideos);
  } catch (error) {
    console.error('❌ Error fetching saved videos:', error);
    res.status(500).json({ error: 'فشل في جلب الفيديوهات المحفوظة' });
  }
});

// تحديث اسم المستخدم
router.patch('/me/update-username', auth, async (req, res) => {
  try {
    const { username } = req.body;
    
    console.log('📝 Updating username for user:', req.user._id, 'to:', username);
    
    // Validation
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }
    
    const trimmedUsername = username.trim();
    
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    }
    
    if (trimmedUsername.length > 30) {
      return res.status(400).json({ error: 'اسم المستخدم يجب ألا يتجاوز 30 حرف' });
    }
    
    // التحقق من الأحرف المسموحة
    const usernameRegex = /^[a-zA-Z0-9_\u0600-\u06FF]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return res.status(400).json({ 
        error: 'اسم المستخدم يجب أن يحتوي على أحرف وأرقام فقط' 
      });
    }
    
    // التحقق من عدم وجود اسم مستخدم مكرر
    const existingUser = await User.findOne({ 
      username: trimmedUsername,
      _id: { $ne: req.user._id }
    });
    
    if (existingUser) {
      console.warn('⚠️ Username already taken:', trimmedUsername);
      return res.status(409).json({ error: 'اسم المستخدم محجوز بالفعل' });
    }
    
    // تحديث اسم المستخدم
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { username: trimmedUsername },
      { new: true, runValidators: true }
    ).select('-password');
    
    console.log('✅ Username updated successfully');
    
    res.json({ 
      message: 'تم تحديث اسم المستخدم بنجاح',
      username: updatedUser.username,
      user: updatedUser
    });
    
  } catch (error) {
    console.error('❌ Error updating username:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ error: 'اسم المستخدم محجوز بالفعل' });
    }
    
    res.status(500).json({ error: 'فشل تحديث اسم المستخدم' });
  }
});

// تحديث البايو
router.patch('/me/update-bio', auth, async (req, res) => {
  try {
    const { bio } = req.body;
    
    console.log('📝 Updating bio for user:', req.user._id);
    
    if (bio && bio.length > 150) {
      return res.status(400).json({ error: 'البايو يجب ألا يتجاوز 150 حرف' });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { bio: bio || '' },
      { new: true }
    ).select('-password');
    
    console.log('✅ Bio updated successfully');
    
    res.json({
      message: 'تم تحديث البايو بنجاح',
      bio: updatedUser.bio,
      user: updatedUser
    });
    
  } catch (error) {
    console.error('❌ Error updating bio:', error);
    res.status(500).json({ error: 'فشل تحديث البايو' });
  }
});

// ================== مسارات الأدمن ==================

// جلب جميع المستخدمين
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    console.log('👥 Admin fetching all users');
    
    const { 
      page = 1, 
      limit = 100, 
      role,
      search 
    } = req.query;
    
    // بناء query
    const query = {};
    
    if (role && ['user', 'creator', 'admin'].includes(role)) {
      query.role = role;
    }
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // جلب المستخدمين مع pagination
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();
    
    // عد إجمالي المستخدمين
    const total = await User.countDocuments(query);
    
    console.log(`✅ Found ${users.length} users (Total: ${total})`);
    
    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'فشل جلب المستخدمين' });
  }
});

// تحديث دور المستخدم
router.patch('/role/:userId', auth, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    console.log('👑 Admin updating user role:', userId, 'to:', role);
    
    // Validation
    if (!['user', 'creator', 'admin'].includes(role)) {
      return res.status(400).json({ 
        error: 'الدور غير صالح. استخدم: user, creator, أو admin' 
      });
    }
    
    // التحقق من وجود المستخدم
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // منع تغيير دور المستخدم نفسه
    if (userId === req.user._id.toString()) {
      return res.status(403).json({ error: 'لا يمكنك تغيير صلاحياتك الخاصة' });
    }
    
    // تحديث الدور
    targetUser.role = role;
    await targetUser.save();
    
    console.log('✅ User role updated successfully');
    
    res.json({
      message: 'تم تحديث صلاحيات المستخدم بنجاح',
      user: {
        _id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating user role:', error);
    res.status(500).json({ error: 'فشل تحديث صلاحيات المستخدم' });
  }
});

// حذف مستخدم (Admin فقط)
router.delete('/:userId', auth, isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('🗑️ Admin deleting user:', userId);
    
    // منع حذف النفس
    if (userId === req.user._id.toString()) {
      return res.status(403).json({ error: 'لا يمكنك حذف حسابك الخاص' });
    }
    
    // التحقق من وجود المستخدم
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    // حذف صورة البروفايل من R2 إن وجدت
    if (targetUser.profileImage && targetUser.profileImage.includes(process.env.R2_PUBLIC_URL)) {
      try {
        await deleteImageFromR2(targetUser.profileImage);
        console.log('✅ Profile image deleted from R2');
      } catch (error) {
        console.warn('⚠️ Could not delete profile image:', error.message);
      }
    }
    
    // حذف جميع فيديوهات المستخدم
    const deletedVideos = await Video.deleteMany({ user: userId });
    console.log(`✅ Deleted ${deletedVideos.deletedCount} videos`);
    
    // حذف المستخدم
    await User.findByIdAndDelete(userId);
    console.log('✅ User deleted successfully');
    
    res.json({ 
      message: 'تم حذف المستخدم وجميع محتوياته بنجاح',
      deletedUserId: userId,
      deletedVideosCount: deletedVideos.deletedCount
    });
    
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ error: 'فشل حذف المستخدم' });
  }
});

// إحصائيات المستخدمين (Admin فقط)
router.get('/stats/overview', auth, isAdmin, async (req, res) => {
  try {
    console.log('📊 Admin fetching user statistics');
    
    const [
      totalUsers,
      adminCount,
      creatorCount,
      userCount,
      recentUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'creator' }),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      })
    ]);
    
    console.log('✅ Statistics fetched successfully');
    
    res.json({
      total: totalUsers,
      roles: {
        admin: adminCount,
        creator: creatorCount,
        user: userCount
      },
      recentUsers,
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({ error: 'فشل جلب الإحصائيات' });
  }
});

// ================== المسارات العامة ==================

// جلب بروفايل مستخدم عبر اسم المستخدم
router.get('/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    console.log('👤 Fetching profile for username:', username);
    
    // جلب بيانات المستخدم
    const user = await User.findOne({ username }).select('-password').lean();
    
    if (!user) {
      console.warn('⚠️ User not found:', username);
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    // جلب الفيديوهات والردود بشكل متوازي
    const [videos, replies] = await Promise.all([
      Video.find({ user: user._id, isReply: false })
        .populate('user', 'username profileImage')
        .populate({
          path: 'replies',
          populate: { path: 'user', select: 'username profileImage' }
        })
        .sort({ createdAt: -1 })
        .lean(),
      Video.find({ user: user._id, isReply: true })
        .populate('user', 'username profileImage')
        .populate('parentVideo', 'description user videoUrl thumbnail')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    // حساب الإحصائيات
    const totalLikes = videos.reduce((sum, video) => sum + (video.likes?.length || 0), 0);
    const totalViews = videos.reduce((sum, video) => sum + (video.views || 0), 0);
    const totalReplies = videos.reduce((sum, video) => sum + (video.replies?.length || 0), 0);

    console.log(`✅ Profile fetched: ${videos.length} videos, ${replies.length} replies`);

    res.json({
      user,
      videos,
      replies,
      stats: {
        videosCount: videos.length,
        repliesCount: replies.length,
        totalLikes,
        totalViews,
        totalReplies,
        followersCount: user.followers?.length || 0,
        followingCount: user.following?.length || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching profile:', error);
    res.status(500).json({ 
      error: 'حدث خطأ في الخادم',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// البحث عن المستخدمين
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;
    
    console.log('🔍 Searching users with query:', query);
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'يجب أن يكون البحث حرفين على الأقل' });
    }
    
    const users = await User.find({
      username: { $regex: query, $options: 'i' }
    })
      .select('username profileImage role bio')
      .limit(parseInt(limit))
      .lean();
    
    console.log(`✅ Found ${users.length} users`);
    
    res.json(users);
    
  } catch (error) {
    console.error('❌ Error searching users:', error);
    res.status(500).json({ error: 'فشل البحث عن المستخدمين' });
  }
});

module.exports = router;

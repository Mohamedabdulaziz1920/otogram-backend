const express = require('express');
const multer = require('multer');
const Video = require('../models/Video');
const User = require('../models/User');
const auth = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const { uploadVideoToR2, deleteVideoFromR2, deleteByKey } = require('../config/r2');

const router = express.Router();

// --- إعداد Multer: الحفظ في الذاكرة (RAM) ---
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "video/mp4", 
      "video/webm", 
      "video/quicktime", 
      "video/x-matroska", 
      "video/avi", 
      "video/mov"
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الفيديو غير مدعوم.'), false);
    }
  }
});

// --- المسارات ---

// ✅ 1. رفع فيديو أساسي إلى R2
router.post('/upload', auth, checkRole(['creator', 'admin']), upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم استلام أي ملف فيديو.' });
    }

    console.log(`📹 Uploading video for user: ${req.user.username}`);
    console.log(`📦 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // رفع إلى Cloudflare R2
    const { url, key } = await uploadVideoToR2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // حفظ في MongoDB
    const video = new Video({
      user: req.user._id,
      videoUrl: url,
      r2Key: key,
      description: req.body.description || '',
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      isReply: false,
      isPublic: true,
      isActive: true,
    });

    await video.save();

    // تحضير الاستجابة
    const videoResponse = video.toObject();
    videoResponse.user = {
      _id: req.user._id,
      username: req.user.username,
      profileImage: req.user.profileImage
    };

    console.log(`✅ Video saved to database: ${video._id}`);
    res.status(201).json({ 
      message: 'تم رفع الفيديو بنجاح', 
      video: videoResponse 
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ 
      error: error.message || 'حدث خطأ أثناء رفع الفيديو.' 
    });
  }
});

// ✅ 2. رفع فيديو كرد إلى R2
router.post('/reply/:videoId', auth, checkRole(['user', 'creator', 'admin']), upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم استلام أي ملف فيديو للرد.' });
    }

    const parentVideoId = req.params.videoId;

    // التحقق من وجود الفيديو الأصلي
    const parentVideo = await Video.findById(parentVideoId);
    if (!parentVideo) {
      return res.status(404).json({ error: 'الفيديو الأصلي غير موجود.' });
    }

    console.log(`💬 Uploading reply for video: ${parentVideoId}`);
    console.log(`📦 File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    // رفع إلى Cloudflare R2
    const { url, key } = await uploadVideoToR2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // حفظ الرد في MongoDB
    const replyVideo = new Video({
      user: req.user._id,
      videoUrl: url,
      r2Key: key,
      description: req.body.description || '',
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      isReply: true,
      parentVideo: parentVideoId,
      isPublic: true,
      isActive: true,
    });

    await replyVideo.save();

    // تحضير الاستجابة
    const replyResponse = replyVideo.toObject();
    replyResponse.user = {
      _id: req.user._id,
      username: req.user.username,
      profileImage: req.user.profileImage
    };

    console.log(`✅ Reply saved to database: ${replyVideo._id}`);
    res.status(201).json({ 
      message: 'تم إضافة الرد بنجاح', 
      video: replyResponse 
    });

  } catch (error) {
    console.error('❌ Reply upload error:', error);
    res.status(500).json({ 
      error: error.message || 'حدث خطأ أثناء رفع الرد.' 
    });
  }
});

// ✅ 3. جلب جميع الفيديوهات الرئيسية
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find({ 
      isReply: false,
      isActive: true 
    })
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        match: { isActive: true },
        populate: { path: 'user', select: 'username profileImage' }
      })
      .sort({ createdAt: -1 });
    
    // فلترة الفيديوهات التي لديها مستخدم صالح
    const validVideos = videos.filter(video => video.user);
    
    console.log(`📊 Fetched ${validVideos.length} videos`);
    res.json(validVideos);
  } catch (error) {
    console.error('❌ Fetch videos error:', error);
    res.status(500).json({ error: 'فشل في جلب الفيديوهات.' });
  }
});

// ✅ 4. جلب فيديو واحد بالتفاصيل
router.get('/:videoId', async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId)
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        match: { isActive: true },
        populate: { path: 'user', select: 'username profileImage' }
      });

    if (!video) {
      return res.status(404).json({ error: 'الفيديو غير موجود.' });
    }

    res.json(video);
  } catch (error) {
    console.error('❌ Fetch video error:', error);
    res.status(500).json({ error: 'فشل في جلب الفيديو.' });
  }
});

// ✅ 5. حذف فيديو من R2 و MongoDB
router.delete('/:videoId', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);
    
    if (!video) {
      return res.status(404).json({ error: 'لم يتم العثور على الفيديو.' });
    }

    // ✅ التحقق من الصلاحية: 3 حالات
    let canDelete = false;
    
    // 1️⃣ صاحب الفيديو/الرد نفسه
    if (video.user.toString() === req.user._id.toString()) {
      canDelete = true;
    }
    
    // 2️⃣ الأدمن يمكنه حذف أي شيء
    if (req.user.role === 'admin') {
      canDelete = true;
    }
    
    // 3️⃣ إذا كان رد، صاحب الفيديو الأصلي يمكنه حذفه
    if (video.isReply && video.parentVideo) {
      const parentVideo = await Video.findById(video.parentVideo);
      if (parentVideo && parentVideo.user.toString() === req.user._id.toString()) {
        canDelete = true;
        console.log('✅ صاحب الفيديو الأصلي يحذف رد على فيديوه');
      }
    }

    if (!canDelete) {
      return res.status(403).json({ error: 'غير مصرح لك بتنفيذ هذا الإجراء.' });
    }

    // حذف جميع الردود إذا كان فيديو أساسي
    if (!video.isReply) {
      const replies = await Video.find({ parentVideo: video._id });
      console.log(`🗑️ Found ${replies.length} replies to delete`);
      
      for (const reply of replies) {
        // حذف من R2
        if (reply.r2Key) {
          await deleteByKey(reply.r2Key);
        } else if (reply.videoUrl) {
          await deleteVideoFromR2(reply.videoUrl);
        }
        
        // حذف من MongoDB
        await reply.deleteOne();
      }
    }

    // حذف الفيديو الأصلي من R2
    if (video.r2Key) {
      await deleteByKey(video.r2Key);
    } else if (video.videoUrl) {
      await deleteVideoFromR2(video.videoUrl);
    }
    
    // حذف من MongoDB
    await video.deleteOne();
    
    console.log(`✅ Video deleted successfully: ${req.params.videoId}`);
    res.json({ message: 'تم حذف الفيديو بنجاح.' });

  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ 
      error: error.message || 'فشل في حذف الفيديو.' 
    });
  }
});

// ✅ 6. إعجاب/إلغاء إعجاب
router.post('/:id/like', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'الفيديو غير موجود.' });
    }

    const userIdString = req.user._id.toString();
    const userIndex = video.likes.map(id => id.toString()).indexOf(userIdString);
    
    if (userIndex > -1) {
      // إلغاء الإعجاب
      video.likes.splice(userIndex, 1);
      await video.save();
      
      console.log(`👎 User ${req.user.username} unliked video ${video._id}`);
      res.json({ 
        liked: false,
        likesCount: video.likes.length 
      });
    } else {
      // إضافة إعجاب
      video.likes.push(req.user._id);
      await video.save();
      
      console.log(`👍 User ${req.user.username} liked video ${video._id}`);
      res.json({ 
        liked: true,
        likesCount: video.likes.length 
      });
    }
  } catch (error) {
    console.error('❌ Like error:', error);
    res.status(500).json({ message: 'خطأ في معالجة الإعجاب.' });
  }
});

// ✅ 7. إضافة مشاهدة (اختياري)
router.post('/:id/view', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'الفيديو غير موجود.' });
    }

    video.views += 1;
    await video.save({ validateBeforeSave: false });
    
    res.json({ 
      success: true,
      views: video.views 
    });
  } catch (error) {
    console.error('❌ View error:', error);
    res.status(500).json({ message: 'خطأ في تسجيل المشاهدة.' });
  }
});

// ✅ 8. جلب فيديوهات مستخدم معين
router.get('/user/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    const videos = await Video.find({ 
      user: user._id,
      isReply: false,
      isActive: true 
    })
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        match: { isActive: true },
        populate: { path: 'user', select: 'username profileImage' }
      })
      .sort({ createdAt: -1 });

    res.json(videos);
  } catch (error) {
    console.error('❌ Fetch user videos error:', error);
    res.status(500).json({ error: 'فشل في جلب فيديوهات المستخدم.' });
  }
});

// ✅ 9. جلب ردود مستخدم معين
router.get('/user/:username/replies', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    const replies = await Video.find({ 
      user: user._id,
      isReply: true,
      isActive: true 
    })
      .populate('user', 'username profileImage')
      .populate('parentVideo')
      .sort({ createdAt: -1 });

    res.json(replies);
  } catch (error) {
    console.error('❌ Fetch user replies error:', error);
    res.status(500).json({ error: 'فشل في جلب ردود المستخدم.' });
  }
});

// ✅ 10. الفيديوهات الشائعة (Trending)
router.get('/trending/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    const videos = await Video.find({ 
      isReply: false,
      isActive: true,
      isPublic: true 
    })
      .populate('user', 'username profileImage')
      .populate({
        path: 'replies',
        match: { isActive: true },
        populate: { path: 'user', select: 'username profileImage' }
      })
      .sort({ views: -1, likes: -1 })
      .limit(limit);

    res.json(videos);
  } catch (error) {
    console.error('❌ Fetch trending videos error:', error);
    res.status(500).json({ error: 'فشل في جلب الفيديوهات الشائعة.' });
  }
});

module.exports = router;
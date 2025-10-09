const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'المستخدم مطلوب'],
    index: true
  },
  // ✅ رابط الفيديو على R2 (مباشر)
  videoUrl: {
    type: String,
    required: [true, 'رابط الفيديو مطلوب']
  },
  // ✅ (اختياري) لحفظ اسم الملف في R2 للحذف
  r2Key: {
    type: String,
    default: null
  },
  thumbnail: {
    type: String,
    default: ''
  },
  thumbnailR2Key: {
    type: String,
    default: null
  },
  description: {
    type: String,
    maxlength: [500, 'الوصف يجب ألا يتجاوز 500 حرف'],
    default: ''
  },
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isReply: {
    type: Boolean,
    default: false,
    index: true
  },
  parentVideo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    default: null,
    index: true
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  saved: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  shares: {
    type: Number,
    default: 0,
    min: 0
  },
  // معلومات الفيديو
  duration: {
    type: Number, // بالثواني
    default: 0
  },
  fileSize: {
    type: Number, // بالبايت
    default: 0
  },
  mimeType: {
    type: String,
    default: 'video/mp4'
  },
  // حالة الفيديو
  isPublic: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // تتبع التقارير
  reportCount: {
    type: Number,
    default: 0
  },
  isReported: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ================== Indexes للأداء ==================

// Compound indexes
videoSchema.index({ user: 1, createdAt: -1 });
videoSchema.index({ user: 1, isReply: 1 });
videoSchema.index({ parentVideo: 1, createdAt: -1 });
videoSchema.index({ isReply: 1, createdAt: -1 });
videoSchema.index({ isPublic: 1, isActive: 1, createdAt: -1 });

// Text index للبحث
videoSchema.index({ description: 'text', hashtags: 'text' });

// Index للفيديوهات الشائعة
videoSchema.index({ views: -1, likes: -1 });

// ================== Virtual Fields ==================

// Virtual للردود (populate تلقائي)
videoSchema.virtual('replies', {
  ref: 'Video',
  localField: '_id',
  foreignField: 'parentVideo'
});

// عدد الإعجابات
videoSchema.virtual('likesCount').get(function() {
  return this.likes?.length || 0;
});

// عدد الردود (إذا كانت محملة)
videoSchema.virtual('repliesCount').get(function() {
  if (this.replies && Array.isArray(this.replies)) {
    return this.replies.length;
  }
  return 0;
});

// عدد المحفوظات
videoSchema.virtual('savedCount').get(function() {
  return this.saved?.length || 0;
});

// ================== Middleware (Hooks) ==================

// ✅ Pre-remove: حذف من R2 + تنظيف البيانات
videoSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    console.log(`🗑️ Pre-delete hook for video: ${this._id}`);
    
    // حذف الفيديو من R2
    if (this.videoUrl && this.videoUrl.includes(process.env.R2_PUBLIC_URL)) {
      const { deleteVideoFromR2 } = require('../config/r2');
      await deleteVideoFromR2(this.videoUrl);
    }
    
    // حذف الصورة المصغرة من R2 (إذا كانت موجودة)
    if (this.thumbnail && this.thumbnail.includes(process.env.R2_PUBLIC_URL)) {
      const { deleteVideoFromR2 } = require('../config/r2');
      await deleteVideoFromR2(this.thumbnail);
    }
    
    // حذف جميع الردود على هذا الفيديو
    if (!this.isReply) {
      const replies = await this.model('Video').find({ parentVideo: this._id });
      console.log(`🗑️ Found ${replies.length} replies to delete`);
      
      for (const reply of replies) {
        await reply.deleteOne();
      }
    }
    
    console.log(`✅ Pre-delete cleanup completed for: ${this._id}`);
    next();
  } catch (error) {
    console.error('❌ Error in pre-deleteOne hook:', error);
    next(error);
  }
});

// ================== Instance Methods ==================

// إضافة مشاهدة
videoSchema.methods.addView = async function() {
  this.views += 1;
  return await this.save({ validateBeforeSave: false });
};

// إضافة مشاركة
videoSchema.methods.addShare = async function() {
  this.shares += 1;
  return await this.save({ validateBeforeSave: false });
};

// تبديل الإعجاب
videoSchema.methods.toggleLike = async function(userId) {
  const userIdStr = userId.toString();
  const index = this.likes.findIndex(id => id.toString() === userIdStr);
  
  if (index > -1) {
    this.likes.splice(index, 1);
    await this.save();
    return { liked: false, likesCount: this.likes.length };
  } else {
    this.likes.push(userId);
    await this.save();
    return { liked: true, likesCount: this.likes.length };
  }
};

// تبديل الحفظ
videoSchema.methods.toggleSave = async function(userId) {
  const userIdStr = userId.toString();
  const index = this.saved.findIndex(id => id.toString() === userIdStr);
  
  if (index > -1) {
    this.saved.splice(index, 1);
    await this.save();
    return { saved: false };
  } else {
    this.saved.push(userId);
    await this.save();
    return { saved: true };
  }
};

// ================== Static Methods ==================

// جلب الفيديوهات العامة والنشطة
videoSchema.statics.findPublicVideos = function(options = {}) {
  return this.find({
    isPublic: true,
    isActive: true,
    isReply: false,
    ...options
  })
    .populate('user', 'username profileImage')
    .populate({
      path: 'replies',
      populate: { path: 'user', select: 'username profileImage' }
    })
    .sort({ createdAt: -1 });
};

// جلب الفيديوهات الشائعة
videoSchema.statics.findTrendingVideos = function(limit = 20) {
  return this.find({
    isPublic: true,
    isActive: true,
    isReply: false
  })
    .populate('user', 'username profileImage')
    .populate({
      path: 'replies',
      populate: { path: 'user', select: 'username profileImage' }
    })
    .sort({ views: -1, likes: -1 })
    .limit(limit);
};

// البحث في الفيديوهات
videoSchema.statics.searchVideos = function(query, limit = 20) {
  return this.find(
    { 
      $text: { $search: query },
      isPublic: true,
      isActive: true
    },
    { score: { $meta: 'textScore' } }
  )
    .populate('user', 'username profileImage')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit);
};

// إحصائيات النظام
videoSchema.statics.getSystemStats = async function() {
  const [
    total,
    published,
    replies,
    totalViews,
    totalLikes
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ isPublic: true, isActive: true, isReply: false }),
    this.countDocuments({ isReply: true }),
    this.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
    this.aggregate([{ $group: { _id: null, total: { $sum: { $size: '$likes' } } } }])
  ]);
  
  return {
    total,
    published,
    replies,
    totalViews: totalViews[0]?.total || 0,
    totalLikes: totalLikes[0]?.total || 0
  };
};

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
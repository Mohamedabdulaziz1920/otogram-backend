const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
    maxlength: [30, 'اسم المستخدم يجب ألا يتجاوز 30 حرف'],
    match: [/^[a-zA-Z0-9_\u0600-\u06FF]+$/, 'اسم المستخدم يحتوي على أحرف غير مسموحة']
  },
  email: {
    type: String,
    required: [true, 'البريد الإلكتروني مطلوب'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'البريد الإلكتروني غير صالح']
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
    select: false // لا يتم إرجاع كلمة المرور في الاستعلامات العادية
  },
  profileImage: {
    type: String,
    default: '/default-avatar.png'
  },
  // ✅ لحفظ fileId الخاص بصورة البروفايل في GridFS
  profileImageFileId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  bio: {
    type: String,
    maxlength: [150, 'البايو يجب ألا يتجاوز 150 حرف'],
    default: ''
  },
  role: {
    type: String,
    enum: {
      values: ['user', 'creator', 'admin'],
      message: 'الدور يجب أن يكون: user, creator, أو admin'
    },
    default: 'user'
  },
  
  // ✅ الفيديوهات المعجب بها
  likedVideos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video'
  }],
  
  // ✅ الفيديوهات المحفوظة
  savedVideos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video'
  }],
  
  // ✅ المتابعين والمتابَعين
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ✅ إحصائيات المستخدم
  stats: {
    totalVideos: {
      type: Number,
      default: 0
    },
    totalLikes: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    },
    totalReplies: {
      type: Number,
      default: 0
    }
  },
  
  // ✅ إعدادات الحساب
  settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowComments: {
      type: Boolean,
      default: true
    },
    allowDuets: {
      type: Boolean,
      default: true
    },
    showLikedVideos: {
      type: Boolean,
      default: true
    },
    emailNotifications: {
      type: Boolean,
      default: true
    }
  },
  
  // ✅ حالة الحساب
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  
  // ✅ تتبع النشاط
  lastLogin: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  // ✅ معلومات إضافية
  location: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: '',
    match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'رابط الموقع غير صالح']
  },
  
  // ✅ أسباب الحظر (في حال تم حظر المستخدم)
  banReason: {
    type: String,
    default: ''
  },
  bannedAt: {
    type: Date
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ✅ إعادة تعيين كلمة المرور
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  // ✅ التحقق من البريد الإلكتروني
  emailVerificationToken: String,
  emailVerificationExpire: Date

}, {
  timestamps: true, // إضافة createdAt و updatedAt تلقائيًا
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ================== Indexes للأداء ==================

// Index للبحث السريع عن المستخدمين
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Text index للبحث
userSchema.index({ username: 'text', bio: 'text' });

// Compound indexes
userSchema.index({ isActive: 1, isBanned: 1 });
userSchema.index({ role: 1, createdAt: -1 });

// ================== Virtual Fields ==================

// عدد المتابعين
userSchema.virtual('followersCount').get(function() {
  return this.followers?.length || 0;
});

// عدد المتابَعين
userSchema.virtual('followingCount').get(function() {
  return this.following?.length || 0;
});

// عدد الفيديوهات المعجب بها
userSchema.virtual('likedVideosCount').get(function() {
  return this.likedVideos?.length || 0;
});

// عدد الفيديوهات المحفوظة
userSchema.virtual('savedVideosCount').get(function() {
  return this.savedVideos?.length || 0;
});

// هل الحساب نشط ومتاح
userSchema.virtual('isAvailable').get(function() {
  return this.isActive && !this.isBanned;
});

// ================== Middleware (Hooks) ==================

// Pre-save middleware لتشفير كلمة المرور
userSchema.pre('save', async function(next) {
  // فقط قم بالتشفير إذا تم تعديل كلمة المرور
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware لتحديث lastActive
userSchema.pre('save', function(next) {
  if (this.isNew) {
    this.lastActive = new Date();
  }
  next();
});

// ================== Instance Methods ==================

// مقارنة كلمة المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('خطأ في مقارنة كلمة المرور');
  }
};

// تحديث آخر نشاط
userSchema.methods.updateLastActive = async function() {
  this.lastActive = new Date();
  return await this.save({ validateBeforeSave: false });
};

// تحديث آخر تسجيل دخول
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  return await this.save({ validateBeforeSave: false });
};

// متابعة مستخدم
userSchema.methods.followUser = async function(userIdToFollow) {
  if (!this.following.includes(userIdToFollow)) {
    this.following.push(userIdToFollow);
    await this.save();
    
    // إضافة المستخدم الحالي إلى قائمة متابعي المستخدم الآخر
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(
      userIdToFollow,
      { $addToSet: { followers: this._id } }
    );
    
    return true;
  }
  return false;
};

// إلغاء متابعة مستخدم
userSchema.methods.unfollowUser = async function(userIdToUnfollow) {
  const index = this.following.indexOf(userIdToUnfollow);
  if (index > -1) {
    this.following.splice(index, 1);
    await this.save();
    
    // إزالة المستخدم الحالي من قائمة متابعي المستخدم الآخر
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(
      userIdToUnfollow,
      { $pull: { followers: this._id } }
    );
    
    return true;
  }
  return false;
};

// حظر المستخدم
userSchema.methods.banUser = async function(reason, bannedBy) {
  this.isBanned = true;
  this.banReason = reason;
  this.bannedAt = new Date();
  this.bannedBy = bannedBy;
  return await this.save();
};

// إلغاء حظر المستخدم
userSchema.methods.unbanUser = async function() {
  this.isBanned = false;
  this.banReason = '';
  this.bannedAt = undefined;
  this.bannedBy = undefined;
  return await this.save();
};

// تحديث الإحصائيات
userSchema.methods.updateStats = async function() {
  const Video = mongoose.model('Video');
  
  const videos = await Video.find({ user: this._id, isReply: false });
  
  this.stats.totalVideos = videos.length;
  this.stats.totalLikes = videos.reduce((sum, video) => sum + (video.likes?.length || 0), 0);
  this.stats.totalViews = videos.reduce((sum, video) => sum + (video.views || 0), 0);
  this.stats.totalReplies = videos.reduce((sum, video) => sum + (video.replies?.length || 0), 0);
  
  return await this.save({ validateBeforeSave: false });
};

// حذف كلمة المرور عند تحويل المستند إلى JSON
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpire;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpire;
  delete userObject.__v;
  return userObject;
};

// ================== Static Methods ==================

// البحث عن مستخدمين نشطين
userSchema.statics.findActiveUsers = function(options = {}) {
  return this.find({
    isActive: true,
    isBanned: false,
    ...options
  }).select('-password');
};

// البحث عن منشئي المحتوى
userSchema.statics.findCreators = function() {
  return this.find({
    role: { $in: ['creator', 'admin'] },
    isActive: true,
    isBanned: false
  }).select('-password');
};

// البحث النصي
userSchema.statics.searchUsers = function(query, limit = 20) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
    .select('-password')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit);
};

// إحصائيات النظام
userSchema.statics.getSystemStats = async function() {
  const [
    total,
    active,
    banned,
    verified,
    admins,
    creators,
    users
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ isActive: true, isBanned: false }),
    this.countDocuments({ isBanned: true }),
    this.countDocuments({ isVerified: true }),
    this.countDocuments({ role: 'admin' }),
    this.countDocuments({ role: 'creator' }),
    this.countDocuments({ role: 'user' })
  ]);
  
  return {
    total,
    active,
    banned,
    verified,
    roles: { admins, creators, users }
  };
};

// ================== Pre-remove Hook ==================

// عند حذف مستخدم، احذف جميع بياناته المرتبطة
userSchema.pre('remove', async function(next) {
  try {
    const Video = mongoose.model('Video');
    
    // حذف جميع فيديوهات المستخدم
    await Video.deleteMany({ user: this._id });
    
    // إزالة المستخدم من قوائم المتابعين/المتابَعين للآخرين
    await this.model('User').updateMany(
      { $or: [{ followers: this._id }, { following: this._id }] },
      { 
        $pull: { 
          followers: this._id,
          following: this._id 
        }
      }
    );
    
    console.log(`✅ Cleaned up data for deleted user: ${this.username}`);
    next();
  } catch (error) {
    console.error('❌ Error in pre-remove hook:', error);
    next(error);
  }
});

// ================== Export Model ==================

const User = mongoose.model('User', userSchema);

module.exports = User;

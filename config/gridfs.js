// ملف: server/config/gridfs.js

const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

let videoBucket, imageBucket;

// ✨ 1. استمع لحدث الاتصال مباشرة بدلاً من استخدام دالة init
// هذا يضمن أن الكود سيعمل تلقائيًا عند نجاح الاتصال
mongoose.connection.on('connected', () => {
  const db = mongoose.connection.db;

  // إنشاء GridFS bucket للفيديوهات
  videoBucket = new GridFSBucket(db, {
    bucketName: 'videos' // تأكد من أن هذا الاسم يطابق bucketName في إعدادات multer
  });

  // إنشاء GridFS bucket للصور
  imageBucket = new GridFSBucket(db, {
    bucketName: 'images'
  });
  
  console.log('GridFS initialized successfully for videos and images.');
});

// ✨ 2. أضف فحص أمان في الدوال
const getGridFSBucket = () => {
  if (!videoBucket) {
    throw new Error('GridFS video bucket is not initialized yet. Please wait for the MongoDB connection.');
  }
  return videoBucket;
};

const getImageBucket = () => {
  if (!imageBucket) {
    throw new Error('GridFS image bucket is not initialized yet. Please wait for the MongoDB connection.');
  }
  return imageBucket;
};

// ✨ 3. قم بتصدير الدوال فقط، لا حاجة لـ initGridFS
module.exports = { getGridFSBucket, getImageBucket };

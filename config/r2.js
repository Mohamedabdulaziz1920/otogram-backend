const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// تكوين R2 Client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * رفع فيديو إلى R2
 * @param {Buffer} buffer - محتوى الفيديو
 * @param {String} filename - اسم الملف الأصلي
 * @param {String} mimetype - نوع الملف
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadVideoToR2(buffer, filename, mimetype) {
  try {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `videos/${timestamp}-${sanitizedFilename}`;
    
    console.log(`📤 Uploading video to R2: ${key}`);
    console.log(`📦 File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        CacheControl: 'public, max-age=31536000',
      },
    });

    upload.on('httpUploadProgress', (progress) => {
      const percentage = ((progress.loaded / progress.total) * 100).toFixed(2);
      console.log(`⏫ Upload progress: ${percentage}%`);
    });

    await upload.done();
    
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    console.log(`✅ Video upload successful: ${publicUrl}`);
    
    return {
      url: publicUrl,
      key: key
    };
  } catch (error) {
    console.error('❌ R2 Video Upload Error:', error);
    throw new Error('فشل رفع الفيديو إلى R2: ' + error.message);
  }
}

/**
 * رفع صورة إلى R2
 * @param {Buffer} buffer - محتوى الصورة
 * @param {String} filename - اسم الملف الأصلي
 * @param {String} mimetype - نوع الملف (image/jpeg, image/png, etc.)
 * @param {String} folder - المجلد الفرعي (profiles, thumbnails, covers, etc.)
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadImageToR2(buffer, filename, mimetype, folder = 'images') {
  try {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${folder}/${timestamp}-${sanitizedFilename}`;
    
    console.log(`📸 Uploading image to R2: ${key}`);
    console.log(`📦 File size: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        CacheControl: 'public, max-age=31536000',
      },
    });

    await upload.done();
    
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    console.log(`✅ Image upload successful: ${publicUrl}`);
    
    return {
      url: publicUrl,
      key: key
    };
  } catch (error) {
    console.error('❌ R2 Image Upload Error:', error);
    throw new Error('فشل رفع الصورة إلى R2: ' + error.message);
  }
}

/**
 * حذف فيديو من R2
 * @param {String} videoUrl - رابط الفيديو
 */
async function deleteVideoFromR2(videoUrl) {
  try {
    if (!videoUrl || !videoUrl.includes(process.env.R2_PUBLIC_URL)) {
      console.warn('⚠️ Invalid R2 URL, skipping delete');
      return;
    }

    const key = videoUrl.split(`${process.env.R2_PUBLIC_URL}/`)[1];
    
    if (!key) {
      throw new Error('Invalid video URL format');
    }
    
    console.log(`🗑️ Deleting video from R2: ${key}`);
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    await r2Client.send(command);
    console.log(`✅ Video delete successful: ${key}`);
  } catch (error) {
    console.error('❌ R2 Delete Error:', error);
    console.warn('⚠️ Failed to delete from R2, but continuing...');
  }
}

/**
 * حذف صورة من R2
 * @param {String} imageUrlOrKey - رابط الصورة أو المفتاح
 */
async function deleteImageFromR2(imageUrlOrKey) {
  try {
    if (!imageUrlOrKey) {
      console.warn('⚠️ No image URL/key provided, skipping delete');
      return;
    }

    let key = imageUrlOrKey;
    
    // إذا كان رابطاً كاملاً، استخرج المفتاح
    if (imageUrlOrKey.includes(process.env.R2_PUBLIC_URL)) {
      key = imageUrlOrKey.split(`${process.env.R2_PUBLIC_URL}/`)[1];
    }
    
    if (!key) {
      console.warn('⚠️ Invalid image URL/key, skipping delete');
      return;
    }
    
    console.log(`🗑️ Deleting image from R2: ${key}`);
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    await r2Client.send(command);
    console.log(`✅ Image delete successful: ${key}`);
  } catch (error) {
    console.error('❌ R2 Image Delete Error:', error);
    console.warn('⚠️ Failed to delete image from R2, but continuing...');
  }
}

/**
 * حذف باستخدام المفتاح مباشرة
 * @param {String} key - مفتاح الملف في R2
 */
async function deleteByKey(key) {
  try {
    if (!key) {
      console.warn('⚠️ No key provided, skipping delete');
      return;
    }

    console.log(`🗑️ Deleting from R2 by key: ${key}`);
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    await r2Client.send(command);
    console.log(`✅ Delete successful: ${key}`);
  } catch (error) {
    console.error('❌ R2 Delete Error:', error);
  }
}

/**
 * التحقق من وجود ملف في R2
 * @param {String} key - مفتاح الملف
 * @returns {Promise<Boolean>}
 */
async function fileExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    await r2Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

module.exports = {
  uploadVideoToR2,
  uploadImageToR2,
  deleteVideoFromR2,
  deleteImageFromR2,
  deleteByKey,
  fileExists,
  r2Client,
};

const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

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
 * @returns {Promise<{url: string, key: string}>}
 */
async function uploadVideoToR2(buffer, filename, mimetype) {
  try {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `videos/${timestamp}-${sanitizedFilename}`;
    
    console.log(`📤 Uploading to R2: ${key}`);
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
    console.log(`✅ Upload successful: ${publicUrl}`);
    
    return {
      url: publicUrl,
      key: key  // ✅ نرجع المفتاح أيضاً
    };
  } catch (error) {
    console.error('❌ R2 Upload Error:', error);
    throw new Error('فشل رفع الفيديو إلى R2: ' + error.message);
  }
}

/**
 * حذف فيديو من R2
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
    
    console.log(`🗑️ Deleting from R2: ${key}`);
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    
    await r2Client.send(command);
    console.log(`✅ Delete successful: ${key}`);
  } catch (error) {
    console.error('❌ R2 Delete Error:', error);
    console.warn('⚠️ Failed to delete from R2, but continuing...');
  }
}

/**
 * حذف باستخدام المفتاح مباشرة
 */
async function deleteByKey(key) {
  try {
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

module.exports = {
  uploadVideoToR2,
  deleteVideoFromR2,
  deleteByKey,
  r2Client,
};
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * هذا الملف مسؤول فقط عن عرض الملفات المخزنة في GridFS.
 * منطق الرفع (Upload) موجود في المسارات الخاصة به (مثل routes/videos.js و routes/users.js).
 */

// --- مسار لعرض الصور من 'images' bucket ---
router.get('/images/:fileId', async (req, res) => {
    try {
        const bucket = req.imageBucket; // <-- يأتي من server.js
        if (!bucket) {
            throw new Error("Image bucket is not initialized.");
        }
        
        const fileId = new mongoose.Types.ObjectId(req.params.fileId);

        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files || files.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        const file = files[0];
        res.set('Content-Type', file.contentType || 'image/jpeg'); // تعيين نوع المحتوى
        
        const downloadStream = bucket.openDownloadStream(fileId);
        
        // ربط تيار التحميل بالاستجابة لإرسال الملف إلى المتصفح
        downloadStream.pipe(res);

        downloadStream.on('error', (err) => {
            console.error('Error streaming image:', err);
            // لا ترسل استجابة هنا لأن الـ headers قد تكون أُرسلت بالفعل
        });

    } catch (error) {
        if (error.name === 'BSONError') {
             return res.status(400).json({ error: 'Invalid file ID format.' });
        }
        console.error('Error in /images/:fileId route:', error);
        res.status(500).json({ error: 'Failed to retrieve image.' });
    }
});

// ملاحظة: مسار عرض الفيديو `/api/videos/stream/:fileId` موجود بالفعل في `videos.js`،
// لذا لا داعي لتكراره هنا.

module.exports = router;
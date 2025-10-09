const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// ✨ البصمة للتحقق من نسخة الكود ✨
console.log(`--- SERVER CODE VERSION: ${new Date().toISOString()} --- R2 VERSION ---`);

dotenv.config();
const app = express();

// Trust proxy (مهم لـ Railway/Render)
app.set('trust proxy', 1);

// ==================== CORS Configuration ====================
const corsOptions = {
  origin: function (origin, callback) {
    // قائمة النطاقات المسموحة
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'https://otogram.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5000'
    ].filter(Boolean);
    
    console.log('📍 Request Origin:', origin || 'No Origin');
    
    // السماح للطلبات بدون origin (مثل Postman، curl، server-to-server)
    if (!origin) {
      console.log('✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    // التحقق من النطاقات المسموحة
    const isAllowed = allowedOrigins.some(allowed => {
      if (!allowed) return false;
      
      // مطابقة دقيقة
      if (origin === allowed) return true;
      
      // السماح لجميع نطاقات Vercel الفرعية
      if (origin.endsWith('.vercel.app')) return true;
      
      // السماح لجميع نطاقات localhost
      if (origin.includes('localhost')) return true;
      
      return false;
    });
    
    if (isAllowed) {
      console.log('✅ CORS: Origin allowed:', origin);
      callback(null, true);
    } else {
      console.warn('❌ CORS: Origin blocked:', origin);
      console.warn('Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Additional CORS headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin) {
    // السماح للنطاقات المحددة أو Vercel domains
    if (
      origin === process.env.FRONTEND_URL ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost')
    ) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// ==================== Body Parsing Middleware ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== Request Logging Middleware ====================
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', {
    origin: req.headers.origin,
    'user-agent': req.headers['user-agent']?.substring(0, 50)
  });
  next();
});

// ==================== Static Files (للصور المحلية إن وجدت) ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== MongoDB Connection ====================
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully.');
    console.log('📊 Database:', mongoose.connection.db.databaseName);

    // ✅ التحقق من متغيرات R2
    if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
      console.log('✅ Cloudflare R2 configured');
      console.log('📦 R2 Bucket:', process.env.R2_BUCKET_NAME);
      console.log('🌐 R2 Public URL:', process.env.R2_PUBLIC_URL?.substring(0, 30) + '...');
    } else {
      console.warn('⚠️  R2 environment variables not configured!');
      console.warn('Please set: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
    }

    // ==================== Routes ====================
    const authRoutes = require('./routes/auth');
    const videoRoutes = require('./routes/videos');
    const userRoutes = require('./routes/users');
    const filesRoutes = require('./routes/files');

    app.use('/api/auth', authRoutes);
    app.use('/api/videos', videoRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/files', filesRoutes);

    console.log('✅ All routes registered');

    // ==================== Health Check Endpoint ====================
    app.get('/health', (req, res) => {
      const healthcheck = {
        status: 'OK',
        uptime: process.uptime(),
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: process.env.NODE_ENV || 'development',
        storage: process.env.R2_ACCOUNT_ID ? 'Cloudflare R2' : 'None',
        version: '3.0.0-R2'
      };
      
      try {
        res.status(200).json(healthcheck);
      } catch (error) {
        healthcheck.status = 'ERROR';
        healthcheck.error = error.message;
        res.status(503).json(healthcheck);
      }
    });

    // ==================== CORS Test Endpoint ====================
    app.get('/api/test-cors', (req, res) => {
      res.json({
        message: 'CORS is working!',
        origin: req.headers.origin,
        timestamp: new Date().toISOString()
      });
    });

    // ==================== Root Endpoint ====================
    app.get('/', (req, res) => {
      res.json({ 
        message: 'Otogram API is running successfully! 🚀',
        version: '3.0.0-R2',
        timestamp: new Date().toISOString(),
        storage: {
          type: 'Cloudflare R2',
          bucket: process.env.R2_BUCKET_NAME,
          configured: !!process.env.R2_ACCOUNT_ID
        },
        endpoints: {
          auth: '/api/auth',
          videos: '/api/videos',
          users: '/api/users',
          files: '/api/files',
          health: '/health',
          testCors: '/api/test-cors'
        },
        cors: {
          enabled: true,
          allowedOrigins: [
            process.env.FRONTEND_URL,
            'https://otogram.vercel.app',
            '*.vercel.app',
            'localhost'
          ]
        }
      });
    });

    // ==================== Error Handling Middleware ====================
    app.use((err, req, res, next) => {
      console.error('❌ Error occurred:');
      console.error('Path:', req.path);
      console.error('Method:', req.method);
      console.error('Error:', err.message);
      console.error('Stack:', err.stack);
      
      if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ 
          error: 'CORS policy violation',
          origin: req.headers.origin,
          message: 'Your origin is not allowed to access this resource'
        });
      }
      
      if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      
      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
          ? 'Something went wrong!' 
          : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
      });
    });

    // ==================== 404 Handler ====================
    app.use((req, res) => {
      console.log('❌ 404: Route not found:', req.path);
      res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method,
        availableEndpoints: ['/api/auth', '/api/videos', '/api/users', '/api/files', '/health']
      });
    });

    // ==================== Start Server ====================
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('='.repeat(60));
      console.log('🚀 SERVER STARTED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
      console.log(`🗄️  Database: Connected`);
      console.log(`📦 Storage: Cloudflare R2`);
      console.log(`🔐 CORS: Enabled`);
      console.log('='.repeat(60));
      console.log('');
    });

    // ==================== Graceful Shutdown ====================
    process.on('SIGTERM', () => {
      console.log('👋 SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('✅ HTTP server closed');
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', () => {
      console.log('👋 SIGINT signal received: closing HTTP server');
      server.close(() => {
        console.log('✅ HTTP server closed');
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    });

  })
  .catch((err) => {
    console.error('');
    console.error('❌❌❌ FATAL ERROR ❌❌❌');
    console.error('MongoDB connection failed!');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('1. Check MONGO_URI in .env file');
    console.error('2. Verify MongoDB Atlas network access');
    console.error('3. Confirm database user credentials');
    console.error('');
    process.exit(1);
  });

// ==================== Unhandled Rejection Handler ====================
process.on('unhandledRejection', (err, promise) => {
  console.error('⚠️  UNHANDLED REJECTION! 💥');
  console.error('Promise:', promise);
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  // لا نوقف السيرفر مباشرة في الإنتاج، فقط نسجل الخطأ
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// ==================== Uncaught Exception Handler ====================
process.on('uncaughtException', (err) => {
  console.error('⚠️  UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

module.exports = app; // للتصدير في حالة الاختبارات
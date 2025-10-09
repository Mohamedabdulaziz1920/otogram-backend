const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const auth = require('../middleware/auth');

// --- Register a new user ---
// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Please provide all required fields.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existingUser = await User.findOne({ 
      $or: [{ email: email.toLowerCase() }, { username }] 
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User with this email or username already exists.' 
      });
    }

    // ✅ لا تشفير يدوي - دع middleware يقوم بذلك
    const user = new User({
      username,
      email: email.toLowerCase(),
      password: password, // ← كلمة مرور عادية
    });

    await user.save(); // ← middleware في User.js سيشفرها تلقائياً
    
    const userResponse = user.toObject();
    delete userResponse.password;

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully!',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// --- Login a user ---
// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('=====================================');
    console.log('🔐 LOGIN ATTEMPT');
    console.log('📧 Email:', email);
    console.log('=====================================');

    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Please provide both email and password.' 
      });
    }

    const user = await User.findOne({ 
      email: email.toLowerCase() 
    }).select('+password');
    
    console.log('👤 User found:', user ? '✓ YES' : '✗ NO');
    
    if (user) {
      console.log('📋 User Details:');
      console.log('  - Username:', user.username);
      console.log('  - Role:', user.role);
      console.log('  - Password exists:', user.password ? '✓ YES' : '✗ NO');
      console.log('  - Password hash valid:', user.password?.startsWith('$2') ? '✓ YES' : '✗ NO');
    }

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    console.log('🔐 Comparing passwords...');

    const isMatch = await bcrypt.compare(password, user.password);
    
    console.log('✅ Result:', isMatch ? '✓ MATCH' : '✗ NO MATCH');

    if (!isMatch) {
      console.log('❌ Password mismatch');
      console.log('=====================================');
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const userResponse = user.toObject();
    delete userResponse.password;

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful');
    console.log('=====================================');

    res.status(200).json({
      message: 'Logged in successfully!',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('❌ LOGIN ERROR:', error);
    console.log('=====================================');
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// --- Get Logged-in User Data ---
// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.status(200).json({ user: req.user });
});


module.exports = router;

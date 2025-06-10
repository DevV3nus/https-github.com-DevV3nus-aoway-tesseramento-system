const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

// @route   POST /api/auth/login
// @desc    Staff login
// @access  Public
router.post('/login', validate('login'), authController.login);

// @route   GET /api/auth/me
// @desc    Get current staff profile
// @access  Private
router.get('/me', authenticateToken, authController.getProfile);

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', authController.refreshToken);

// @route   POST /api/auth/logout
// @desc    Logout staff
// @access  Private
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
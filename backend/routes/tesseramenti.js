const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const tesseramentiController = require('../controllers/tesseramentiController');

// @route   GET /api/tesseramenti
// @desc    Get all tesseramenti with filters
// @access  Private (staff only)
router.get('/', authenticateToken, tesseramentiController.getTesseramenti);

// @route   GET /api/tesseramenti/:id
// @desc    Get single tesseramento by ID
// @access  Private (staff only)
router.get('/:id', authenticateToken, tesseramentiController.getTesseramento);

// @route   POST /api/tesseramenti
// @desc    Create new tesseramento (from web portal)
// @access  Public
router.post('/', validate('createTesseramento'), tesseramentiController.createTesseramento);

// @route   PUT /api/tesseramenti/:id/status
// @desc    Update tesseramento status
// @access  Private (staff only)
router.put('/:id/status', authenticateToken, validate('updateTesseramentoStatus'), tesseramentiController.updateStatus);

// @route   PUT /api/tesseramenti/:id/assign
// @desc    Assign tesseramento to staff
// @access  Private (staff only)
router.put('/:id/assign', authenticateToken, tesseramentiController.assignToStaff);

module.exports = router;
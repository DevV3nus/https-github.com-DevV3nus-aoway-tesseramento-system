const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'aoway_secret_key_development';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Generate JWT tokens
const generateTokens = (staffData) => {
    const payload = {
        id: staffData.id,
        username: staffData.username,
        email: staffData.email,
        role: staffData.role
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { 
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'aoway-tesseramento'
    });

    const refreshToken = jwt.sign(
        { id: staffData.id, type: 'refresh' }, 
        JWT_SECRET, 
        { 
            expiresIn: JWT_REFRESH_EXPIRES_IN,
            issuer: 'aoway-tesseramento'
        }
    );

    return { accessToken, refreshToken };
};

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ 
                error: 'Token di accesso richiesto' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if staff still exists and is active
        const result = await query(
            'SELECT id, username, email, full_name, role, is_active FROM staff WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ 
                error: 'Staff non trovato' 
            });
        }

        const staff = result.rows[0];
        
        if (!staff.is_active) {
            return res.status(401).json({ 
                error: 'Account disattivato' 
            });
        }

        // Add staff info to request
        req.staff = staff;
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Token scaduto',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Token non valido' 
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({ 
            error: 'Errore di autenticazione' 
        });
    }
};

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
    if (req.staff.role !== 'admin') {
        return res.status(403).json({
            error: 'Accesso riservato agli amministratori'
        });
    }
    next();
};

module.exports = {
    generateTokens,
    authenticateToken,
    requireAdmin
};
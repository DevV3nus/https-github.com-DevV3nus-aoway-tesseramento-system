const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');

require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Logging
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:19006',
        process.env.FRONTEND_URL,
        process.env.MOBILE_APP_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: NODE_ENV === 'production' ? 100 : 1000,
    message: { error: 'Troppi richieste da questo IP' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Troppi tentativi di login' }
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add socket.io to request
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Aoway Tesseramento API',
        version: '1.0.0',
        environment: NODE_ENV
    });
});

// API Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/tesseramenti', require('./routes/tesseramenti'));

// Socket.IO for real-time chat
io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);
    
    socket.on('join_tesseramento', (tesseramento_id) => {
        socket.join(`tesseramento_${tesseramento_id}`);
        console.log(`📝 User ${socket.id} joined tesseramento ${tesseramento_id}`);
    });
    
    socket.on('disconnect', () => {
        console.log(`👋 User disconnected: ${socket.id}`);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(`❌ Error: ${err.message}`);
    
    const isDev = NODE_ENV === 'development';
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Dati non validi',
            details: isDev ? err.details : undefined
        });
    }
    
    if (err.name === 'UnauthorizedError' || err.message === 'Unauthorized') {
        return res.status(401).json({
            error: 'Accesso negato'
        });
    }
    
    res.status(err.status || 500).json({ 
        error: isDev ? err.message : 'Errore interno del server'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Endpoint non trovato',
        path: req.originalUrl
    });
});

server.listen(PORT, () => {
    console.log('🚀 =================================');
    console.log(`🏆 Aoway Tesseramento API Started`);
    console.log(`📱 Port: ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`⏰ Started: ${new Date().toISOString()}`);
    console.log('🚀 =================================');
});

module.exports = { app, server, io };
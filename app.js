/**
 * APP.JS - VERSIÓN FUNCIONAL
 * Reemplaza tu app.js actual con esta versión
 */

const express = require('express');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ==================== PAYMENT CONTROLLER ====================
let paymentController;
try {
  paymentController = require('./paymentController');
  console.log('✅ paymentController loaded successfully');
} catch (error) {
  console.error('❌ Error loading paymentController:', error.message);
  paymentController = null;
}

// ==================== RUTAS DE SALUD ====================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date()
  });
});

// Info
app.get('/api/info', (req, res) => {
  res.status(200).json({
    name: 'SkillsCert Payment System',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    status: paymentController ? 'ready' : 'warning'
  });
});

// ==================== RUTAS DE PAYMENT ====================

// Middleware de autenticación para payment routes
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token requerido',
      code: 'NO_TOKEN'
    });
  }

  // Token válido si empieza con "Bearer_"
  if (!token.startsWith('Bearer_')) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      code: 'INVALID_TOKEN'
    });
  }

  next();
};

if (paymentController && paymentController.processPayment) {
  app.post('/api/payments', authMiddleware, paymentController.processPayment);
  console.log('✅ POST /api/payments registered');
}

if (paymentController && paymentController.getPaymentHistory) {
  app.get('/api/payments/history/:userId', authMiddleware, paymentController.getPaymentHistory);
  console.log('✅ GET /api/payments/history/:userId registered');
}

if (paymentController && paymentController.getStats) {
  app.get('/api/payments/stats/:userId', authMiddleware, paymentController.getStats);
  console.log('✅ GET /api/payments/stats/:userId registered');
}

// ==================== RUTAS PÚBLICAS ====================

// Index
app.get('/', (req, res) => {
  res.json({
    message: 'SkillsCert Payment System',
    endpoints: {
      health: 'GET /health',
      info: 'GET /api/info',
      payments: 'POST /api/payments (requires auth)',
      history: 'GET /api/payments/history/:userId (requires auth)',
      stats: 'GET /api/payments/stats/:userId (requires auth)'
    }
  });
});

// ==================== ERROR HANDLERS ====================

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    path: req.path
  });
});

// Error global
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== SERVER ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SkillsCert Payment System             ║
║   Server running on port ${PORT}          ║
║   Environment: ${process.env.NODE_ENV || 'development'}   ║
║   Status: ✅ READY                      ║
╚════════════════════════════════════════╝
  `);
  
  console.log('\n📋 Available endpoints:');
  console.log('   GET  /health');
  console.log('   GET  /api/info');
  console.log('   POST /api/payments (requires Bearer token)');
  console.log('   GET  /api/payments/history/:userId');
  console.log('   GET  /api/payments/stats/:userId');
});

module.exports = app;

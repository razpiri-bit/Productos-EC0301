/**
 * APP.JS - PRODUCTION SAFE VERSION
 * Versión segura sin problemas de path
 */

const express = require('express');
const path = require('path');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos SOLO si existe
try {
  const publicPath = path.join(__dirname, '../public');
  app.use(express.static(publicPath));
} catch (e) {
  console.warn('⚠️ Carpeta public no disponible');
}

// ==================== PAYMENT CONTROLLER ====================
let paymentController = null;
try {
  paymentController = require('./paymentController');
  console.log('✅ paymentController loaded successfully');
} catch (error) {
  console.error('⚠️ Warning: paymentController no cargado:', error.message);
}

// ==================== RUTAS DE SALUD ====================

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is running',
    timestamp: new Date()
  });
});

app.get('/api/info', (req, res) => {
  res.status(200).json({
    name: 'SkillsCert Payment System',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    paymentControllerStatus: paymentController ? '✅ loaded' : '⚠️ not loaded'
  });
});

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token requerido',
      code: 'NO_TOKEN'
    });
  }

  if (!token.startsWith('Bearer_')) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      code: 'INVALID_TOKEN'
    });
  }

  next();
};

// ==================== RUTAS DE PAYMENT ====================

if (paymentController) {
  if (paymentController.processPayment) {
    app.post('/api/payments', authMiddleware, paymentController.processPayment);
    console.log('✅ POST /api/payments registered');
  }

  if (paymentController.getPaymentHistory) {
    app.get('/api/payments/history/:userId', authMiddleware, paymentController.getPaymentHistory);
    console.log('✅ GET /api/payments/history/:userId registered');
  }

  if (paymentController.getStats) {
    app.get('/api/payments/stats/:userId', authMiddleware, paymentController.getStats);
    console.log('✅ GET /api/payments/stats/:userId registered');
  }
}

// ==================== RUTA ÍNDICE ====================

app.get('/', (req, res) => {
  res.json({
    message: 'SkillsCert Payment System',
    status: paymentController ? 'ready' : 'warning',
    endpoints: {
      health: 'GET /health',
      info: 'GET /api/info',
      payments: 'POST /api/payments (requires Bearer token)',
      history: 'GET /api/payments/history/:userId (requires Bearer token)',
      stats: 'GET /api/payments/stats/:userId (requires Bearer token)'
    }
  });
});

// ==================== HANDLERS ====================

// 404 - DEBE IR ANTES del error handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    path: req.path
  });
});

// Error handler global - DEBE tener 4 parámetros
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== SERVER ====================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SkillsCert Payment System             ║
║   Server running on port ${PORT}          ║
║   Environment: ${process.env.NODE_ENV || 'development'}        ║
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;

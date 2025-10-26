/**
 * SERVIDOR PRINCIPAL - EXPRESS APP
 * 
 * Aplicación principal que configura Express y todas las rutas
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { MongoClient } = require('mongodb');
const PaymentController = require('./controllers/paymentController');
const { logger } = require('./utils/logger');

// Crear aplicación Express
const app = express();

// ==========================================
// CONFIGURACIÓN
// ==========================================

const config = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  postmark: {
    serverToken: process.env.POSTMARK_SERVER_TOKEN,
    fromEmail: process.env.POSTMARK_FROM_EMAIL,
  },
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  },
  database: {
    url: process.env.MONGODB_URI || process.env.DATABASE_URL,
  },
};

// ==========================================
// MIDDLEWARES
// ==========================================

// Seguridad
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  })
);

// Logging de peticiones
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// Body parser - IMPORTANTE: Para webhooks usar raw body
app.use(
  '/webhook/stripe',
  express.raw({ type: 'application/json' })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// CONEXIÓN A BASE DE DATOS
// ==========================================

let database;
let paymentController;

async function connectDatabase() {
  try {
    const client = await MongoClient.connect(config.database.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    database = client.db('skillscert');
    logger.info('Database connected successfully');

    // Crear índices
    await createIndexes();

    // Inicializar controlador
    paymentController = new PaymentController(config, database);

    return database;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
    });
    throw error;
  }
}

async function createIndexes() {
  try {
    // Índices para accessCodes
    await database.collection('accessCodes').createIndex({ code: 1 }, { unique: true });
    await database.collection('accessCodes').createIndex({ email: 1 });
    await database.collection('accessCodes').createIndex({ status: 1 });
    await database.collection('accessCodes').createIndex({ expiresAt: 1 });

    // Índices para historial
    await database.collection('paymentHistory').createIndex({ userId: 1 });
    await database.collection('paymentHistory').createIndex({ timestamp: -1 });
    await database.collection('errorHistory').createIndex({ userId: 1 });
    await database.collection('notificationHistory').createIndex({ userId: 1 });

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Error creating indexes', { error: error.message });
  }
}

// ==========================================
// RUTAS
// ==========================================

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Obtener precios activos (para configuración)
app.get('/api/prices', async (req, res) => {
  await paymentController.getActivePrices(req, res);
});

// Iniciar checkout
app.post('/api/checkout', async (req, res) => {
  await paymentController.initiateCheckout(req, res);
});

// Webhook de Stripe
app.post('/webhook/stripe', async (req, res) => {
  await paymentController.handleStripeWebhook(req, res);
});

// Validar código de acceso
app.post('/api/validate-code', async (req, res) => {
  await paymentController.validateAccessCode(req, res);
});

// Obtener historial de usuario
app.get('/api/history/:userId', async (req, res) => {
  await paymentController.getUserHistory(req, res);
});

// Obtener estadísticas
app.get('/api/stats', async (req, res) => {
  await paymentController.getEfficiencyStats(req, res);
});

// ==========================================
// PÁGINA DE CHECKOUT SIMPLE (HTML)
// ==========================================

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SkillsCert - Checkout</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 500px;
      width: 100%;
      padding: 40px;
    }
    h1 {
      color: #333;
      margin-bottom: 10px;
      font-size: 32px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 16px;
    }
    .product-card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 25px;
      border-left: 4px solid #667eea;
    }
    .product-card h3 {
      color: #333;
      margin-bottom: 10px;
    }
    .product-card p {
      color: #666;
      line-height: 1.6;
    }
    .price {
      font-size: 36px;
      font-weight: bold;
      color: #667eea;
      margin: 20px 0;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 600;
    }
    input {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.3s;
    }
    input:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .error {
      background: #fee;
      border-left: 4px solid #f00;
      padding: 15px;
      margin-top: 20px;
      border-radius: 8px;
      display: none;
    }
    .loading {
      text-align: center;
      padding: 20px;
      display: none;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎓 SkillsCert</h1>
    <p class="subtitle">Acceso a Productos EC0301</p>

    <div class="product-card">
      <h3>📦 Producto: Certificación EC0301</h3>
      <p>Acceso completo al curso de certificación por 90 días.</p>
      <div class="price">$999 MXN</div>
    </div>

    <form id="checkout-form">
      <div class="form-group">
        <label>Nombre Completo</label>
        <input type="text" id="name" required placeholder="Juan Pérez">
      </div>

      <div class="form-group">
        <label>Correo Electrónico</label>
        <input type="email" id="email" required placeholder="juan@example.com">
      </div>

      <div class="form-group">
        <label>Teléfono (WhatsApp) - Opcional</label>
        <input type="tel" id="phone" placeholder="+52 55 1234 5678">
      </div>

      <button type="submit" id="submit-btn">
        Proceder al Pago
      </button>
    </form>

    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p style="margin-top: 10px; color: #666;">Procesando...</p>
    </div>

    <div class="error" id="error-message"></div>
  </div>

  <script>
    const form = document.getElementById('checkout-form');
    const submitBtn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Ocultar errores previos
      errorDiv.style.display = 'none';

      // Mostrar loading
      submitBtn.disabled = true;
      loading.style.display = 'block';

      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId: '${process.env.STRIPE_PRICE_ID_999}',
            customerEmail: document.getElementById('email').value,
            customerName: document.getElementById('name').value,
            productName: 'Certificación EC0301',
            phone: document.getElementById('phone').value,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // Redirigir a Stripe Checkout
          window.location.href = data.checkoutUrl;
        } else {
          throw new Error(data.message || 'Error al procesar el pago');
        }
      } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        loading.style.display = 'none';
      }
    });
  </script>
</body>
</html>
  `);
});

// Página de éxito
app.get('/success', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Pago Exitoso! - SkillsCert</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 600px;
      width: 100%;
      padding: 50px;
      text-align: center;
    }
    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: #28a745;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 30px;
      font-size: 50px;
      color: white;
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    p {
      color: #666;
      line-height: 1.8;
      font-size: 18px;
    }
    .highlight {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      margin: 30px 0;
      border-left: 4px solid #28a745;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✓</div>
    <h1>¡Pago Exitoso!</h1>
    <p>Tu pago ha sido procesado correctamente.</p>
    <div class="highlight">
      <p>📧 Recibirás tu código de acceso por correo electrónico en los próximos minutos.</p>
      <p>📱 Si proporcionaste tu número, también recibirás un mensaje por WhatsApp.</p>
    </div>
    <p>Si no recibes el código, revisa tu carpeta de spam o contáctanos.</p>
  </div>
</body>
</html>
  `);
});

// Página de cancelación
app.get('/cancel', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago Cancelado - SkillsCert</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 600px;
      width: 100%;
      padding: 50px;
      text-align: center;
    }
    .icon {
      font-size: 80px;
      margin-bottom: 20px;
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    p {
      color: #666;
      line-height: 1.8;
      font-size: 18px;
    }
    a {
      display: inline-block;
      margin-top: 30px;
      padding: 15px 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Pago Cancelado</h1>
    <p>Has cancelado el proceso de pago.</p>
    <p>No te preocupes, puedes intentarlo de nuevo cuando lo desees.</p>
    <a href="/">Volver a Intentar</a>
  </div>
</body>
</html>
  `);
});

// Manejo de errores
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada',
  });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

async function startServer() {
  try {
    // Conectar base de datos
    await connectDatabase();

    // Iniciar servidor
    app.listen(config.port, () => {
      logger.info(`Server started on port ${config.port}`);
      console.log(`
╔═══════════════════════════════════════════╗
║   SkillsCert Payment System v1.0.0        ║
║   Servidor corriendo en puerto ${config.port}      ║
║                                           ║
║   http://localhost:${config.port}                 ║
╚═══════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Iniciar
startServer();

module.exports = app;

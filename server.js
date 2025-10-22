// ============================================
// SERVER.JS - Servidor Principal con Checkout
// ============================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(express.json());
app.use(express.static('public')); // Carpeta con tus archivos HTML

// ============================================
// ENDPOINT: Crear Sesión de Checkout
// ============================================
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { nombre, email, telefono, deliveryMethod } = req.body;

    // Validaciones
    if (!nombre || !email) {
      return res.status(400).json({ error: 'Nombre y email son obligatorios' });
    }

    if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && !telefono) {
      return res.status(400).json({ error: 'Teléfono es obligatorio para WhatsApp' });
    }

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'Generador EC0301 Pro - Acceso Anual',
              description: 'Acceso completo por 1 año a generador de documentos EC0301',
              images: ['https://tu-dominio.com/logo.png'], // Opcional
            },
            unit_amount: 79900, // $799 MXN en centavos
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      phone_number_collection: {
        enabled: deliveryMethod !== 'email'
      },
      metadata: {
        nombre: nombre,
        email: email,
        telefono: telefono || '',
        delivery_method: deliveryMethod // 'email', 'whatsapp', 'both'
      },
      success_url: `${process.env.DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/checkout.html?canceled=true`,
    });

    console.log('✅ Sesión creada:', session.id);
    console.log('📧 Email:', email);
    console.log('📱 Teléfono:', telefono);
    console.log('📬 Método:', deliveryMethod);

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('❌ Error creando checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Validar Código de Acceso
// ============================================
app.post('/api/validate-code', async (req, res) => {
  try {
    const { email, accessCode } = req.body;

    if (!email || !accessCode) {
      return res.status(400).json({ error: 'Email y código son requeridos' });
    }

    // TODO: Buscar en tu base de datos
    // Ejemplo simulado:
    const codigoValido = accessCode === 'ZX5SN9Q_DXER'; // Para pruebas
    const usuario = {
      email: email,
      nombre: 'Usuario Demo',
      activo: true
    };

    if (codigoValido) {
      // Generar token de sesión (opcional)
      const token = Buffer.from(`${email}:${accessCode}`).toString('base64');
      
      res.json({
        success: true,
        token: token,
        nombre: usuario.nombre
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Código inválido o expirado'
      });
    }
  } catch (error) {
    console.error('❌ Error validando código:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT: Página de Éxito
// ============================================
app.get('/api/checkout-session', async (req, res) => {
  const { session_id } = req.query;
  
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RUTAS ESTÁTICAS
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ============================================
// MANEJO DE ERRORES
// ============================================
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌'}`);
  console.log('\n📋 Endpoints disponibles:');
  console.log('   POST /api/create-checkout');
  console.log('   POST /api/validate-code');
  console.log('   GET  /api/checkout-session');
  console.log('   POST /webhook (en archivo separado)\n');
});

module.exports = app;

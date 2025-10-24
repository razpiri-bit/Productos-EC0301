// ============================================
// SERVER.JS - Sistema Completo SkillsCert EC0301
// Checkout + Webhook + WhatsApp Cloud API
// ============================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN
// ============================================

// CORS
app.use(cors());

// Middlewares
app.use(express.static('public'));
app.use('/api', express.json()); // JSON para rutas API

// Webhook de Stripe necesita body RAW
app.use('/webhook', express.raw({type: 'application/json'}));

// Meta WhatsApp Cloud API
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_BUSINESS_NUMBER = '5538822334';
const WHATSAPP_API_VERSION = 'v18.0';

// Email (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Generar código de acceso único
function generarCodigoAcceso() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';
  for (let i = 0; i < 12; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3 || i === 7) codigo += '-';
  }
  return codigo;
}

// Validar y formatear teléfono mexicano
function validarTelefono(telefono) {
  if (!telefono) return null;
  const cleaned = telefono.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `52${cleaned}`;
  } else if (cleaned.length === 12 && cleaned.startsWith('52')) {
    return cleaned;
  } else if (telefono.startsWith('+52')) {
    return cleaned;
  }
  
  return null;
}

// ============================================
// ENVIAR POR EMAIL
// ============================================

async function enviarPorEmail(email, nombre, codigo) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code-box { background: white; border: 3px solid #667eea; padding: 20px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 3px; color: #667eea; margin: 20px 0; border-radius: 10px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎓 SkillsCert EC0301</h1>
            </div>
            <div class="content">
              <h2>¡Hola ${nombre}!</h2>
              <p>Tu pago ha sido procesado exitosamente.</p>
              
              <div class="code-box">${codigo}</div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul>
                  <li>Código personal e intransferible</li>
                  <li>Válido por 365 días</li>
                  <li>Guárdalo en lugar seguro</li>
                </ul>
              </div>
              
              <p style="text-align: center;">
                <a href="https://productos-ec0301-1-0-dwk2.onrender.com/login.html" class="button">
                  🚀 Ingresar a la Plataforma
                </a>
              </p>
              
              <p>📱 WhatsApp: <a href="https://wa.me/525538822334">+52 55 3882 2334</a></p>
              <p>📧 Email: info@skillscert.com.mx</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email enviado a: ${email}`);
    return { success: true, method: 'email' };

  } catch (error) {
    console.error('❌ Error enviando email:', error);
    return { success: false, method: 'email', error: error.message };
  }
}

// ============================================
// ENVIAR POR WHATSAPP
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo) {
  try {
    const telefonoValidado = validarTelefono(telefono);
    
    if (!telefonoValidado) {
      throw new Error('Formato de teléfono inválido');
    }

    const mensaje = `🎓 *SkillsCert EC0301*

¡Hola ${nombre}! 👋

✅ *Pago confirmado exitosamente*

🔐 *Tu Código de Acceso:*
\`\`\`${codigo}\`\`\`

⚠️ *Importante:*
• Código personal e intransferible
• Válido por 365 días
• Guárdalo en lugar seguro

🚀 *Accede aquí:*
https://productos-ec0301-1-0-dwk2.onrender.com/login.html

📚 *Incluye:*
✅ Generador de Carta Descriptiva
✅ Plan de evaluación
✅ Instrumentos profesionales
✅ Descarga en Word y PDF

💬 *¿Necesitas ayuda?*
📧 info@skillscert.com.mx
📱 +52 55 3882 2334

_SkillsCert - Tu aliado en certificación_`;

    const response = await axios.post(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefonoValidado,
        type: 'text',
        text: {
          preview_url: true,
          body: mensaje
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ WhatsApp enviado a: +${telefonoValidado}`);
    return { 
      success: true, 
      method: 'whatsapp', 
      phone: `+${telefonoValidado}`,
      messageId: response.data.messages[0].id
    };

  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    return { 
      success: false, 
      method: 'whatsapp', 
      error: error.response?.data?.error?.message || error.message
    };
  }
}

// ============================================
// ENDPOINT: Crear Sesión de Checkout
// ============================================

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { nombre, email, telefono, deliveryMethod } = req.body;

    console.log('📦 Nueva solicitud de checkout:');
    console.log('   Nombre:', nombre);
    console.log('   Email:', email);
    console.log('   Teléfono:', telefono);
    console.log('   Método:', deliveryMethod);

    // Validaciones
    if (!nombre || !email) {
      return res.status(400).json({ error: 'Nombre y email son obligatorios' });
    }

    if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && !telefono) {
      return res.status(400).json({ error: 'Teléfono es obligatorio para WhatsApp' });
    }

    // Crear sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'SkillsCert - Generador EC0301',
              description: 'Acceso completo al generador de Carta Descriptiva EC0301',
            },
            unit_amount: 99900, // $999 MXN
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      metadata: {
        nombre: nombre,
        telefono: telefono || '',
        delivery_method: deliveryMethod
      },
      success_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/checkout.html?canceled=true',
    });

    console.log('✅ Sesión creada:', session.id);
    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('❌ Error creando checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK DE STRIPE
// ============================================

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log('\n🎉 Nuevo pago confirmado!');
    console.log('Session ID:', session.id);

    const email = session.customer_email;
    const nombre = session.metadata?.nombre || 'Usuario';
    const telefono = session.metadata?.telefono;
    const deliveryMethod = session.metadata?.delivery_method || 'email';

    if (!email) {
      console.error('❌ No se encontró email');
      return res.status(400).json({ error: 'Email no disponible' });
    }

    // Generar código
    const codigoAcceso = generarCodigoAcceso();
    console.log('🔐 Código generado:', codigoAcceso);

    // TODO: Guardar en base de datos
    const usuario = {
      email: email,
      nombre: nombre,
      telefono: telefono,
      codigoAcceso: codigoAcceso,
      sessionId: session.id,
      fechaCompra: new Date(),
      fechaExpiracion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      activo: true,
      deliveryMethod: deliveryMethod
    };

    console.log('💾 Usuario:', usuario);

    // Enviar según preferencias
    const resultados = {};

    try {
      if (deliveryMethod === 'email' || deliveryMethod === 'both') {
        console.log('📧 Enviando por email...');
        resultados.email = await enviarPorEmail(email, nombre, codigoAcceso);
      }

      if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && telefono) {
        console.log('📱 Enviando por WhatsApp...');
        resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoAcceso);
      }

      const algunoExitoso = 
        (resultados.email?.success) || 
        (resultados.whatsapp?.success);

      if (algunoExitoso) {
        console.log('✅ Código enviado exitosamente');
        res.json({ 
          received: true,
          codigo: codigoAcceso,
          envios: resultados
        });
      } else {
        console.error('❌ No se pudo enviar por ningún método');
        res.status(500).json({ 
          error: 'No se pudo enviar el código',
          detalles: resultados
        });
      }

    } catch (error) {
      console.error('❌ Error en envío:', error);
      res.status(500).json({ 
        error: 'Error al procesar envío',
        detalles: error.message 
      });
    }

  } else {
    console.log(`ℹ️ Evento: ${event.type}`);
    res.json({ received: true });
  }
});

// ============================================
// ENDPOINT: Validar Código
// ============================================

app.post('/api/validate-code', async (req, res) => {
  try {
    const { email, accessCode } = req.body;

    if (!email || !accessCode) {
      return res.status(400).json({ error: 'Email y código son requeridos' });
    }

    // TODO: Buscar en base de datos
    // Por ahora, código de prueba
    const codigoValido = accessCode === 'TEST-CODE-123';
    
    if (codigoValido) {
      const token = Buffer.from(`${email}:${accessCode}`).toString('base64');
      
      res.json({
        success: true,
        token: token,
        nombre: 'Usuario Demo'
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
// ENDPOINT: Obtener Info de Sesión
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
// WEBHOOK WHATSAPP (Verificación)
// ============================================

app.get('/webhook-whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'skillscert_webhook_2025';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook WhatsApp verificado');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verificación fallida');
    res.sendStatus(403);
  }
});

// ============================================
// ENDPOINT DE PRUEBA
// ============================================

app.get('/test-envio', async (req, res) => {
  const { email, telefono, nombre, metodo } = req.query;

  if (!email || !nombre) {
    return res.status(400).json({ 
      error: 'Faltan parámetros',
      ejemplo: '/test-envio?email=test@test.com&nombre=Juan&telefono=5538822334&metodo=both'
    });
  }

  const codigoPrueba = generarCodigoAcceso();
  const resultados = {};

  try {
    if (metodo === 'email' || metodo === 'both' || !metodo) {
      console.log('🧪 Probando email...');
      resultados.email = await enviarPorEmail(email, nombre, codigoPrueba);
    }

    if ((metodo === 'whatsapp' || metodo === 'both') && telefono) {
      console.log('🧪 Probando WhatsApp...');
      resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoPrueba);
    }

    res.json({
      mensaje: '🧪 Prueba completada',
      codigo: codigoPrueba,
      numeroNegocio: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
      resultados: resultados
    });

  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      codigo: codigoPrueba 
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  const estado = {
    servidor: '✅ Activo',
    email: process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado',
    whatsapp: (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado',
    stripe: process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado',
    numeroWhatsApp: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
    timestamp: new Date().toISOString()
  };

  console.log('🏥 Health Check:', estado);
  res.json(estado);
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
  console.log(`\n🚀 Servidor SkillsCert EC0301 corriendo en puerto ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('📧 Email:', process.env.EMAIL_USER ? '✅' : '❌');
  console.log('📱 WhatsApp:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅' : '❌');
  console.log('📱 Número: +52', WHATSAPP_BUSINESS_NUMBER);
  console.log('💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅' : '❌');
  console.log('═══════════════════════════════════════════════');
  console.log('\n📋 Endpoints:');
  console.log('   POST /api/create-checkout');
  console.log('   POST /webhook');
  console.log('   POST /api/validate-code');
  console.log('   GET  /api/checkout-session');
  console.log('   GET  /test-envio');
  console.log('   GET  /health');
  console.log('\n');
});

module.exports = app;

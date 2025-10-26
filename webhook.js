// ============================================
// WEBHOOK COMPLETO - SkillsCert EC0301
// MySQL + WhatsApp + Email + Stripe + Login
// ============================================

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { nanoid } = require('nanoid');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN
// ============================================

// CORS
app.use(cors());

// Webhook de Stripe necesita body RAW (ANTES de express.json)
app.use('/webhook', express.raw({type: 'application/json'}));

// Middlewares generales
app.use(express.json()); // Para todas las rutas
app.use(express.static('public'));

// Meta WhatsApp Cloud API
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_BUSINESS_NUMBER = '5538822334';
const WHATSAPP_API_VERSION = 'v18.0';

// MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Email (Gmail)
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Postmark (opcional)
const postmark = require('postmark');
const pm = process.env.POSTMARK_SERVER_TOKEN
  ? new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN)
  : null;

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Generar código de acceso único
function generarCodigoAcceso() {
  return nanoid(12).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
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
// GUARDAR EN BASE DE DATOS
// ============================================

async function guardarCodigo(email, nombre, codigo, stripeEventId) {
  try {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90); // 90 días
    
    // Insert idempotente (UNIQUE en stripe_event_id)
    const sql = `
      INSERT INTO access_codes (email, nombre, code, expires_at, status, stripe_event_id)
      VALUES (?, ?, ?, ?, 'active', ?)
      ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id
    `;
    
    const [result] = await pool.execute(sql, [
      email.toLowerCase(),
      nombre.trim().slice(0, 120),
      codigo,
      expiresAt,
      stripeEventId
    ]);
    
    console.log('✅ Código guardado en BD:', {
      insertId: result.insertId,
      email: email,
      code: codigo,
      expiresAt: expiresAt.toISOString()
    });
    
    return { success: true, expiresAt };
    
  } catch (error) {
    console.error('❌ Error guardando código en BD:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVIAR POR EMAIL (Gmail y Postmark)
// ============================================

async function enviarPorEmail(email, nombre, codigo, expiresAt) {
  try {
    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const htmlBody = `
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
            <p>Bienvenido a tu capacitación profesional</p>
          </div>
          <div class="content">
            <h2>¡Hola ${nombre}!</h2>
            <p>Tu pago ha sido procesado exitosamente. Aquí está tu código de acceso personal:</p>
            
            <div class="code-box">${codigo}</div>
            
            <div class="warning">
              <strong>⚠️ Importante:</strong>
              <ul style="margin: 10px 0;">
                <li>Este código es personal e intransferible</li>
                <li>Válido hasta: <strong>${fecha}</strong> (90 días)</li>
                <li>Guárdalo en un lugar seguro</li>
              </ul>
            </div>
            
            <p style="text-align: center;">
              <a href="https://productos-ec0301-1-0-dwk2.onrender.com/login.html" class="button">
                🚀 Ingresar a la Plataforma
              </a>
            </p>
            
            <h3>📚 ¿Qué incluye tu acceso?</h3>
            <ul>
              <li>✅ Generador automático de Carta Descriptiva EC0301</li>
              <li>✅ Plan de evaluación personalizado</li>
              <li>✅ Instrumentos de evaluación profesionales</li>
              <li>✅ Material descargable en Word y PDF</li>
              <li>✅ Acceso durante 90 días</li>
            </ul>
            
            <p><strong>💬 ¿Necesitas ayuda?</strong></p>
            <p>📧 Email: <a href="mailto:info@skillscert.com.mx">info@skillscert.com.mx</a></p>
            <p>📱 WhatsApp: <a href="https://wa.me/525538822334">+52 55 3882 2334</a></p>
          </div>
          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
            <p>© ${new Date().getFullYear()} SkillsCert - Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Intentar con Gmail primero
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
          html: htmlBody
        });
        console.log(`✅ Email enviado (Gmail) a: ${email}`);
        return { success: true, method: 'gmail' };
      } catch (gmailError) {
        console.error('⚠️ Gmail falló, intentando Postmark...', gmailError.message);
      }
    }

    // Fallback a Postmark
    if (pm && process.env.POSTMARK_FROM_EMAIL) {
      await pm.sendEmail({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: email,
        Subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
        HtmlBody: htmlBody,
        MessageStream: 'outbound'
      });
      console.log(`✅ Email enviado (Postmark) a: ${email}`);
      return { success: true, method: 'postmark' };
    }

    throw new Error('No hay proveedor de email configurado');

  } catch (error) {
    console.error('❌ Error enviando email:', error);
    return { success: false, method: 'email', error: error.message };
  }
}

// ============================================
// ENVIAR POR WHATSAPP
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo, expiresAt) {
  try {
    const telefonoValidado = validarTelefono(telefono);
    
    if (!telefonoValidado) {
      throw new Error('Formato de teléfono inválido');
    }

    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const mensaje = `🎓 *SkillsCert EC0301*

¡Hola ${nombre}! 👋

✅ *Pago confirmado exitosamente*

🔐 *Tu Código de Acceso:*
\`\`\`${codigo}\`\`\`

⚠️ *Importante:*
• Código personal e intransferible
• Válido hasta: *${fecha}* (90 días)
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
    const { email, nombre, telefono, deliveryMethod } = req.body;

    if (!email || !nombre) {
      return res.status(400).json({ error: 'Email y nombre son obligatorios' });
    }

    const metodosValidos = ['email', 'whatsapp', 'both'];
    const metodo = deliveryMethod || 'email';
    
    if (!metodosValidos.includes(metodo)) {
      return res.status(400).json({ error: 'Método de entrega inválido' });
    }

    if ((metodo === 'whatsapp' || metodo === 'both') && !telefono) {
      return res.status(400).json({ error: 'Teléfono es requerido para WhatsApp' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'SkillsCert - Generador EC0301 Pro',
              description: 'Acceso completo al generador de Carta Descriptiva EC0301',
            },
            unit_amount: 99900,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      metadata: {
        nombre: nombre,
        telefono: telefono || '',
        delivery_method: metodo
      },
      success_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/checkout.html?canceled=true',
    });

    console.log('✅ Checkout session creada:', session.id);
    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('❌ Error creando checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint alternativo (compatibilidad)
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, nombre, telefono, deliveryMethod } = req.body;

    if (!email || !nombre) {
      return res.status(400).json({ error: 'Email y nombre son obligatorios' });
    }

    const metodosValidos = ['email', 'whatsapp', 'both'];
    const metodo = deliveryMethod || 'email';
    
    if (!metodosValidos.includes(metodo)) {
      return res.status(400).json({ error: 'Método de entrega inválido' });
    }

    if ((metodo === 'whatsapp' || metodo === 'both') && !telefono) {
      return res.status(400).json({ error: 'Teléfono es requerido para WhatsApp' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: 'SkillsCert - Generador EC0301 Pro',
              description: 'Acceso completo al generador de Carta Descriptiva EC0301',
            },
            unit_amount: 99900,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      metadata: {
        nombre: nombre,
        telefono: telefono || '',
        delivery_method: metodo
      },
      success_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/success.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://productos-ec0301-1-0-dwk2.onrender.com/checkout.html?canceled=true',
    });

    console.log('✅ Checkout session creada:', session.id);
    res.json({ url: session.url });

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
    console.log('Event ID:', event.id);

    const email = session.customer_email;
    const nombre = session.metadata?.nombre || 'Usuario';
    const telefono = session.metadata?.telefono;
    const deliveryMethod = session.metadata?.delivery_method || 'email';

    if (!email) {
      console.error('❌ No se encontró email');
      return res.status(400).json({ error: 'Email no disponible' });
    }

    try {
      // Generar código
      const codigoAcceso = generarCodigoAcceso();
      console.log('🔐 Código generado:', codigoAcceso);

      // Guardar en base de datos
      const dbResult = await guardarCodigo(email, nombre, codigoAcceso, event.id);
      
      if (!dbResult.success) {
        console.error('❌ Error guardando en BD, pero continuando con envío...');
      }

      const expiresAt = dbResult.expiresAt || new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);

      // Enviar según preferencias
      const resultados = {};

      if (deliveryMethod === 'email' || deliveryMethod === 'both') {
        console.log('📧 Enviando por email...');
        resultados.email = await enviarPorEmail(email, nombre, codigoAcceso, expiresAt);
      }

      if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && telefono) {
        console.log('📱 Enviando por WhatsApp...');
        resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoAcceso, expiresAt);
      }

      const algunoExitoso = 
        (resultados.email?.success) || 
        (resultados.whatsapp?.success);

      if (algunoExitoso) {
        console.log('✅ Código enviado exitosamente');
        res.json({ 
          received: true,
          codigo: codigoAcceso,
          guardadoBD: dbResult.success,
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
      console.error('❌ Error procesando webhook:', error);
      res.status(500).json({ 
        error: 'Error al procesar webhook',
        detalles: error.message 
      });
    }

  } else {
    console.log(`ℹ️ Evento: ${event.type}`);
    res.json({ received: true });
  }
});

// ============================================
// ENDPOINT: LOGIN / VALIDAR CÓDIGO
// ============================================

app.post('/api/login', async (req, res) => {
  try {
    const { email, code } = req.body;

    console.log('🔐 Intento de login:', { email, code });

    if (!email || !code) {
      return res.status(400).json({ 
        success: false,
        error: 'Email y código son requeridos' 
      });
    }

    // Buscar en MySQL
    const sql = `
      SELECT id, email, nombre, code, expires_at, status, login_count
      FROM access_codes
      WHERE email = ? AND code = ?
      LIMIT 1
    `;

    const [rows] = await pool.execute(sql, [email.toLowerCase(), code.toUpperCase()]);

    if (rows.length === 0) {
      console.log('❌ Código no encontrado');
      return res.status(401).json({
        success: false,
        message: 'Código inválido o no encontrado'
      });
    }

    const usuario = rows[0];

    // Verificar estado
    if (usuario.status !== 'active') {
      console.log('❌ Código inactivo:', usuario.status);
      return res.status(401).json({
        success: false,
        message: 'Código inactivo o revocado'
      });
    }

    // Verificar expiración
    const ahora = new Date();
    const expira = new Date(usuario.expires_at);
    
    if (expira < ahora) {
      console.log('❌ Código expirado');
      
      // Marcar como expirado en BD
      await pool.execute(
        'UPDATE access_codes SET status = "expired" WHERE id = ?',
        [usuario.id]
      );
      
      return res.status(401).json({
        success: false,
        message: 'Código expirado'
      });
    }

    // Login exitoso - actualizar último acceso
    await pool.execute(
      'UPDATE access_codes SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?',
      [usuario.id]
    );

    // Generar token simple
    const token = Buffer.from(`${email}:${code}:${Date.now()}`).toString('base64');

    console.log('✅ Login exitoso:', email);

    res.json({
      success: true,
      token: token,
      nombre: usuario.nombre,
      email: usuario.email,
      expiresAt: usuario.expires_at,
      loginCount: usuario.login_count + 1
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// Alias para compatibilidad
app.post('/api/validate-code', async (req, res) => {
  // Redirigir a /api/login
  const { email, accessCode } = req.body;
  req.body = { email, code: accessCode };
  return app._router.handle(req, res);
});

// ============================================
// ENDPOINT: Obtener Info de Sesión
// ============================================

app.get('/api/checkout-session', async (req, res) => {
  const { session_id } = req.query;
  
  if (!session_id) {
    return res.status(400).json({ error: 'session_id es requerido' });
  }

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
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
  const resultados = {};

  try {
    if (metodo === 'email' || metodo === 'both' || !metodo) {
      console.log('🧪 Probando email...');
      resultados.email = await enviarPorEmail(email, nombre, codigoPrueba, expiresAt);
    }

    if ((metodo === 'whatsapp' || metodo === 'both') && telefono) {
      console.log('🧪 Probando WhatsApp...');
      resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoPrueba, expiresAt);
    }

    res.json({
      mensaje: '🧪 Prueba completada',
      codigo: codigoPrueba,
      numeroNegocio: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
      expiresAt: expiresAt.toISOString(),
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
    mysql: process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado',
    stripe: process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado',
    numeroWhatsApp: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
    timestamp: new Date().toISOString()
  };

  console.log('🏥 Health Check:', estado);
  res.json(estado);
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor webhook corriendo en puerto ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('📧 Email:', process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado');
  console.log('📱 WhatsApp Meta API:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado');
  console.log('📱 Número de negocio: +52', WHATSAPP_BUSINESS_NUMBER);
  console.log('🗄️  MySQL:', process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado');
  console.log('💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado');
  console.log('═══════════════════════════════════════════════');
  console.log('\n📋 Endpoints disponibles:');
  console.log('   POST /api/create-checkout      - Crear sesión de pago');
  console.log('   POST /create-checkout-session  - Crear sesión de pago (alias)');
  console.log('   POST /webhook                  - Stripe webhook');
  console.log('   POST /api/login                - Login con código ✨ NUEVO');
  console.log('   POST /api/validate-code        - Validar código (alias)');
  console.log('   GET  /api/checkout-session     - Info de sesión');
  console.log('   GET  /webhook-whatsapp         - Verificación Meta');
  console.log('   POST /webhook-whatsapp         - Recibir mensajes');
  console.log('   GET  /test-envio               - Prueba de envío');
  console.log('   GET  /health                   - Estado del sistema');
  console.log('\n🧪 Prueba:');
  console.log(`   http://localhost:${PORT}/test-envio?email=test@test.com&nombre=Juan&telefono=5538822334&metodo=both`);
  console.log('\n');
});

module.exports = app;

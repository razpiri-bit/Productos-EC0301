// ============================================
// WEBHOOK COMPLETO - SkillsCert EC0301
// MySQL + WhatsApp + Email + Stripe + Login
// ✅ VERSIÓN DEFINITIVA CON TODOS LOS ENDPOINTS
// ============================================

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { nanoid } = require('nanoid');
const postmark = require('postmark');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN - ORDEN CRÍTICO
// ============================================

// Verificar variables de entorno
['STRIPE_SECRET_KEY', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(v => {
  if (!process.env[v]) console.warn(`⚠️ Falta variable de entorno: ${v}`);
});

// 1. CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Webhook de Stripe NECESITA body RAW
app.use('/webhook', express.raw({ type: 'application/json' }));

// 3. JSON parser para las demás rutas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Archivos estáticos
app.use(express.static('public'));

// ============================================
// CONFIG - Meta WhatsApp + MySQL + Email
// ============================================

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
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Email (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: { rejectUnauthorized: false }
});

// Verificar email
transporter.verify((error) => {
  if (error) console.error('❌ Error email:', error.message);
  else console.log('✅ Email transporter listo');
});

// Postmark
const pm = process.env.POSTMARK_SERVER_TOKEN
  ? new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN)
  : null;

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function generarCodigoAcceso() {
  return nanoid(12).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
}

function validarTelefono(telefono) {
  if (!telefono) return null;
  const cleaned = telefono.replace(/\D/g, '');
  if (cleaned.length === 10) return `52${cleaned}`;
  if (cleaned.startsWith('52') && cleaned.length === 12) return cleaned;
  if (telefono.startsWith('+52')) return cleaned;
  return null;
}

// ============================================
// GUARDAR EN BASE DE DATOS
// ============================================

async function guardarCodigo(email, nombre, codigo, stripeEventId) {
  try {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
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
    console.log('✅ Código guardado:', { email, codigo });
    return { success: true, expiresAt };
  } catch (error) {
    console.error('❌ Error BD:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVIAR EMAIL
// ============================================

async function enviarPorEmail(email, nombre, codigo, expiresAt) {
  try {
    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;background:#f9f9f9;padding:20px;">
        <div style="max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:10px;">
          <h1 style="color:#667eea;">🎓 SkillsCert EC0301</h1>
          <p>¡Hola <strong>${nombre}</strong>!</p>
          <p>Tu pago fue procesado exitosamente. Aquí está tu código de acceso:</p>
          <div style="background:#f0f0f0;border:3px solid #667eea;padding:20px;text-align:center;font-size:28px;font-weight:bold;letter-spacing:3px;color:#667eea;margin:20px 0;border-radius:10px;">
            ${codigo}
          </div>
          <p><strong>⚠️ Importante:</strong></p>
          <ul>
            <li>Este código es personal e intransferible</li>
            <li>Válido hasta: <strong>${fecha}</strong> (90 días)</li>
            <li>Guárdalo en un lugar seguro</li>
          </ul>
          <p style="text-align:center;">
            <a href="https://productos-ec0301-1-0-dwk2.onrender.com/login.html" 
               style="display:inline-block;background:#667eea;color:white;padding:15px 40px;text-decoration:none;border-radius:8px;font-weight:bold;">
              🚀 Ingresar a la Plataforma
            </a>
          </p>
          <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
          <p><strong>📚 ¿Qué incluye tu acceso?</strong></p>
          <ul>
            <li>✅ Generador automático de Carta Descriptiva EC0301</li>
            <li>✅ Plan de evaluación personalizado</li>
            <li>✅ Instrumentos de evaluación profesionales</li>
            <li>✅ Material descargable en Word y PDF</li>
            <li>✅ Acceso durante 90 días</li>
          </ul>
          <p><strong>💬 ¿Necesitas ayuda?</strong><br>
          📧 Email: <a href="mailto:info@skillscert.com.mx">info@skillscert.com.mx</a><br>
          📱 WhatsApp: <a href="https://wa.me/525538822334">+52 55 3882 2334</a></p>
        </div>
      </body>
      </html>
    `;

    // Intentar Gmail
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      const info = await transporter.sendMail({
        from: `"SkillsCert EC0301" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
        html: htmlBody
      });
      console.log('✅ Email enviado (Gmail):', email);
      return { success: true, method: 'gmail', id: info.messageId };
    }

    // Fallback Postmark
    if (pm && process.env.POSTMARK_FROM_EMAIL) {
      const result = await pm.sendEmail({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: email,
        Subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
        HtmlBody: htmlBody,
        MessageStream: 'outbound'
      });
      console.log('✅ Email enviado (Postmark):', email);
      return { success: true, method: 'postmark', id: result.MessageID };
    }

    throw new Error('No hay proveedor de email');
  } catch (error) {
    console.error('❌ Error email:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVIAR WHATSAPP
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo, expiresAt) {
  try {
    const telefonoFormateado = validarTelefono(telefono);
    if (!telefonoFormateado) throw new Error('Teléfono inválido');

    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const mensaje = `🎓 *SkillsCert EC0301*\n\n¡Hola ${nombre}!\nTu pago fue procesado ✅\n\n🔑 *Código:* ${codigo}\n📅 Válido hasta: ${fecha}\n\n🚀 Ingresa:\nhttps://productos-ec0301-1-0-dwk2.onrender.com/login.html`;

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

    await axios.post(url, {
      messaging_product: 'whatsapp',
      to: telefonoFormateado,
      type: 'text',
      text: { body: mensaje }
    }, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ WhatsApp enviado:', telefonoFormateado);
    return { success: true };
  } catch (error) {
    console.error('❌ Error WhatsApp:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// 🔥 CREAR CHECKOUT SESSION (NUEVO)
// ============================================

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { priceId, email, phone } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'priceId es requerido' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${req.headers.origin || 'https://productos-ec0301-1-0-dwk2.onrender.com'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://productos-ec0301-1-0-dwk2.onrender.com'}/cancel.html`,
      customer_email: email,
      metadata: { phone: phone || '' },
      phone_number_collection: { enabled: true }
    });

    console.log('✅ Checkout session creada:', session.id);
    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('❌ Error creando checkout:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Alias para compatibilidad
app.post('/create-checkout-session', async (req, res) => {
  req.body.priceId = req.body.priceId || req.body.price_id;
  return app._router.stack
    .find(r => r.route?.path === '/api/create-checkout')
    .route.stack[0].handle(req, res);
});

// ============================================
// WEBHOOK DE STRIPE
// ============================================

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('✅ Webhook verificado:', event.type);
  } catch (err) {
    console.error('❌ Webhook inválido:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  console.log('\n🎉 PAGO COMPLETADO');

  try {
    const email = session.customer_details?.email || session.customer_email;
    const nombre = session.customer_details?.name || 'Cliente';
    const telefono = session.customer_details?.phone || session.metadata?.phone;

    if (!email) throw new Error('Email no encontrado');

    const codigo = generarCodigoAcceso();
    console.log('🔑 Código generado:', codigo);

    const dbResult = await guardarCodigo(email, nombre, codigo, event.id);
    if (!dbResult.success) throw new Error(dbResult.error);

    await enviarPorEmail(email, nombre, codigo, dbResult.expiresAt);
    if (telefono) await enviarPorWhatsApp(telefono, nombre, codigo, dbResult.expiresAt);

    console.log('✅ PROCESO COMPLETADO\n');
    res.json({ received: true, codigo, email });

  } catch (error) {
    console.error('❌ Error webhook:', error.message);
    res.json({ received: true, error: error.message });
  }
});

// ============================================
// LOGIN Y VALIDACIÓN
// ============================================

app.post('/api/login', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'Email y código requeridos' });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM access_codes WHERE email=? AND code=? LIMIT 1`,
      [email.toLowerCase().trim(), code.toUpperCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Código inválido' });
    }

    const usuario = rows[0];

    if (usuario.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Código inactivo' });
    }

    if (new Date(usuario.expires_at) < new Date()) {
      await pool.execute('UPDATE access_codes SET status="expired" WHERE id=?', [usuario.id]);
      return res.status(401).json({ success: false, message: 'Código expirado' });
    }

    await pool.execute(
      'UPDATE access_codes SET last_login=NOW(), login_count=login_count+1 WHERE id=?',
      [usuario.id]
    );

    const token = Buffer.from(`${email}:${code}:${Date.now()}`).toString('base64');

    console.log('✅ Login exitoso:', email);

    res.json({
      success: true,
      token,
      nombre: usuario.nombre,
      email: usuario.email,
      expiresAt: usuario.expires_at,
      loginCount: usuario.login_count + 1
    });

  } catch (error) {
    console.error('❌ Error login:', error.message);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// Alias para compatibilidad
app.post('/api/validate-code', async (req, res) => {
  req.body.code = req.body.code || req.body.accessCode;
  return app._router.stack
    .find(r => r.route?.path === '/api/login')
    .route.stack[0].handle(req, res);
});

// ============================================
// 🔥 OBTENER INFO DE SESIÓN (NUEVO)
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
    console.error('❌ Error obteniendo sesión:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 🔥 TEST DE ENVÍO (NUEVO)
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
      resultados
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

app.get('/health', async (req, res) => {
  let mysqlStatus = '❌';
  try {
    await pool.query('SELECT 1');
    mysqlStatus = '✅ Conectado';
  } catch (e) {
    mysqlStatus = '❌ ' + e.message;
  }

  res.json({
    servidor: '✅ Activo',
    mysql: mysqlStatus,
    stripe: process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado',
    email: process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado',
    whatsapp: WHATSAPP_TOKEN ? '✅ Configurado' : '❌ No configurado',
    numeroWhatsApp: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// MANEJO DE ERRORES 404
// ============================================

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Endpoint no encontrado',
      path: req.path
    });
  }
  res.status(404).send('Página no encontrada');
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor webhook corriendo en puerto ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('📧 Email:', process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado');
  console.log('📱 WhatsApp:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado');
  console.log('📱 Número: +52', WHATSAPP_BUSINESS_NUMBER);
  console.log('🗄️  MySQL:', process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado');
  console.log('💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado');
  console.log('═══════════════════════════════════════════════');
  console.log('\n📋 Endpoints disponibles:');
  console.log('   POST /api/create-checkout      - Crear sesión de pago ✨ NUEVO');
  console.log('   POST /create-checkout-session  - Crear sesión (alias) ✨ NUEVO');
  console.log('   POST /webhook                  - Stripe webhook');
  console.log('   POST /api/login                - Login con código');
  console.log('   POST /api/validate-code        - Validar código (alias)');
  console.log('   GET  /api/checkout-session     - Info de sesión ✨ NUEVO');
  console.log('   GET  /test-envio               - Prueba de envío ✨ NUEVO');
  console.log('   GET  /health                   - Estado del sistema');
  console.log('\n🧪 Pruebas:');
  console.log(`   http://localhost:${PORT}/test-envio?email=test@test.com&nombre=Juan&metodo=email`);
  console.log(`   http://localhost:${PORT}/health`);
  console.log('\n');
});

module.exports = app;

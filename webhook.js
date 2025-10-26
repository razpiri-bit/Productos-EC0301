// ============================================
// WEBHOOK COMPLETO - SkillsCert EC0301
// MySQL + WhatsApp + Email + Stripe + Login
// ✅ VERSIÓN CORREGIDA Y LISTA PARA DEPLOY EN RENDER
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

// ✅ Verificar variables de entorno al inicio
['STRIPE_SECRET_KEY', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].forEach(v => {
  if (!process.env[v]) console.warn(`⚠️ Falta variable de entorno: ${v}`);
});

// 1. CORS
app.use(cors({
  origin: [
    'https://productos-ec0301-1-0-dwk2.onrender.com',
    'http://localhost:3000'
  ],
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
// CONFIG GLOBAL - Meta WhatsApp + MySQL + Email
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
  queueLimit: 0
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

// Verificar conexión del email
transporter.verify((error) => {
  if (error) console.error('❌ Error configuración email:', error.message);
  else console.log('✅ Email transporter listo para enviar');
});

// Postmark opcional
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
    console.log('✅ Código guardado en BD:', { email, codigo });
    return { success: true, expiresAt };
  } catch (error) {
    console.error('❌ Error guardando código en BD:', error.message);
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
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlBody = `
      <div style="font-family: Arial; background:#f9f9f9; padding:20px;">
        <h2>🎓 SkillsCert EC0301</h2>
        <p>¡Hola ${nombre}! Tu pago fue procesado exitosamente.</p>
        <p><strong>Código de acceso:</strong></p>
        <div style="background:#fff;border:3px solid #667eea;padding:10px;font-size:24px;text-align:center;">
          ${codigo}
        </div>
        <p>Válido hasta: <strong>${fecha}</strong> (90 días)</p>
        <a href="https://productos-ec0301-1-0-dwk2.onrender.com/login.html" 
           style="background:#667eea;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">🚀 Ingresar a la Plataforma</a>
      </div>
    `;

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

    throw new Error('No hay proveedor de email configurado');
  } catch (error) {
    console.error('❌ Error enviando email:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVIAR POR WHATSAPP (Meta Cloud API)
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo, expiresAt) {
  try {
    const telefonoFormateado = validarTelefono(telefono);
    if (!telefonoFormateado) throw new Error('Teléfono inválido');

    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const mensaje = `🎓 *SkillsCert EC0301*\n\n¡Hola ${nombre}!\nTu pago fue procesado ✅\n\n🔑 *Código:* ${codigo}\n📅 Válido hasta: ${fecha}\n\n🚀 Ingresa aquí:\nhttps://productos-ec0301-1-0-dwk2.onrender.com/login.html`;

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: telefonoFormateado,
        type: 'text',
        text: { body: mensaje }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ WhatsApp enviado a:', telefonoFormateado);
    return { success: true };
  } catch (error) {
    console.error('❌ Error WhatsApp:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

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

  if (event.type !== 'checkout.session.completed') return res.json({ received: true });

  const session = event.data.object;
  const email = session.customer_details?.email || session.customer_email;
  const nombre = session.customer_details?.name || 'Cliente';
  const telefono = session.customer_details?.phone || session.metadata?.phone;

  try {
    const codigo = generarCodigoAcceso();
    const dbResult = await guardarCodigo(email, nombre, codigo, event.id);
    if (!dbResult.success) throw new Error(dbResult.error);

    await enviarPorEmail(email, nombre, codigo, dbResult.expiresAt);
    if (telefono) await enviarPorWhatsApp(telefono, nombre, codigo, dbResult.expiresAt);

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    res.json({ received: true });
  }
});

// ============================================
// LOGIN Y VALIDACIÓN DE CÓDIGOS
// ============================================

app.post('/api/login', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ success: false, error: 'Email y código requeridos' });

    const [rows] = await pool.execute(
      `SELECT * FROM access_codes WHERE email=? AND code=? LIMIT 1`,
      [email.toLowerCase().trim(), code.toUpperCase().trim()]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Código inválido' });

    const usuario = rows[0];
    if (usuario.status !== 'active')
      return res.status(401).json({ success: false, message: 'Código inactivo' });

    if (new Date(usuario.expires_at) < new Date()) {
      await pool.execute('UPDATE access_codes SET status="expired" WHERE id=?', [usuario.id]);
      return res.status(401).json({ success: false, message: 'Código expirado' });
    }

    await pool.execute(
      'UPDATE access_codes SET last_login=NOW(), login_count=login_count+1 WHERE id=?',
      [usuario.id]
    );

    const token = Buffer.from(`${email}:${code}:${Date.now()}`).toString('base64');
    res.json({
      success: true,
      token,
      nombre: usuario.nombre,
      expiresAt: usuario.expires_at
    });
  } catch (error) {
    console.error('❌ Error login:', error.message);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  let mysqlStatus = '❌';
  try {
    await pool.query('SELECT 1');
    mysqlStatus = '✅';
  } catch (e) {
    mysqlStatus = '❌ ' + e.message;
  }

  res.json({
    servidor: '✅ Activo',
    mysql: mysqlStatus,
    stripe: process.env.STRIPE_SECRET_KEY ? '✅' : '❌',
    email: process.env.EMAIL_USER ? '✅' : '❌',
    whatsapp: WHATSAPP_TOKEN ? '✅' : '❌',
    hora: new Date().toISOString()
  });
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
  console.log('🌐 URL base: https://productos-ec0301-1-0-dwk2.onrender.com');
  console.log('📬 Ready to receive Stripe Webhooks');
});

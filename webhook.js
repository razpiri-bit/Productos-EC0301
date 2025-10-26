// ============================================
// WEBHOOK COMPLETO - SkillsCert EC0301 V3.0
// MySQL + WhatsApp Cloud API + Email + Stripe
// Autor: SkillsCert Team
// Última actualización: 2025
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
const path = require('path');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN - ORDEN CRÍTICO
// ============================================

// Verificar variables de entorno críticas
const REQUIRED_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME'
];

REQUIRED_VARS.forEach(v => {
  if (!process.env[v]) {
    console.error(`❌ FALTA VARIABLE CRÍTICA: ${v}`);
  }
});

// 1. CORS primero
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
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
// CONFIG - WhatsApp + MySQL + Email
// ============================================

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_BUSINESS_NUMBER = process.env.WHATSAPP_BUSINESS_NUMBER || '5538822334';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// MySQL Pool con reconexión automática
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '+00:00'
});

// Verificar conexión MySQL al inicio
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL conectado correctamente');
    connection.release();
  })
  .catch(error => {
    console.error('❌ Error conectando a MySQL:', error.message);
  });

// Email transporter (Gmail)
const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: { rejectUnauthorized: false }
});

// Verificar email
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  gmailTransporter.verify()
    .then(() => console.log('✅ Gmail transporter listo'))
    .catch(error => console.error('❌ Error Gmail:', error.message));
}

// Postmark (alternativa)
const pmClient = process.env.POSTMARK_SERVER_TOKEN
  ? new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN)
  : null;

if (pmClient) {
  console.log('✅ Postmark configurado');
}

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

function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// ============================================
// BASE DE DATOS - FUNCIONES
// ============================================

async function guardarCodigo(email, nombre, codigo, stripeEventId, stripeSessionId, telefono = null, deliveryMethod = 'email') {
  try {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * (parseInt(process.env.CODE_EXPIRATION_DAYS) || 90));
    
    const sql = `
      INSERT INTO access_codes 
        (email, nombre, telefono, code, expires_at, status, stripe_event_id, stripe_session_id, delivery_method)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        code = VALUES(code),
        stripe_event_id = VALUES(stripe_event_id),
        expires_at = VALUES(expires_at)
    `;
    
    const [result] = await pool.execute(sql, [
      email.toLowerCase().trim(),
      nombre.trim().slice(0, 255),
      telefono,
      codigo,
      expiresAt,
      stripeEventId,
      stripeSessionId,
      deliveryMethod
    ]);
    
    console.log('✅ Código guardado en BD:', { email, codigo, id: result.insertId });
    return { success: true, expiresAt, id: result.insertId };
  } catch (error) {
    console.error('❌ Error guardando en BD:', error.message);
    return { success: false, error: error.message };
  }
}

async function registrarEmail(accessCodeId, email, subject, status, provider, messageId = null, errorMessage = null) {
  try {
    const sql = `
      INSERT INTO email_logs 
        (access_code_id, email, subject, status, provider, message_id, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [accessCodeId, email, subject, status, provider, messageId, errorMessage]);
  } catch (error) {
    console.error('❌ Error registrando email log:', error.message);
  }
}

async function registrarWhatsApp(accessCodeId, phone, status, messageId = null, errorMessage = null) {
  try {
    const sql = `
      INSERT INTO whatsapp_logs 
        (access_code_id, phone, status, message_id, error_message)
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [accessCodeId, phone, status, messageId, errorMessage]);
  } catch (error) {
    console.error('❌ Error registrando WhatsApp log:', error.message);
  }
}

async function registrarEventoStripe(eventData) {
  try {
    const sql = `
      INSERT INTO stripe_events 
        (event_id, event_type, session_id, customer_email, amount_total, currency, payment_status, raw_data, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE processed = VALUES(processed)
    `;
    
    await pool.execute(sql, [
      eventData.id,
      eventData.type,
      eventData.data?.object?.id || null,
      eventData.data?.object?.customer_details?.email || null,
      eventData.data?.object?.amount_total || null,
      eventData.data?.object?.currency || null,
      eventData.data?.object?.payment_status || null,
      JSON.stringify(eventData),
      false
    ]);
  } catch (error) {
    console.error('❌ Error registrando evento Stripe:', error.message);
  }
}

// ============================================
// ENVIAR EMAIL
// ============================================

async function enviarPorEmail(email, nombre, codigo, expiresAt, accessCodeId = null) {
  try {
    if (!validarEmail(email)) {
      throw new Error('Email inválido');
    }

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family:Arial,sans-serif;background:#f9f9f9;padding:20px;margin:0;">
        <div style="max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:15px;box-shadow:0 10px 30px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <div style="text-align:center;padding-bottom:20px;border-bottom:3px solid #667eea;">
            <h1 style="color:#667eea;margin:0;font-size:32px;">🎓 SkillsCert</h1>
            <p style="color:#6B7280;margin:5px 0 0 0;">EC0301 - Diseño de Cursos de Capacitación</p>
          </div>
          
          <!-- Saludo -->
          <div style="padding:30px 0 20px 0;">
            <p style="font-size:18px;color:#1F2937;margin:0;">¡Hola <strong>${nombre}</strong>! 👋</p>
            <p style="color:#6B7280;margin:10px 0 0 0;">Tu pago fue procesado exitosamente.</p>
          </div>
          
          <!-- Código -->
          <div style="background:#F3F4F6;border:3px solid #667eea;padding:25px;text-align:center;border-radius:10px;margin:20px 0;">
            <p style="margin:0 0 10px 0;color:#6B7280;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Tu Código de Acceso</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:4px;color:#667eea;font-family:monospace;">
              ${codigo}
            </div>
          </div>
          
          <!-- Información importante -->
          <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:15px;margin:20px 0;border-radius:5px;">
            <p style="margin:0 0 10px 0;font-weight:bold;color:#92400E;">⚠️ Importante:</p>
            <ul style="margin:0;padding-left:20px;color:#92400E;">
              <li>Este código es personal e intransferible</li>
              <li>Válido hasta: <strong>${fecha}</strong></li>
              <li>Guárdalo en un lugar seguro</li>
              <li>No lo compartas con nadie</li>
            </ul>
          </div>
          
          <!-- Botón de acceso -->
          <div style="text-align:center;margin:30px 0;">
            <a href="${APP_URL}/login.html" 
               style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:15px 40px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
              🚀 Ingresar a la Plataforma
            </a>
          </div>
          
          <!-- Beneficios -->
          <div style="border-top:1px solid #E5E7EB;padding-top:20px;margin-top:30px;">
            <p style="font-weight:bold;color:#1F2937;margin:0 0 15px 0;">📚 ¿Qué incluye tu acceso?</p>
            <ul style="color:#6B7280;margin:0;padding-left:20px;line-height:1.8;">
              <li>✅ Generador automático de Carta Descriptiva EC0301</li>
              <li>✅ Plan de evaluación personalizado</li>
              <li>✅ Instrumentos de evaluación profesionales</li>
              <li>✅ Exportación a Word y PDF</li>
              <li>✅ Asistente de IA para objetivos de aprendizaje</li>
              <li>✅ Acceso durante ${process.env.CODE_EXPIRATION_DAYS || 90} días</li>
            </ul>
          </div>
          
          <!-- Soporte -->
          <div style="background:#F9FAFB;padding:20px;border-radius:8px;margin-top:20px;">
            <p style="font-weight:bold;color:#1F2937;margin:0 0 10px 0;">💬 ¿Necesitas ayuda?</p>
            <p style="margin:0;color:#6B7280;">
              📧 <a href="mailto:info@skillscert.com.mx" style="color:#667eea;text-decoration:none;">info@skillscert.com.mx</a><br>
              📱 <a href="https://wa.me/52${WHATSAPP_BUSINESS_NUMBER}" style="color:#667eea;text-decoration:none;">+52 ${WHATSAPP_BUSINESS_NUMBER}</a>
            </p>
          </div>
          
          <!-- Footer -->
          <div style="text-align:center;padding-top:20px;margin-top:30px;border-top:1px solid #E5E7EB;">
            <p style="color:#9CA3AF;font-size:12px;margin:0;">
              © 2025 SkillsCert México. Todos los derechos reservados.<br>
              <em>Tu aliado en certificación profesional</em>
            </p>
          </div>
          
        </div>
      </body>
      </html>
    `;

    let resultado = null;
    let provider = null;

    // Intentar Gmail primero
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        const info = await gmailTransporter.sendMail({
          from: `"SkillsCert EC0301" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
          html: htmlBody
        });
        
        provider = 'gmail';
        resultado = { success: true, method: 'gmail', id: info.messageId };
        console.log('✅ Email enviado (Gmail):', email);
        
        if (accessCodeId) {
          await registrarEmail(accessCodeId, email, 'Tu Código de Acceso - SkillsCert EC0301', 'sent', 'gmail', info.messageId);
        }
        
        return resultado;
      } catch (gmailError) {
        console.warn('⚠️ Gmail falló, intentando Postmark...', gmailError.message);
      }
    }

    // Fallback a Postmark
    if (pmClient && process.env.POSTMARK_FROM_EMAIL) {
      try {
        const result = await pmClient.sendEmail({
          From: process.env.POSTMARK_FROM_EMAIL,
          To: email,
          Subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
          HtmlBody: htmlBody,
          MessageStream: 'outbound'
        });
        
        provider = 'postmark';
        resultado = { success: true, method: 'postmark', id: result.MessageID };
        console.log('✅ Email enviado (Postmark):', email);
        
        if (accessCodeId) {
          await registrarEmail(accessCodeId, email, 'Tu Código de Acceso - SkillsCert EC0301', 'sent', 'postmark', result.MessageID);
        }
        
        return resultado;
      } catch (postmarkError) {
        console.error('❌ Postmark falló:', postmarkError.message);
      }
    }

    throw new Error('No hay proveedor de email disponible');
    
  } catch (error) {
    console.error('❌ Error enviando email:', error.message);
    
    if (accessCodeId) {
      await registrarEmail(accessCodeId, email, 'Tu Código de Acceso - SkillsCert EC0301', 'failed', provider || 'unknown', null, error.message);
    }
    
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVIAR WHATSAPP
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo, expiresAt, accessCodeId = null) {
  try {
    const telefonoFormateado = validarTelefono(telefono);
    
    if (!telefonoFormateado) {
      throw new Error('Teléfono inválido');
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error('WhatsApp no configurado');
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
• Válido hasta: *${fecha}*
• Guárdalo en lugar seguro

🚀 *Accede aquí:*
${APP_URL}/login.html

📚 *Incluye:*
✅ Generador de Carta Descriptiva
✅ Plan de evaluación personalizado
✅ Instrumentos profesionales
✅ Descarga en Word y PDF
✅ Asistente de IA
✅ Acceso durante ${process.env.CODE_EXPIRATION_DAYS || 90} días

💬 *¿Necesitas ayuda?*
📧 info@skillscert.com.mx
📱 +52 ${WHATSAPP_BUSINESS_NUMBER}

_SkillsCert - Tu aliado en certificación_`;

    const response = await axios.post(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefonoFormateado,
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
        },
        timeout: 10000
      }
    );

    console.log('✅ WhatsApp enviado a:', `+${telefonoFormateado}`);
    
    if (accessCodeId) {
      await registrarWhatsApp(accessCodeId, `+${telefonoFormateado}`, 'sent', response.data.messages[0].id);
    }

    return {
      success: true,
      method: 'whatsapp',
      phone: `+${telefonoFormateado}`,
      messageId: response.data.messages[0].id
    };

  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    
    if (accessCodeId) {
      await registrarWhatsApp(accessCodeId, telefono, 'failed', null, error.message);
    }

    return {
      success: false,
      method: 'whatsapp',
      error: error.response?.data?.error?.message || error.message
    };
  }
}

// ============================================
// ENDPOINT: Crear Checkout Session
// ============================================

app.post(['/create-checkout-session', '/api/create-checkout'], async (req, res) => {
  try {
    const { priceId, email, phone } = req.body;

    console.log('📦 Nueva sesión de checkout:', { email, phone, priceId });

    if (!priceId) {
      return res.status(400).json({ error: 'priceId es requerido' });
    }

    if (!email || !validarEmail(email)) {
      return res.status(400).json({ error: 'Email válido es requerido' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${APP_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/index.html`,
      customer_email: email,
      metadata: {
        phone: phone || '',
        source: 'skillscert_ec0301'
      }
    });

    console.log('✅ Sesión creada:', session.id);

    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('❌ Error creando checkout:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK: Stripe
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
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('\n📨 Evento Stripe recibido:', event.type);

  // Registrar evento
  await registrarEventoStripe(event);

  // Procesar solo pagos completados
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true, event: event.type });
  }

  const session = event.data.object;
  console.log('🎉 PAGO COMPLETADO');

  try {
    const email = session.customer_details?.email || session.customer_email;
    const nombre = session.customer_details?.name || 'Cliente';
    const telefono = session.customer_details?.phone || session.metadata?.phone;

    if (!email) {
      throw new Error('Email no encontrado en la sesión');
    }

    // Generar código
    const codigo = generarCodigoAcceso();
    console.log('🔑 Código generado:', codigo);

    // Guardar en BD
    const dbResult = await guardarCodigo(
      email,
      nombre,
      codigo,
      event.id,
      session.id,
      telefono,
      telefono ? 'both' : 'email'
    );

    if (!dbResult.success) {
      throw new Error('Error guardando en base de datos');
    }

    const accessCodeId = dbResult.id;

    // Enviar por email
    const emailResult = await enviarPorEmail(email, nombre, codigo, dbResult.expiresAt, accessCodeId);

    // Enviar por WhatsApp si hay teléfono
    let whatsappResult = null;
    if (telefono) {
      whatsappResult = await enviarPorWhatsApp(telefono, nombre, codigo, dbResult.expiresAt, accessCodeId);
    }

    // Marcar evento como procesado
    await pool.execute(
      'UPDATE stripe_events SET processed = TRUE WHERE event_id = ?',
      [event.id]
    );

    console.log('✅ PROCESO COMPLETADO\n');

    res.json({
      received: true,
      codigo,
      email,
      emailSent: emailResult.success,
      whatsappSent: whatsappResult?.success || false
    });

  } catch (error) {
    console.error('❌ Error procesando webhook:', error.message);
    res.status(500).json({ received: true, error: error.message });
  }
});

// ============================================
// LOGIN Y VALIDACIÓN
// ============================================

app.post(['/api/login', '/api/validate-code'], async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { email, code, accessCode } = req.body;
    const finalCode = code || accessCode;

    if (!email || !finalCode) {
      return res.status(400).json({
        success: false,
        error: 'Email y código son requeridos'
      });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM access_codes 
       WHERE email = ? AND code = ? 
       LIMIT 1`,
      [email.toLowerCase().trim(), finalCode.toUpperCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Código inválido o no encontrado'
      });
    }

    const usuario = rows[0];

    // Verificar estado
    if (usuario.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: `Código ${usuario.status === 'expired' ? 'expirado' : 'inactivo'}`
      });
    }

    // Verificar fecha de expiración
    if (new Date(usuario.expires_at) < new Date()) {
      await pool.execute(
        'UPDATE access_codes SET status = "expired" WHERE id = ?',
        [usuario.id]
      );
      return res.status(401).json({
        success: false,
        message: 'Código expirado'
      });
    }

    // Actualizar último login
    await pool.execute(
      'UPDATE access_codes SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?',
      [usuario.id]
    );

    // Crear token
    const token = Buffer.from(`${email}:${finalCode}:${Date.now()}`).toString('base64');

    // Registrar actividad
    await pool.execute(
      `INSERT INTO user_activity (access_code_id, activity_type, description, ip_address, user_agent)
       VALUES (?, 'login', 'Login exitoso', ?, ?)`,
      [usuario.id, req.ip, req.headers['user-agent']]
    );

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
    console.error('❌ Error en login:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// ============================================
// VALIDAR SESIÓN
// ============================================

app.post('/api/validate-session', async (req, res) => {
  try {
    const { email, token } = req.body;
    const authHeader = req.headers['authorization'];

    if (!email || (!token && !authHeader)) {
      return res.status(400).json({ success: false, error: 'Datos incompletos' });
    }

    const finalToken = token || authHeader?.replace('Bearer ', '');

    // Decodificar token
    let decodedEmail, decodedCode;
    try {
      const decoded = Buffer.from(finalToken, 'base64').toString('utf-8');
      [decodedEmail, decodedCode] = decoded.split(':');
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Token inválido' });
    }

    if (decodedEmail !== email) {
      return res.status(401).json({ success: false, error: 'Token no coincide' });
    }

    // Verificar en BD
    const [rows] = await pool.execute(
      `SELECT * FROM access_codes WHERE email = ? AND code = ? AND status = 'active' LIMIT 1`,
      [email.toLowerCase(), decodedCode.toUpperCase()]
    );

    if (rows.length === 0 || new Date(rows[0].expires_at) < new Date()) {
      return res.status(401).json({ success: false, error: 'Sesión expirada' });
    }

    res.json({
      success: true,
      valid: true,
      expiresAt: rows[0].expires_at
    });

  } catch (error) {
    console.error('❌ Error validando sesión:', error.message);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// ============================================
// OBTENER INFO DE SESIÓN DE STRIPE
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
// TEST DE ENVÍO
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
  let mysqlDetails = '';

  try {
    await pool.query('SELECT 1');
    mysqlStatus = '✅ Conectado';
    
    // Obtener estadísticas
    const [stats] = await pool.query('CALL get_statistics()');
    mysqlDetails = stats[0][0];
  } catch (e) {
    mysqlStatus = '❌ ' + e.message;
  }

  res.json({
    status: '✅ Sistema operativo',
    timestamp: new Date().toISOString(),
    services: {
      mysql: mysqlStatus,
      stripe: process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado',
      email: process.env.EMAIL_USER ? '✅ Gmail' : (pmClient ? '✅ Postmark' : '❌ No configurado'),
      whatsapp: (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado'
    },
    config: {
      whatsappNumber: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
      appUrl: APP_URL,
      codeExpirationDays: process.env.CODE_EXPIRATION_DAYS || 90
    },
    statistics: mysqlDetails || null
  });
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
    console.log('❌ Verificación WhatsApp fallida');
    res.sendStatus(403);
  }
});

app.post('/webhook-whatsapp', async (req, res) => {
  try {
    const body = req.body;
    
    // Verificar que sea una notificación de WhatsApp
    if (body.object === 'whatsapp_business_account') {
      console.log('📱 Notificación WhatsApp recibida');
      
      // Procesar cambios de estado de mensajes
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.statuses) {
        const statuses = body.entry[0].changes[0].value.statuses;
        
        for (const status of statuses) {
          const messageId = status.id;
          const newStatus = status.status; // 'delivered', 'read', etc.
          
          // Actualizar en BD
          if (newStatus === 'delivered') {
            await pool.execute(
              'UPDATE whatsapp_logs SET status = "delivered", delivered_at = NOW() WHERE message_id = ?',
              [messageId]
            );
          } else if (newStatus === 'read') {
            await pool.execute(
              'UPDATE whatsapp_logs SET status = "read", read_at = NOW() WHERE message_id = ?',
              [messageId]
            );
          }
          
          console.log(`📬 Mensaje ${messageId}: ${newStatus}`);
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error procesando webhook WhatsApp:', error);
    res.sendStatus(500);
  }
});

// ============================================
// RUTAS ESTÁTICAS
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
// MANEJO DE ERRORES GLOBALES
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// INICIO DEL SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 SkillsCert EC0301 - Servidor activo en puerto ${PORT}`);
  console.log('='.repeat(50));
  console.log('\n📋 SERVICIOS:');
  console.log('   📧 Email:', process.env.EMAIL_USER ? '✅ Gmail' : (pmClient ? '✅ Postmark' : '❌'));
  console.log('   📱 WhatsApp:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅' : '❌');
  console.log('   📱 Número:', `+52 ${WHATSAPP_BUSINESS_NUMBER}`);
  console.log('   🗄️  MySQL:', process.env.DB_HOST ? '✅' : '❌');
  console.log('   💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅' : '❌');
  console.log('\n📋 ENDPOINTS:');
  console.log('   POST /create-checkout-session');
  console.log('   POST /webhook');
  console.log('   POST /api/login');
  console.log('   POST /api/validate-code');
  console.log('   POST /api/validate-session');
  console.log('   GET  /api/checkout-session');
  console.log('   GET  /test-envio');
  console.log('   GET  /health');
  console.log('   GET  /webhook-whatsapp');
  console.log('   POST /webhook-whatsapp');
  console.log('\n🧪 PRUEBAS:');
  console.log(`   curl http://localhost:${PORT}/health`);
  console.log(`   curl "http://localhost:${PORT}/test-envio?email=test@test.com&nombre=Juan&metodo=email"`);
  console.log('\n' + '='.repeat(50) + '\n');
});

module.exports = app;

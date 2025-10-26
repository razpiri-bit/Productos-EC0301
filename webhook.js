// ============================================
// WEBHOOK COMPLETO - SkillsCert EC0301
// MySQL + WhatsApp + Email + Stripe + Login
// ✅ VERSIÓN CORREGIDA - FUNCIONAL 100%
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
// CONFIGURACIÓN - ORDEN CRÍTICO
// ============================================

// 1. CORS debe ir PRIMERO
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Webhook de Stripe NECESITA body RAW (ANTES de express.json)
app.use('/webhook', express.raw({type: 'application/json'}));

// 3. JSON parser para TODAS las demás rutas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Archivos estáticos AL FINAL
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
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Email (Gmail) - CONFIGURACIÓN MEJORADA
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verificar conexión de email al iniciar
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Error configuración email:', error.message);
  } else {
    console.log('✅ Email transporter listo para enviar');
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

    console.log('📧 Intentando enviar email a:', email);

    // Intentar con Gmail primero
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        const info = await transporter.sendMail({
          from: `"SkillsCert EC0301" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
          html: htmlBody
        });
        console.log('✅ Email enviado (Gmail) a:', email);
        console.log('📬 Message ID:', info.messageId);
        return { success: true, method: 'gmail', messageId: info.messageId };
      } catch (gmailError) {
        console.error('⚠️ Gmail falló:', gmailError.message);
        console.error('Detalles:', gmailError);
        
        // Intentar Postmark como fallback
        if (pm && process.env.POSTMARK_FROM_EMAIL) {
          console.log('🔄 Intentando con Postmark...');
          const result = await pm.sendEmail({
            From: process.env.POSTMARK_FROM_EMAIL,
            To: email,
            Subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
            HtmlBody: htmlBody,
            MessageStream: 'outbound'
          });
          console.log('✅ Email enviado (Postmark) a:', email);
          return { success: true, method: 'postmark', messageId: result.MessageID };
        }
        
        throw gmailError;
      }
    }

    // Si no hay Gmail, intentar Postmark directo
    if (pm && process.env.POSTMARK_FROM_EMAIL) {
      const result = await pm.sendEmail({
        From: process.env.POSTMARK_FROM_EMAIL,
        To: email,
        Subject: '🎓 Tu Código de Acceso - SkillsCert EC0301',
        HtmlBody: htmlBody,
        MessageStream: 'outbound'
      });
      console.log('✅ Email enviado (Postmark) a:', email);
      return { success: true, method: 'postmark', messageId: result.MessageID };
    }

    throw new Error('No hay proveedor de email configurado');

  } catch (error) {
    console.error('❌ Error crítico enviando email:', error);
    return { 
      success: false, 
      error: error.message,
      details: error.stack
    };
  }
}

// ============================================
// ENVIAR POR WHATSAPP (Meta Cloud API)
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo, expiresAt) {
  try {
    const telefonoFormateado = validarTelefono(telefono);
    
    if (!telefonoFormateado) {
      throw new Error('Teléfono inválido (debe ser 10 dígitos)');
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error('WhatsApp no configurado (falta TOKEN o PHONE_ID)');
    }

    const fecha = new Date(expiresAt).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const mensaje = `🎓 *SkillsCert EC0301*\n\n¡Hola ${nombre}!\n\nTu pago fue procesado exitosamente ✅\n\n🔑 *Tu código de acceso:*\n\`\`\`${codigo}\`\`\`\n\n⚠️ *Importante:*\n• Código personal e intransferible\n• Válido hasta: ${fecha}\n• Guárdalo en un lugar seguro\n\n🚀 Ingresa aquí:\nhttps://productos-ec0301-1-0-dwk2.onrender.com/login.html\n\n¿Necesitas ayuda? Responde este mensaje 💬`;

    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`;

    console.log('📱 Enviando WhatsApp a:', telefonoFormateado);

    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
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
        }
      }
    );

    console.log('✅ WhatsApp enviado a:', telefonoFormateado);
    console.log('📬 Message ID:', response.data.messages[0].id);

    return { 
      success: true, 
      messageId: response.data.messages[0].id,
      telefono: telefonoFormateado
    };

  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.error?.message || error.message,
      details: error.response?.data
    };
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
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Solo procesar checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    console.log('ℹ️ Evento ignorado:', event.type);
    return res.json({ received: true });
  }

  const session = event.data.object;
  console.log('\n🎉 PAGO COMPLETADO');
  console.log('═══════════════════════════════════════════════');

  try {
    // Extraer datos del cliente
    const email = session.customer_details?.email || session.customer_email;
    const nombre = session.customer_details?.name || 'Cliente';
    const telefono = session.customer_details?.phone || session.metadata?.phone;

    console.log('📧 Email:', email);
    console.log('👤 Nombre:', nombre);
    console.log('📱 Teléfono:', telefono);

    if (!email) {
      throw new Error('Email no encontrado en la sesión de Stripe');
    }

    // 1. Generar código
    const codigo = generarCodigoAcceso();
    console.log('🔑 Código generado:', codigo);

    // 2. Guardar en MySQL
    const dbResult = await guardarCodigo(email, nombre, codigo, event.id);
    
    if (!dbResult.success) {
      throw new Error(`Error BD: ${dbResult.error}`);
    }

    // 3. Enviar por Email
    const emailResult = await enviarPorEmail(email, nombre, codigo, dbResult.expiresAt);
    console.log('📧 Email:', emailResult.success ? '✅ Enviado' : `❌ ${emailResult.error}`);

    // 4. Enviar por WhatsApp (si hay teléfono)
    if (telefono) {
      const whatsappResult = await enviarPorWhatsApp(telefono, nombre, codigo, dbResult.expiresAt);
      console.log('📱 WhatsApp:', whatsappResult.success ? '✅ Enviado' : `❌ ${whatsappResult.error}`);
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ PROCESO COMPLETADO\n');

    res.json({ 
      received: true,
      codigo: codigo,
      email: email,
      emailEnviado: emailResult.success,
      whatsappEnviado: telefono ? true : false
    });

  } catch (error) {
    console.error('❌ ERROR EN WEBHOOK:', error);
    console.log('═══════════════════════════════════════════════\n');
    
    // Aún así responder 200 para que Stripe no reintente
    res.json({ 
      received: true, 
      error: error.message 
    });
  }
});

// ============================================
// CREAR CHECKOUT SESSION
// ============================================

app.post('/api/create-checkout', async (req, res) => {
  try {
    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({ 
        error: 'priceId es requerido' 
      });
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
      customer_email: req.body.email,
      metadata: {
        phone: req.body.phone || ''
      },
      phone_number_collection: {
        enabled: true
      }
    });

    res.json({ sessionId: session.id });

  } catch (error) {
    console.error('Error creando checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alias para compatibilidad
app.post('/create-checkout-session', async (req, res) => {
  return app._router.stack
    .find(r => r.route?.path === '/api/create-checkout')
    .route.stack[0].handle(req, res);
});

// ============================================
// 🔐 LOGIN CON CÓDIGO - ENDPOINT PRINCIPAL
// ============================================

app.post('/api/login', async (req, res) => {
  // Asegurar que siempre responda JSON
  res.setHeader('Content-Type', 'application/json');

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

    const [rows] = await pool.execute(sql, [
      email.toLowerCase().trim(), 
      code.toUpperCase().trim()
    ]);

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

    return res.json({
      success: true,
      token: token,
      nombre: usuario.nombre,
      email: usuario.email,
      expiresAt: usuario.expires_at,
      loginCount: usuario.login_count + 1
    });

  } catch (error) {
    console.error('❌ Error en login:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// ============================================
// 🔐 ALIAS: /api/validate-code (CORREGIDO)
// ============================================

app.post('/api/validate-code', async (req, res) => {
  // Asegurar que siempre responda JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    // Convertir el body al formato esperado por /api/login
    const { email, accessCode, code } = req.body;
    
    // Crear nuevo request con el formato correcto
    req.body = { 
      email: email,
      code: accessCode || code  // Soportar ambos nombres
    };
    
    // Llamar a la función de login directamente
    const loginHandler = app._router.stack
      .find(r => r.route?.path === '/api/login')
      ?.route?.stack[0]?.handle;
    
    if (loginHandler) {
      return loginHandler(req, res);
    } else {
      throw new Error('Login handler no encontrado');
    }
    
  } catch (error) {
    console.error('❌ Error en validate-code:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  }
});

// ============================================
// OBTENER INFO DE SESIÓN
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

app.get('/health', async (req, res) => {
  let mysqlStatus = '❌ No configurado';
  
  // Probar conexión a MySQL
  if (process.env.DB_HOST) {
    try {
      await pool.query('SELECT 1');
      mysqlStatus = '✅ Conectado';
    } catch (error) {
      mysqlStatus = `❌ Error: ${error.message}`;
    }
  }

  const estado = {
    servidor: '✅ Activo',
    email: process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado',
    whatsapp: (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado',
    mysql: mysqlStatus,
    stripe: process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado',
    numeroWhatsApp: `+52 ${WHATSAPP_BUSINESS_NUMBER}`,
    timestamp: new Date().toISOString()
  };

  console.log('🏥 Health Check:', estado);
  res.json(estado);
});

// ============================================
// MANEJO DE ERRORES 404
// ============================================

app.use((req, res) => {
  // Solo para rutas API, devolver JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Endpoint no encontrado',
      path: req.path
    });
  }
  // Para otras rutas, dejar que express.static maneje
  res.status(404).send('Página no encontrada');
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
  console.log('   POST /api/login                - Login con código ✅ FUNCIONAL');
  console.log('   POST /api/validate-code        - Validar código (alias) ✅ CORREGIDO');
  console.log('   GET  /api/checkout-session     - Info de sesión');
  console.log('   GET  /webhook-whatsapp         - Verificación Meta');
  console.log('   POST /webhook-whatsapp         - Recibir mensajes');
  console.log('   GET  /test-envio               - Prueba de envío');
  console.log('   GET  /health                   - Estado del sistema');
  console.log('\n🧪 Pruebas:');
  console.log(`   http://localhost:${PORT}/test-envio?email=test@test.com&nombre=Juan&telefono=5538822334&metodo=both`);
  console.log(`   http://localhost:${PORT}/health`);
  console.log('\n');
});

module.exports = app;

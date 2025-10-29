// ============================================
// SERVER.JS - Sistema Completo SkillsCert EC0301
// Versión: 2.0 - Con MySQL Completo
// Checkout + Webhook + WhatsApp + Email + Base de Datos
// ============================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN MYSQL
// ============================================

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Verificar conexión al iniciar
pool.getConnection()
  .then(connection => {
    console.log('✅ Conexión exitosa con MySQL');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a MySQL:', err.message);
  });

// ============================================
// CONFIGURACIÓN
// ============================================

// CORS
app.use(cors());

// Middlewares
app.use(express.static('public'));
app.use('/api', express.json());

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
// FUNCIONES DE BASE DE DATOS
// ============================================

/**
 * Guarda un código de acceso en la base de datos
 */
async function guardarCodigoAcceso(datos) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO access_codes (
        email, nombre, telefono, codigo, session_id, 
        fecha_compra, fecha_expiracion, activo, delivery_method,
        monto, moneda
      ) VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 365 DAY), TRUE, ?, ?, ?)`,
      [
        datos.email,
        datos.nombre,
        datos.telefono,
        datos.codigo,
        datos.sessionId,
        datos.deliveryMethod,
        datos.monto || 999,
        datos.moneda || 'mxn'
      ]
    );
    
    console.log(`✅ Código guardado en BD: ${datos.codigo} (ID: ${result.insertId})`);
    return result.insertId;
    
  } catch (error) {
    console.error('❌ Error guardando código:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Registra un evento del webhook
 */
async function registrarWebhookEvent(datos) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO webhook_events_log (
        event_type, session_id, email, nombre, telefono,
        delivery_method, codigo_generado, evento_completo, procesado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        datos.eventType,
        datos.sessionId,
        datos.email,
        datos.nombre,
        datos.telefono,
        datos.deliveryMethod,
        datos.codigo,
        JSON.stringify(datos.eventoCompleto),
      ]
    );
    
    console.log(`📝 Evento webhook registrado: ${datos.eventType}`);
    
  } catch (error) {
    console.error('❌ Error registrando webhook:', error);
  } finally {
    connection.release();
  }
}

/**
 * Registra el intento de envío de email
 */
async function registrarEmailLog(datos) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO email_delivery_log (
        email_destino, nombre_destinatario, codigo_enviado,
        asunto, exitoso, error_mensaje, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.email,
        datos.nombre,
        datos.codigo,
        datos.asunto || '🎓 Tu Código de Acceso - SkillsCert EC0301',
        datos.exitoso,
        datos.error || null,
        JSON.stringify(datos.metadata || {})
      ]
    );
    
    console.log(`📧 Email log registrado: ${datos.email} - ${datos.exitoso ? 'Exitoso' : 'Fallido'}`);
    
  } catch (error) {
    console.error('❌ Error registrando email log:', error);
  } finally {
    connection.release();
  }
}

/**
 * Registra el intento de envío de WhatsApp
 */
async function registrarWhatsAppLog(datos) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO whatsapp_logs (
        telefono_destino, nombre_destinatario, codigo_enviado,
        mensaje_enviado, exitoso, error_mensaje, message_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.telefono,
        datos.nombre,
        datos.codigo,
        datos.mensaje,
        datos.exitoso,
        datos.error || null,
        datos.messageId || null,
        JSON.stringify(datos.metadata || {})
      ]
    );
    
    console.log(`📱 WhatsApp log registrado: ${datos.telefono} - ${datos.exitoso ? 'Exitoso' : 'Fallido'}`);
    
  } catch (error) {
    console.error('❌ Error registrando WhatsApp log:', error);
  } finally {
    connection.release();
  }
}

/**
 * Registra actividad del usuario
 */
async function registrarActividad(email, accion, detalles = null) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO user_activity (email, accion, detalles)
       VALUES (?, ?, ?)`,
      [email, accion, detalles]
    );
    
    console.log(`📊 Actividad registrada: ${email} - ${accion}`);
    
  } catch (error) {
    console.error('❌ Error registrando actividad:', error);
  } finally {
    connection.release();
  }
}

/**
 * Valida un código de acceso
 */
async function validarCodigo(email, codigo) {
  const connection = await pool.getConnection();
  try {
    const [resultados] = await connection.query(
      `SELECT * FROM access_codes 
       WHERE email = ? AND codigo = ? AND activo = TRUE
       AND fecha_expiracion > NOW()`,
      [email, codigo]
    );
    
    if (resultados.length === 0) {
      return { valido: false, mensaje: 'Código inválido o expirado' };
    }
    
    const codigoData = resultados[0];
    
    // Actualizar uso
    await connection.query(
      `UPDATE access_codes 
       SET usado = TRUE, 
           fecha_primer_uso = COALESCE(fecha_primer_uso, NOW()),
           numero_usos = numero_usos + 1,
           ultimo_acceso = NOW()
       WHERE id = ?`,
      [codigoData.id]
    );
    
    // Registrar actividad
    await registrarActividad(email, 'login_exitoso', `Código: ${codigo}`);
    
    console.log(`✅ Código validado: ${codigo} para ${email}`);
    
    return {
      valido: true,
      codigo: codigoData,
      mensaje: 'Código válido'
    };
    
  } catch (error) {
    console.error('❌ Error validando código:', error);
    return { valido: false, mensaje: 'Error al validar código' };
  } finally {
    connection.release();
  }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Genera un código de acceso único
 */
function generarCodigoAcceso() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';
  for (let i = 0; i < 12; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 3 || i === 7) codigo += '-';
  }
  return codigo;
}

/**
 * Valida y formatea teléfono mexicano
 */
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
  const inicio = Date.now();
  
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

    const info = await transporter.sendMail(mailOptions);
    const duracion = Date.now() - inicio;
    
    console.log(`✅ Email enviado a: ${email} (${duracion}ms)`);
    
    // Registrar en log
    await registrarEmailLog({
      email,
      nombre,
      codigo,
      exitoso: true,
      metadata: {
        messageId: info.messageId,
        duracion_ms: duracion,
        response: info.response
      }
    });
    
    return { 
      success: true, 
      method: 'email',
      messageId: info.messageId,
      duracion_ms: duracion
    };

  } catch (error) {
    const duracion = Date.now() - inicio;
    console.error('❌ Error enviando email:', error);
    
    // Registrar error en log
    await registrarEmailLog({
      email,
      nombre,
      codigo,
      exitoso: false,
      error: error.message,
      metadata: {
        duracion_ms: duracion,
        error_stack: error.stack
      }
    });
    
    return { 
      success: false, 
      method: 'email', 
      error: error.message 
    };
  }
}

// ============================================
// ENVIAR POR WHATSAPP
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo) {
  const inicio = Date.now();
  
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

    const duracion = Date.now() - inicio;
    const messageId = response.data.messages[0].id;
    
    console.log(`✅ WhatsApp enviado a: +${telefonoValidado} (${duracion}ms)`);
    
    // Registrar en log
    await registrarWhatsAppLog({
      telefono: `+${telefonoValidado}`,
      nombre,
      codigo,
      mensaje,
      exitoso: true,
      messageId,
      metadata: {
        duracion_ms: duracion,
        wa_id: response.data.contacts[0].wa_id
      }
    });
    
    return { 
      success: true, 
      method: 'whatsapp', 
      phone: `+${telefonoValidado}`,
      messageId,
      duracion_ms: duracion
    };

  } catch (error) {
    const duracion = Date.now() - inicio;
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    
    // Registrar error en log
    await registrarWhatsAppLog({
      telefono,
      nombre,
      codigo,
      mensaje: '',
      exitoso: false,
      error: error.response?.data?.error?.message || error.message,
      metadata: {
        duracion_ms: duracion,
        error_completo: error.response?.data || error.message
      }
    });
    
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

    // Registrar actividad
    await registrarActividad(email, 'checkout_iniciado', JSON.stringify({ nombre, deliveryMethod }));

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
    const monto = session.amount_total / 100; // Convertir de centavos a pesos

    if (!email) {
      console.error('❌ No se encontró email');
      return res.status(400).json({ error: 'Email no disponible' });
    }

    try {
      // 1. Generar código
      const codigoAcceso = generarCodigoAcceso();
      console.log('🔐 Código generado:', codigoAcceso);

      // 2. Guardar en base de datos
      const codigoId = await guardarCodigoAcceso({
        email,
        nombre,
        telefono,
        codigo: codigoAcceso,
        sessionId: session.id,
        deliveryMethod,
        monto,
        moneda: session.currency
      });

      // 3. Registrar evento webhook
      await registrarWebhookEvent({
        eventType: event.type,
        sessionId: session.id,
        email,
        nombre,
        telefono,
        deliveryMethod,
        codigo: codigoAcceso,
        eventoCompleto: event
      });

      // 4. Registrar actividad
      await registrarActividad(email, 'pago_completado', `Código: ${codigoAcceso}, Monto: $${monto}`);

      // 5. Enviar según preferencias
      const resultados = {};

      if (deliveryMethod === 'email' || deliveryMethod === 'both') {
        console.log('📧 Enviando por email...');
        resultados.email = await enviarPorEmail(email, nombre, codigoAcceso);
      }

      if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && telefono) {
        console.log('📱 Enviando por WhatsApp...');
        resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoAcceso);
      }

      // 6. Verificar que al menos un envío fue exitoso
      const algunoExitoso = 
        (resultados.email?.success) || 
        (resultados.whatsapp?.success);

      if (algunoExitoso) {
        console.log('✅ Código enviado exitosamente');
        res.json({ 
          received: true,
          codigo: codigoAcceso,
          codigoId: codigoId,
          envios: resultados
        });
      } else {
        console.error('❌ No se pudo enviar por ningún método');
        // Aún así respondemos OK a Stripe para no reintentar
        res.json({ 
          received: true,
          warning: 'Código generado pero envío falló',
          codigo: codigoAcceso,
          codigoId: codigoId,
          envios: resultados
        });
      }

    } catch (error) {
      console.error('❌ Error procesando webhook:', error);
      // Respondemos error para que Stripe reintente
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
// ENDPOINT: Validar Código
// ============================================

app.post('/api/validate-code', async (req, res) => {
  try {
    const { email, accessCode } = req.body;

    if (!email || !accessCode) {
      return res.status(400).json({ 
        error: 'Email y código son requeridos' 
      });
    }

    // Registrar intento de validación
    await registrarActividad(email, 'intento_login', `Código: ${accessCode}`);

    // Validar código
    const resultado = await validarCodigo(email, accessCode);
    
    if (resultado.valido) {
      const token = Buffer.from(`${email}:${accessCode}`).toString('base64');
      
      res.json({
        success: true,
        token: token,
        nombre: resultado.codigo.nombre,
        fechaExpiracion: resultado.codigo.fecha_expiracion
      });
    } else {
      // Registrar fallo
      await registrarActividad(email, 'login_fallido', `Código inválido: ${accessCode}`);
      
      res.status(401).json({
        success: false,
        message: resultado.mensaje
      });
    }
    
  } catch (error) {
    console.error('❌ Error validando código:', error);
    res.status(500).json({ 
      error: 'Error al validar código',
      message: error.message 
    });
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
// ENDPOINT: Estadísticas (Admin)
// ============================================

app.get('/api/admin/stats', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // Total de códigos
    const [totalCodigos] = await connection.query(
      'SELECT COUNT(*) as total FROM access_codes'
    );
    
    // Códigos activos
    const [codigosActivos] = await connection.query(
      'SELECT COUNT(*) as total FROM access_codes WHERE activo = TRUE'
    );
    
    // Códigos usados
    const [codigosUsados] = await connection.query(
      'SELECT COUNT(*) as total FROM access_codes WHERE usado = TRUE'
    );
    
    // Ingresos totales
    const [ingresos] = await connection.query(
      'SELECT SUM(monto) as total FROM access_codes WHERE activo = TRUE'
    );
    
    // Códigos por expirar (próximos 30 días)
    const [porExpirar] = await connection.query(
      `SELECT COUNT(*) as total FROM access_codes 
       WHERE activo = TRUE 
       AND fecha_expiracion BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)`
    );
    
    // Códigos sin uso
    const [sinUso] = await connection.query(
      `SELECT COUNT(*) as total FROM access_codes 
       WHERE activo = TRUE AND usado = FALSE`
    );
    
    // Últimos 10 códigos generados
    const [ultimosCodigos] = await connection.query(
      `SELECT email, nombre, codigo, fecha_compra, usado, delivery_method
       FROM access_codes 
       ORDER BY fecha_compra DESC 
       LIMIT 10`
    );
    
    // Tasa de envío exitoso (emails)
    const [emailStats] = await connection.query(
      `SELECT 
        COUNT(*) as total_emails,
        SUM(CASE WHEN exitoso = TRUE THEN 1 ELSE 0 END) as exitosos,
        ROUND(SUM(CASE WHEN exitoso = TRUE THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as tasa_exito
       FROM email_delivery_log`
    );
    
    // Tasa de envío exitoso (WhatsApp)
    const [whatsappStats] = await connection.query(
      `SELECT 
        COUNT(*) as total_mensajes,
        SUM(CASE WHEN exitoso = TRUE THEN 1 ELSE 0 END) as exitosos,
        ROUND(SUM(CASE WHEN exitoso = TRUE THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as tasa_exito
       FROM whatsapp_logs`
    );
    
    connection.release();
    
    res.json({
      codigos: {
        total: totalCodigos[0].total,
        activos: codigosActivos[0].total,
        usados: codigosUsados[0].total,
        sin_uso: sinUso[0].total,
        por_expirar_30_dias: porExpirar[0].total
      },
      ingresos: {
        total_mxn: ingresos[0].total || 0
      },
      envios: {
        email: emailStats[0],
        whatsapp: whatsappStats[0]
      },
      ultimos_codigos: ultimosCodigos
    });
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
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

app.get('/health', async (req, res) => {
  let mysqlEstado = '❌ No conectado';
  
  try {
    const connection = await pool.getConnection();
    const [result] = await connection.query('SELECT 1');
    connection.release();
    mysqlEstado = '✅ Conectado';
  } catch (error) {
    mysqlEstado = `❌ Error: ${error.message}`;
  }
  
  const estado = {
    servidor: '✅ Activo',
    mysql: mysqlEstado,
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
  console.error('❌ Error global:', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log(`🚀 Servidor SkillsCert EC0301 v2.0 - Puerto ${PORT}`);
  console.log('═'.repeat(70));
  console.log('');
  console.log('📊 Estado de Servicios:');
  console.log('   💾 MySQL:', process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado');
  console.log('   📧 Email:', process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado');
  console.log('   📱 WhatsApp:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado');
  console.log('   📱 Número: +52', WHATSAPP_BUSINESS_NUMBER);
  console.log('   💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado');
  console.log('');
  console.log('📋 Endpoints Disponibles:');
  console.log('   POST   /api/create-checkout       - Crear sesión de pago');
  console.log('   POST   /webhook                   - Webhook de Stripe');
  console.log('   POST   /api/validate-code         - Validar código de acceso');
  console.log('   GET    /api/checkout-session      - Info de sesión');
  console.log('   GET    /api/admin/stats           - Estadísticas del sistema');
  console.log('   GET    /test-envio                - Probar envío de códigos');
  console.log('   GET    /health                    - Estado del servidor');
  console.log('');
  console.log('═'.repeat(70));
  console.log('');
});

module.exports = app;

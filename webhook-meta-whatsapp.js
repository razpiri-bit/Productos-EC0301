// ============================================
// WEBHOOK CON META WHATSAPP CLOUD API
// Alternativa a Twilio - Sin necesidad de SMS
// ============================================

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURACIÓN DE META WHATSAPP CLOUD API
// ============================================

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_API_VERSION = 'v18.0';

// ============================================
// CONFIGURACIÓN DE EMAIL (Gmail)
// ============================================

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
    if (i === 3 || i === 7) codigo += '_';
  }
  return codigo;
}

// Validar y formatear teléfono mexicano
function validarTelefono(telefono) {
  // Limpiar el número
  const cleaned = telefono.replace(/\D/g, '');
  
  // Formatos aceptados:
  // 5512345678 (10 dígitos) → 525512345678
  // 525512345678 (12 dígitos) → 525512345678
  // +525512345678 (con +52) → 525512345678
  
  if (cleaned.length === 10) {
    return `52${cleaned}`; // Agregar código de México
  } else if (cleaned.length === 12 && cleaned.startsWith('52')) {
    return cleaned;
  } else if (telefono.startsWith('+52')) {
    return cleaned;
  }
  
  return null; // Formato inválido
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
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
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
              
              <div class="code-box">
                ${codigo}
              </div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul style="margin: 10px 0;">
                  <li>Este código es personal e intransferible</li>
                  <li>Válido por 365 días desde hoy</li>
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
                <li>✅ Acceso 24/7 durante 1 año</li>
              </ul>
              
              <h3>🎯 Próximos Pasos</h3>
              <ol>
                <li>Haz clic en el botón "Ingresar a la Plataforma"</li>
                <li>Ingresa tu email y código de acceso</li>
                <li>¡Comienza a generar tus documentos!</li>
              </ol>
              
              <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <strong>💡 ¿Necesitas ayuda?</strong><br>
                📧 Email: <a href="mailto:info@skillscert.com.mx">info@skillscert.com.mx</a><br>
                📱 WhatsApp: <a href="https://wa.me/5215512345678">+52 55 1234 5678</a>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} SkillsCert - Todos los derechos reservados</p>
              <p>Este email contiene información confidencial. Si lo recibiste por error, elimínalo.</p>
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
// ENVIAR POR WHATSAPP (Meta Cloud API)
// ============================================

async function enviarPorWhatsApp(telefono, nombre, codigo) {
  try {
    // Validar y formatear teléfono
    const telefonoValidado = validarTelefono(telefono);
    
    if (!telefonoValidado) {
      throw new Error('Formato de teléfono inválido. Use: 5512345678');
    }

    // Mensaje de WhatsApp
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

¿Ayuda? 📧 info@skillscert.com.mx

_SkillsCert - Tu aliado en certificación profesional_`;

    // Enviar mensaje usando Meta WhatsApp Cloud API
    const response = await axios.post(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefonoValidado,
        type: 'text',
        text: {
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
    console.log(`   Message ID: ${response.data.messages[0].id}`);
    
    return { 
      success: true, 
      method: 'whatsapp', 
      phone: `+${telefonoValidado}`,
      messageId: response.data.messages[0].id
    };

  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
    
    // Error detallado
    const errorMsg = error.response?.data?.error?.message || error.message;
    const errorCode = error.response?.data?.error?.code;
    
    return { 
      success: false, 
      method: 'whatsapp', 
      error: errorMsg,
      errorCode: errorCode
    };
  }
}

// ============================================
// WEBHOOK PRINCIPAL
// ============================================

app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
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

  // Solo procesar pagos exitosos
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    console.log('\n🎉 Nuevo pago recibido!');
    console.log('Session ID:', session.id);
    console.log('Email:', session.customer_details?.email);

    // Extraer información del cliente
    const email = session.customer_details?.email;
    const nombre = session.customer_details?.name || 'Usuario';
    const telefono = session.customer_details?.phone;
    const metadatos = session.metadata || {};
    const deliveryMethod = metadatos.delivery_method || 'email'; // 'email', 'whatsapp', 'both'

    if (!email) {
      console.error('❌ No se encontró email del cliente');
      return res.status(400).json({ error: 'Email no disponible' });
    }

    // Generar código de acceso
    const codigoAcceso = generarCodigoAcceso();
    console.log('🔐 Código generado:', codigoAcceso);

    // Guardar en base de datos (aquí usarías tu BD real)
    const usuario = {
      email: email,
      nombre: nombre,
      telefono: telefono,
      codigoAcceso: codigoAcceso,
      sessionId: session.id,
      monto: session.amount_total / 100,
      fechaCompra: new Date(),
      fechaExpiracion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
      activo: true,
      deliveryMethod: deliveryMethod
    };

    // TODO: Guardar en MongoDB/Firebase/PostgreSQL
    console.log('💾 Usuario a guardar:', usuario);

    // Enviar código según preferencias
    const resultados = {
      email: null,
      whatsapp: null
    };

    try {
      // Enviar por Email
      if (deliveryMethod === 'email' || deliveryMethod === 'both') {
        console.log('📧 Enviando por email...');
        resultados.email = await enviarPorEmail(email, nombre, codigoAcceso);
      }

      // Enviar por WhatsApp
      if ((deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && telefono) {
        console.log('📱 Enviando por WhatsApp...');
        resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoAcceso);
      }

      // Verificar si al menos un método fue exitoso
      const algunoExitoso = 
        (resultados.email?.success) || 
        (resultados.whatsapp?.success);

      if (algunoExitoso) {
        console.log('✅ Código enviado exitosamente');
        console.log('Resultados:', JSON.stringify(resultados, null, 2));
        
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
      console.error('❌ Error en envío de código:', error);
      res.status(500).json({ 
        error: 'Error al procesar envío',
        detalles: error.message 
      });
    }

  } else {
    // Otros tipos de eventos
    console.log(`ℹ️ Evento recibido: ${event.type}`);
    res.json({ received: true });
  }
});

// ============================================
// VERIFICACIÓN DE WEBHOOK (Meta requiere esto)
// ============================================

app.get('/webhook-whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Token de verificación (configúralo en .env)
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'mi_token_secreto';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook de WhatsApp verificado');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================
// RECIBIR MENSAJES DE WHATSAPP (Opcional)
// ============================================

app.post('/webhook-whatsapp', express.json(), async (req, res) => {
  try {
    console.log('📩 Mensaje de WhatsApp recibido:', JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (messages && messages.length > 0) {
      const message = messages[0];
      const from = message.from; // Número del cliente
      const messageBody = message.text?.body; // Texto del mensaje

      console.log(`📱 Mensaje de ${from}: ${messageBody}`);

      // Aquí puedes procesar respuestas automáticas
      // Por ejemplo, si el usuario responde "AYUDA"
      
      // Responder (opcional)
      // await enviarPorWhatsApp(from, 'Usuario', 'Respuesta automática');
    }

    res.sendStatus(200);

  } catch (error) {
    console.error('Error procesando mensaje de WhatsApp:', error);
    res.sendStatus(500);
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
      requeridos: ['email', 'nombre'],
      ejemplo: '/test-envio?email=test@test.com&nombre=Juan&telefono=5512345678&metodo=both'
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
    timestamp: new Date().toISOString()
  };

  console.log('🏥 Health Check:', estado);
  res.json(estado);
});

// ============================================
// SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor webhook corriendo en puerto ${PORT}`);
  console.log('═══════════════════════════════════════════════');
  console.log('📧 Email:', process.env.EMAIL_USER ? '✅ Configurado' : '❌ No configurado');
  console.log('📱 WhatsApp Meta API:', (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) ? '✅ Configurado' : '❌ No configurado');
  console.log('💳 Stripe:', process.env.STRIPE_SECRET_KEY ? '✅ Configurado' : '❌ No configurado');
  console.log('═══════════════════════════════════════════════');
  console.log('\n📋 Endpoints disponibles:');
  console.log('   POST /webhook                 - Stripe webhook');
  console.log('   GET  /webhook-whatsapp        - Verificación Meta');
  console.log('   POST /webhook-whatsapp        - Recibir mensajes');
  console.log('   GET  /test-envio              - Prueba de envío');
  console.log('   GET  /health                  - Estado del sistema');
  console.log('\n🧪 Prueba:');
  console.log(`   http://localhost:${PORT}/test-envio?email=test@test.com&nombre=Juan&telefono=5512345678&metodo=both`);
  console.log('\n');
});

module.exports = app;

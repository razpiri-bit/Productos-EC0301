// ============================================
// WEBHOOK STRIPE - Versión con WhatsApp/Email
// ============================================

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configuración de Twilio (WhatsApp)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Configuración de Email
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

// Validar formato de teléfono para WhatsApp
function validarTelefono(telefono) {
  // Acepta formatos: +52XXXXXXXXXX, 52XXXXXXXXXX, XXXXXXXXXX
  const cleaned = telefono.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `+52${cleaned}`; // México
  } else if (cleaned.length === 12 && cleaned.startsWith('52')) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('+52')) {
    return telefono;
  }
  
  return null;
}

// ============================================
// ENVIAR CÓDIGO POR EMAIL
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
                <ul>
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
// ENVIAR CÓDIGO POR WHATSAPP
// ============================================
async function enviarPorWhatsApp(telefono, nombre, codigo) {
  try {
    const telefonoValidado = validarTelefono(telefono);
    
    if (!telefonoValidado) {
      throw new Error('Formato de teléfono inválido');
    }

    const mensaje = `
🎓 *SkillsCert EC0301*

¡Hola ${nombre}! 👋

Tu pago fue procesado exitosamente.

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

¿Necesitas ayuda?
📧 info@skillscert.com.mx

_SkillsCert - Tu aliado en certificación profesional_
    `.trim();

    await twilioClient.messages.create({
      from: 'whatsapp:+14155238886', // Número de Twilio Sandbox
      to: `whatsapp:${telefonoValidado}`,
      body: mensaje
    });

    console.log(`✅ WhatsApp enviado a: ${telefonoValidado}`);
    return { success: true, method: 'whatsapp', phone: telefonoValidado };
  } catch (error) {
    console.error('❌ Error enviando WhatsApp:', error);
    return { success: false, method: 'whatsapp', error: error.message };
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

    // Preferencia de envío (email, whatsapp, o ambos)
    const preferenciasEnvio = metadatos.delivery_method || 'email'; // 'email', 'whatsapp', 'both'

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
      activo: true
    };

    // TODO: Guardar en MongoDB/Firebase/PostgreSQL
    console.log('💾 Usuario a guardar:', usuario);

    // Enviar código según preferencias
    const resultados = {
      email: null,
      whatsapp: null
    };

    try {
      if (preferenciasEnvio === 'email' || preferenciasEnvio === 'both') {
        resultados.email = await enviarPorEmail(email, nombre, codigoAcceso);
      }

      if ((preferenciasEnvio === 'whatsapp' || preferenciasEnvio === 'both') && telefono) {
        resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoAcceso);
      }

      // Verificar si al menos un método fue exitoso
      const algunoExitoso = 
        (resultados.email?.success) || 
        (resultados.whatsapp?.success);

      if (algunoExitoso) {
        console.log('✅ Código enviado exitosamente');
        console.log('Resultados:', resultados);
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
// ENDPOINT DE PRUEBA
// ============================================
app.get('/test-envio', async (req, res) => {
  const { email, telefono, nombre, metodo } = req.query;

  if (!email || !nombre) {
    return res.status(400).json({ error: 'Faltan parámetros: email y nombre' });
  }

  const codigoPrueba = generarCodigoAcceso();
  const resultados = {};

  try {
    if (metodo === 'email' || metodo === 'both') {
      resultados.email = await enviarPorEmail(email, nombre, codigoPrueba);
    }

    if ((metodo === 'whatsapp' || metodo === 'both') && telefono) {
      resultados.whatsapp = await enviarPorWhatsApp(telefono, nombre, codigoPrueba);
    }

    res.json({
      codigo: codigoPrueba,
      resultados: resultados
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SERVIDOR
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor webhook corriendo en puerto ${PORT}`);
  console.log('📧 Email configurado:', process.env.EMAIL_USER ? '✅' : '❌');
  console.log('📱 WhatsApp configurado:', process.env.TWILIO_ACCOUNT_SID ? '✅' : '❌');
});

module.exports = app;

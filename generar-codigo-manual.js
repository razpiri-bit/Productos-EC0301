// ============================================================
// GENERAR-CODIGO-MANUAL.JS - Envío Manual de Código
// ============================================================
// Uso: node generar-codigo-manual.js email@cliente.com "Nombre Cliente"

require('dotenv').config();
const mysql = require('mysql2/promise');
const { nanoid } = require('nanoid');
const postmark = require('postmark');

// Validar argumentos
const email = process.argv[2];
const nombre = process.argv[3] || 'Cliente';

if (!email) {
  console.error('❌ Error: Debes proporcionar un email');
  console.log('\n📋 Uso:');
  console.log('   node generar-codigo-manual.js email@cliente.com "Nombre Cliente"');
  console.log('\nEjemplo:');
  console.log('   node generar-codigo-manual.js razpiri@gmail.com "Roberto Azpiri"\n');
  process.exit(1);
}

// Configuración
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN);

// Función para generar HTML del email
function generarEmailHTML(nombre, codigo, expiresAt) {
  const fechaExpiracion = new Date(expiresAt).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const diasRestantes = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f7fa; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 18px; color: #1f2937; margin-bottom: 20px; }
    .code-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
    .code { background: #ffffff; color: #667eea; font-size: 32px; font-weight: 700; padding: 15px 30px; border-radius: 8px; display: inline-block; letter-spacing: 3px; font-family: 'Courier New', monospace; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; margin: 20px 0; }
    .footer { background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 SkillsCert EC0301</h1>
      <p>Tu acceso está listo</p>
    </div>
    <div class="content">
      <div class="greeting">¡Hola, ${nombre}!</div>
      <p>Gracias por tu compra. Tu código de acceso ha sido generado exitosamente.</p>
      <div class="code-box">
        <div style="color: #e5e7eb; font-size: 14px; margin-bottom: 10px;">TU CÓDIGO DE ACCESO</div>
        <div class="code">${codigo}</div>
      </div>
      <p style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 8px;">
        ⏰ <strong>Expira:</strong> ${fechaExpiracion} (${diasRestantes} días)
      </p>
      <div style="text-align: center;">
        <a href="https://productos-ec0301-1-0.onrender.com/login.html" class="cta-button">🚀 Acceder a la Plataforma</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>SkillsCert © 2025</strong></p>
      <p>info@skillscert.com.mx | WhatsApp: 55 3882 2334</p>
    </div>
  </div>
</body>
</html>
  `;
}

// Función principal
async function generarYEnviarCodigo() {
  console.log('\n🔄 Generando código de acceso...\n');
  console.log('='.repeat(60));

  try {
    // 1. Generar código único
    const codigo = nanoid(12).toUpperCase();
    console.log(`✅ Código generado: ${codigo}`);

    // 2. Calcular fecha de expiración (90 días)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    console.log(`📅 Expira: ${expiresAt.toLocaleDateString('es-MX')}`);

    // 3. Guardar en base de datos
    const insertSql = `
      INSERT INTO access_codes (
        code, email, nombre, status, amount_paid,
        stripe_session_id, expires_at
      ) VALUES (?, ?, ?, 'active', 99700, 'MANUAL', ?)
    `;

    const [result] = await pool.execute(insertSql, [
      codigo,
      email.toLowerCase(),
      nombre,
      expiresAt
    ]);

    const accessCodeId = result.insertId;
    console.log(`💾 Guardado en BD con ID: ${accessCodeId}`);

    // 4. Enviar email con Postmark
    const htmlBody = generarEmailHTML(nombre, codigo, expiresAt);
    const textBody = `¡Hola, ${nombre}!\n\nTu código de acceso: ${codigo}\n\nExpira: ${expiresAt.toLocaleDateString('es-MX')}\n\nAccede en: https://productos-ec0301-1-0.onrender.com/login.html`;

    const emailResult = await postmarkClient.sendEmail({
      From: process.env.POSTMARK_FROM_EMAIL,
      To: email,
      Subject: '🎓 Tu código de acceso a SkillsCert EC0301',
      HtmlBody: htmlBody,
      TextBody: textBody,
      MessageStream: 'outbound',
      TrackOpens: true,
      Tag: 'codigo-manual'
    });

    console.log(`📧 Email enviado a: ${email}`);
    console.log(`📬 Postmark Message ID: ${emailResult.MessageID}`);

    // 5. Registrar envío de email
    await pool.execute(
      `INSERT INTO email_delivery_log 
       (access_code_id, recipient_email, delivery_status, postmark_message_id) 
       VALUES (?, ?, 'sent', ?)`,
      [accessCodeId, email, emailResult.MessageID]
    );

    console.log('='.repeat(60));
    console.log('\n✅ ¡PROCESO COMPLETADO EXITOSAMENTE!\n');
    console.log('📋 Resumen:');
    console.log(`   • Código: ${codigo}`);
    console.log(`   • Email: ${email}`);
    console.log(`   • Nombre: ${nombre}`);
    console.log(`   • Expira: ${expiresAt.toLocaleDateString('es-MX')}`);
    console.log(`   • Estado: Activo\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nDetalles:', error);
  } finally {
    await pool.end();
  }
}

// Ejecutar
generarYEnviarCodigo();

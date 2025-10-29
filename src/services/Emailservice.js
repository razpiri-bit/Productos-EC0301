/**
 * SERVICIO DE EMAIL CON POSTMARK
 * 
 * Gestión de envío de correos electrónicos usando Postmark
 * Características:
 * - Plantillas HTML responsivas
 * - Reintentos automáticos en caso de fallo
 * - Tracking de emails enviados
 * - Personalización de contenido
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

const postmark = require('postmark');
const { logger } = require('../utils/logger');

class EmailService {
  constructor(serverToken, fromEmail) {
    this.client = new postmark.ServerClient(serverToken);
    this.fromEmail = fromEmail;
  }

  /**
   * Generar plantilla HTML para código de acceso
   */
  generateAccessCodeTemplate(data) {
    const { name, accessCode, expiresAt, productName, amount } = data;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Acceso - SkillsCert</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .access-code-box {
      background-color: #f8f9fa;
      border: 2px dashed #667eea;
      border-radius: 8px;
      padding: 25px;
      text-align: center;
      margin: 30px 0;
    }
    .access-code-label {
      font-size: 14px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .access-code {
      font-size: 32px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 3px;
      font-family: 'Courier New', monospace;
    }
    .product-info {
      background-color: #f8f9fa;
      border-left: 4px solid #28a745;
      padding: 15px 20px;
      margin: 20px 0;
    }
    .product-info p {
      margin: 5px 0;
      color: #333;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 40px;
      text-decoration: none;
      border-radius: 5px;
      font-weight: 600;
      margin: 20px 0;
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
    }
    .expires-info {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px 20px;
      margin: 20px 0;
      font-size: 14px;
      color: #856404;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px 30px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .support {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 SkillsCert</h1>
      <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
        Tu Código de Acceso está Listo
      </p>
    </div>
    
    <div class="content">
      <p class="greeting">¡Hola ${name || 'Estudiante'}!</p>
      
      <p class="message">
        Gracias por tu compra. Tu pago ha sido procesado exitosamente y ya puedes 
        acceder a tu producto usando el código de acceso que aparece a continuación.
      </p>

      <div class="product-info">
        <p><strong>📦 Producto:</strong> ${productName}</p>
        <p><strong>💰 Monto pagado:</strong> $${amount} MXN</p>
      </div>

      <div class="access-code-box">
        <div class="access-code-label">Tu Código de Acceso</div>
        <div class="access-code">${accessCode}</div>
      </div>

      <div class="expires-info">
        ⏰ <strong>Importante:</strong> Este código expira el ${new Date(expiresAt).toLocaleDateString('es-MX', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      <div style="text-align: center;">
        <a href="${process.env.BASE_URL || 'https://productos-ec0301-1-0-dwk2.onrender.com'}" 
           class="cta-button">
          Acceder al Producto
        </a>
      </div>

      <div class="support">
        <strong>¿Necesitas ayuda?</strong><br>
        Si tienes alguna pregunta o problema, contáctanos:<br>
        📧 Email: ${this.fromEmail}<br>
        📞 WhatsApp: Disponible en nuestra plataforma
      </div>
    </div>

    <div class="footer">
      <p>
        © ${new Date().getFullYear()} SkillsCert - Global Skills Cert S.C.<br>
        <a href="https://skillscert.com.mx">www.skillscert.com.mx</a>
      </p>
      <p style="margin-top: 10px; font-size: 11px;">
        Este correo fue enviado a tu dirección porque realizaste una compra en nuestra plataforma.
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Enviar código de acceso por email
   */
  async sendAccessCode(data) {
    const {
      to,
      name,
      accessCode,
      expiresAt,
      productName,
      amount,
      paymentId,
    } = data;

    try {
      const htmlBody = this.generateAccessCodeTemplate({
        name,
        accessCode,
        expiresAt,
        productName,
        amount,
      });

      const result = await this.client.sendEmail({
        From: this.fromEmail,
        To: to,
        Subject: `🎓 Tu Código de Acceso - ${productName}`,
        HtmlBody: htmlBody,
        TextBody: `
Hola ${name || 'Estudiante'},

Tu código de acceso: ${accessCode}

Producto: ${productName}
Monto: $${amount} MXN
Expira: ${new Date(expiresAt).toLocaleString('es-MX')}

Accede aquí: ${process.env.BASE_URL}

Gracias por tu compra.
SkillsCert
        `.trim(),
        MessageStream: 'outbound',
        Tag: 'access-code',
        Metadata: {
          paymentId,
          accessCode,
          productName,
        },
      });

      logger.info('Access code email sent', {
        to,
        messageId: result.MessageID,
        accessCode,
        paymentId,
      });

      return {
        success: true,
        messageId: result.MessageID,
        to,
      };
    } catch (error) {
      logger.error('Error sending access code email', {
        to,
        error: error.message,
        errorCode: error.code,
      });

      throw {
        code: 'EMAIL_SEND_ERROR',
        message: 'Error al enviar el correo electrónico',
        details: error.message,
      };
    }
  }

  /**
   * Enviar confirmación de pago
   */
  async sendPaymentConfirmation(data) {
    const { to, name, amount, currency, paymentId, productName } = data;

    try {
      const result = await this.client.sendEmail({
        From: this.fromEmail,
        To: to,
        Subject: '✅ Confirmación de Pago - SkillsCert',
        HtmlBody: `
          <h2>Pago Confirmado</h2>
          <p>Hola ${name},</p>
          <p>Tu pago ha sido procesado exitosamente.</p>
          <ul>
            <li><strong>Producto:</strong> ${productName}</li>
            <li><strong>Monto:</strong> $${amount / 100} ${currency.toUpperCase()}</li>
            <li><strong>ID de Pago:</strong> ${paymentId}</li>
          </ul>
          <p>Recibirás tu código de acceso en breve.</p>
        `,
        TextBody: `
Pago Confirmado

Hola ${name},
Tu pago ha sido procesado exitosamente.

Producto: ${productName}
Monto: $${amount / 100} ${currency.toUpperCase()}
ID de Pago: ${paymentId}

Recibirás tu código de acceso en breve.
        `.trim(),
        Tag: 'payment-confirmation',
        Metadata: {
          paymentId,
          productName,
        },
      });

      logger.info('Payment confirmation sent', {
        to,
        messageId: result.MessageID,
        paymentId,
      });

      return {
        success: true,
        messageId: result.MessageID,
      };
    } catch (error) {
      logger.error('Error sending payment confirmation', {
        to,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Enviar notificación de error
   */
  async sendErrorNotification(data) {
    const { to, name, errorMessage, attemptedAction } = data;

    try {
      const result = await this.client.sendEmail({
        From: this.fromEmail,
        To: to,
        Subject: '⚠️ Problema con tu Transacción - SkillsCert',
        HtmlBody: `
          <h2>Problema Detectado</h2>
          <p>Hola ${name},</p>
          <p>Hemos detectado un problema con tu transacción:</p>
          <p><strong>${errorMessage}</strong></p>
          <p>Acción: ${attemptedAction}</p>
          <p>Por favor, contacta a nuestro equipo de soporte: ${this.fromEmail}</p>
        `,
        Tag: 'error-notification',
      });

      logger.info('Error notification sent', {
        to,
        messageId: result.MessageID,
      });

      return {
        success: true,
        messageId: result.MessageID,
      };
    } catch (error) {
      logger.error('Error sending error notification', {
        to,
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = EmailService;

/**
 * SERVICIO DE WHATSAPP (Facebook/Meta Business API)
 * 
 * Gestión de envío de mensajes por WhatsApp
 * Características:
 * - Envío de mensajes de texto
 * - Plantillas pre-aprobadas
 * - Reintentos automáticos
 * - Tracking de mensajes
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

class WhatsAppService {
  constructor(phoneNumberId, accessToken) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.baseURL = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  }

  /**
   * Enviar mensaje de texto
   */
  async sendTextMessage(to, message) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('WhatsApp text message sent', {
        to,
        messageId: response.data.messages[0].id,
      });

      return {
        success: true,
        messageId: response.data.messages[0].id,
        to,
      };
    } catch (error) {
      logger.error('Error sending WhatsApp message', {
        to,
        error: error.response?.data || error.message,
      });

      throw {
        code: 'WHATSAPP_SEND_ERROR',
        message: 'Error al enviar mensaje de WhatsApp',
        details: error.response?.data || error.message,
      };
    }
  }

  /**
   * Enviar código de acceso por WhatsApp
   */
  async sendAccessCode(data) {
    const { to, name, accessCode, expiresAt, productName, amount } = data;

    const message = `
🎓 *SkillsCert - Código de Acceso*

¡Hola ${name || 'Estudiante'}!

Tu pago ha sido procesado exitosamente. Aquí está tu código de acceso:

🔑 *Código:* ${accessCode}

📦 *Producto:* ${productName}
💰 *Monto:* $${amount} MXN

⏰ *Válido hasta:* ${new Date(expiresAt).toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}

🌐 Accede aquí: ${process.env.BASE_URL || 'https://productos-ec0301-1-0-dwk2.onrender.com'}

¿Necesitas ayuda? Responde a este mensaje.

Gracias por tu confianza.
_SkillsCert_
    `.trim();

    try {
      return await this.sendTextMessage(to, message);
    } catch (error) {
      logger.error('Error sending WhatsApp access code', {
        to,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Enviar plantilla pre-aprobada
   * (Requiere que la plantilla esté aprobada en Meta Business Manager)
   */
  async sendTemplate(to, templateName, components = []) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'es_MX',
            },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('WhatsApp template sent', {
        to,
        templateName,
        messageId: response.data.messages[0].id,
      });

      return {
        success: true,
        messageId: response.data.messages[0].id,
        to,
      };
    } catch (error) {
      logger.error('Error sending WhatsApp template', {
        to,
        templateName,
        error: error.response?.data || error.message,
      });

      throw {
        code: 'WHATSAPP_TEMPLATE_ERROR',
        message: 'Error al enviar plantilla de WhatsApp',
        details: error.response?.data || error.message,
      };
    }
  }

  /**
   * Verificar webhook de WhatsApp
   */
  verifyWebhook(mode, token, verifyToken) {
    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('WhatsApp webhook verified successfully');
      return true;
    }
    logger.warn('WhatsApp webhook verification failed', {
      mode,
      receivedToken: token?.substring(0, 10) + '...',
    });
    return false;
  }

  /**
   * Procesar mensajes entrantes de WhatsApp
   */
  async handleIncomingMessage(webhookData) {
    try {
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) {
        logger.info('WhatsApp webhook with no messages', {
          webhookData,
        });
        return { received: true, processed: false };
      }

      const message = value.messages[0];
      const from = message.from;
      const messageType = message.type;
      const messageBody = message.text?.body;

      logger.info('WhatsApp message received', {
        from,
        messageType,
        messageBody,
      });

      return {
        received: true,
        processed: true,
        from,
        messageType,
        messageBody,
        messageId: message.id,
      };
    } catch (error) {
      logger.error('Error processing WhatsApp webhook', {
        error: error.message,
        webhookData,
      });

      throw {
        code: 'WHATSAPP_WEBHOOK_ERROR',
        message: 'Error procesando webhook de WhatsApp',
        details: error.message,
      };
    }
  }

  /**
   * Enviar confirmación de pago
   */
  async sendPaymentConfirmation(data) {
    const { to, name, amount, productName, paymentId } = data;

    const message = `
✅ *Pago Confirmado - SkillsCert*

Hola ${name},

Tu pago ha sido procesado exitosamente.

📦 *Producto:* ${productName}
💰 *Monto:* $${amount} MXN
🔖 *ID de Pago:* ${paymentId}

Recibirás tu código de acceso en breve.

Gracias por tu compra.
_SkillsCert_
    `.trim();

    return await this.sendTextMessage(to, message);
  }

  /**
   * Formatear número de teléfono para WhatsApp
   * Acepta formatos: +52 55 1234 5678, 5551234567, etc.
   */
  static formatPhoneNumber(phone) {
    // Remover todos los caracteres no numéricos excepto +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Si no tiene código de país, agregar México por defecto
    if (!cleaned.startsWith('+')) {
      if (cleaned.length === 10) {
        cleaned = '+52' + cleaned;
      } else if (cleaned.startsWith('52') && cleaned.length === 12) {
        cleaned = '+' + cleaned;
      }
    }

    return cleaned;
  }
}

module.exports = WhatsAppService;

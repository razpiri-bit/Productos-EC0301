/**
 * CONTROLADOR PRINCIPAL DE PAGOS
 * 
 * Orquesta el flujo completo de pago y notificaciones
 * 
 * FLUJO:
 * 1. Usuario inicia checkout → Validar price_id
 * 2. Usuario completa pago → Webhook de Stripe
 * 3. Generar código de acceso único
 * 4. Enviar email con código
 * 5. Enviar WhatsApp con código
 * 6. Registrar todo en logs/historial
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 * 
 * HISTORIAL DE CORRECCIONES:
 * v1.0.0 - 2025-10-26 - Corrección de error "No such price"
 *   - Agregada validación de price_id antes de crear checkout
 *   - Implementado sistema de logging completo
 *   - Integrado flujo de notificaciones
 */

const { logger, LogHistoryService } = require('../utils/logger');
const StripeService = require('../services/stripeService');
const EmailService = require('../services/emailService');
const WhatsAppService = require('../services/whatsappService');
const AccessCodeService = require('../services/accessCodeService');

class PaymentController {
  constructor(config, database) {
    // Inicializar servicios
    this.stripeService = new StripeService(config.stripe.secretKey);
    this.emailService = new EmailService(
      config.postmark.serverToken,
      config.postmark.fromEmail
    );
    this.whatsappService = new WhatsAppService(
      config.whatsapp.phoneNumberId,
      config.whatsapp.accessToken
    );
    this.accessCodeService = new AccessCodeService(database);
    this.logHistoryService = new LogHistoryService(database);

    this.config = config;
    this.db = database;
  }

  /**
   * PASO 1: Iniciar proceso de checkout
   * CORRECCIÓN CRÍTICA: Valida price_id ANTES de crear sesión
   */
  async initiateCheckout(req, res) {
    try {
      const { priceId, customerEmail, customerName, productName } = req.body;

      // Validación de datos
      if (!priceId || !customerEmail) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Faltan campos requeridos: priceId y customerEmail',
        });
      }

      logger.info('Checkout initiated', {
        priceId,
        customerEmail,
        productName,
      });

      // CORRECCIÓN: Validar que el price_id existe
      // Esto previene el error "No such price: 'price_XXXXX'"
      const priceInfo = await this.stripeService.validatePriceId(priceId);

      // Crear sesión de checkout
      const session = await this.stripeService.createCheckoutSession({
        priceId,
        successUrl: `${this.config.baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${this.config.baseUrl}/cancel`,
        customerEmail,
        metadata: {
          customerName,
          productName,
          priceId,
        },
      });

      // Log del evento
      await this.logHistoryService.logPayment({
        userId: customerEmail,
        email: customerEmail,
        amount: priceInfo.amount,
        currency: priceInfo.currency,
        stripePriceId: priceId,
        status: 'initiated',
        metadata: {
          sessionId: session.sessionId,
          productName,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(200).json({
        success: true,
        sessionId: session.sessionId,
        checkoutUrl: session.url,
        priceInfo: {
          amount: priceInfo.amount,
          currency: priceInfo.currency,
        },
      });
    } catch (error) {
      logger.error('Error in initiateCheckout', {
        error: error.message || error,
        stack: error.stack,
      });

      // Log del error
      if (req.body.customerEmail) {
        await this.logHistoryService.logPaymentError({
          userId: req.body.customerEmail,
          email: req.body.customerEmail,
          errorType: error.code || 'CHECKOUT_ERROR',
          errorMessage: error.message || 'Error iniciando checkout',
          errorCode: error.code,
          stripePriceId: req.body.priceId,
          metadata: req.body,
          stack: error.stack,
          ipAddress: req.ip,
        });
      }

      return res.status(500).json({
        success: false,
        code: error.code || 'CHECKOUT_ERROR',
        message: error.message || 'Error al iniciar el proceso de pago',
      });
    }
  }

  /**
   * PASO 2: Webhook de Stripe - Pago completado
   * Este método se ejecuta cuando Stripe confirma el pago
   */
  async handleStripeWebhook(req, res) {
    try {
      const signature = req.headers['stripe-signature'];
      const rawBody = req.body;

      // Procesar webhook
      const webhookResult = await this.stripeService.handleWebhook(
        rawBody,
        signature,
        this.config.stripe.webhookSecret
      );

      // Si es un checkout completado, procesar pago
      if (webhookResult.type === 'checkout.completed') {
        await this.processSuccessfulPayment(webhookResult);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error('Webhook processing error', {
        error: error.message,
        stack: error.stack,
      });

      return res.status(400).json({
        success: false,
        message: 'Error procesando webhook',
      });
    }
  }

  /**
   * PASO 3: Procesar pago exitoso
   * Genera código de acceso y envía notificaciones
   */
  async processSuccessfulPayment(paymentData) {
    const {
      customerEmail,
      amount,
      currency,
      sessionId,
      metadata,
    } = paymentData;

    try {
      logger.info('Processing successful payment', {
        customerEmail,
        amount,
        currency,
        sessionId,
      });

      // PASO 3.1: Generar código de acceso único
      const accessCode = await this.accessCodeService.createUniqueCode();

      // PASO 3.2: Guardar código en base de datos
      const savedCode = await this.accessCodeService.saveAccessCode({
        code: accessCode,
        userId: customerEmail,
        email: customerEmail,
        productId: metadata.priceId,
        productName: metadata.productName || 'Producto EC0301',
        paymentId: sessionId,
        amount: amount / 100, // Stripe guarda en centavos
        currency,
        expiresAt: null, // 90 días por defecto
        metadata: {
          sessionId,
          ...metadata,
        },
      });

      // Log del código generado
      await this.logHistoryService.logAccessCode({
        userId: customerEmail,
        email: customerEmail,
        accessCode,
        expiresAt: savedCode.expiresAt,
        productId: metadata.priceId,
        paymentId: sessionId,
      });

      // PASO 3.3: Enviar notificación por email
      const emailData = {
        to: customerEmail,
        name: metadata.customerName || 'Estudiante',
        accessCode,
        expiresAt: savedCode.expiresAt,
        productName: metadata.productName || 'Producto EC0301',
        amount: amount / 100,
        paymentId: sessionId,
      };

      const emailResult = await this.emailService.sendAccessCode(emailData);

      // Log de email enviado
      await this.logHistoryService.logNotification({
        userId: customerEmail,
        type: 'email',
        destination: customerEmail,
        status: 'success',
        messageId: emailResult.messageId,
        metadata: {
          accessCode,
          productName: metadata.productName,
        },
      });

      // PASO 3.4: Enviar notificación por WhatsApp (si hay teléfono)
      if (metadata.phone) {
        try {
          const formattedPhone = WhatsAppService.formatPhoneNumber(metadata.phone);

          const whatsappData = {
            to: formattedPhone,
            name: metadata.customerName || 'Estudiante',
            accessCode,
            expiresAt: savedCode.expiresAt,
            productName: metadata.productName || 'Producto EC0301',
            amount: amount / 100,
          };

          const whatsappResult = await this.whatsappService.sendAccessCode(whatsappData);

          // Log de WhatsApp enviado
          await this.logHistoryService.logNotification({
            userId: customerEmail,
            type: 'whatsapp',
            destination: formattedPhone,
            status: 'success',
            messageId: whatsappResult.messageId,
            metadata: {
              accessCode,
              productName: metadata.productName,
            },
          });
        } catch (whatsappError) {
          logger.warn('WhatsApp notification failed', {
            error: whatsappError.message,
            email: customerEmail,
          });
          // No fallar el proceso si WhatsApp falla
        }
      }

      // PASO 3.5: Log final del pago exitoso
      await this.logHistoryService.logPayment({
        userId: customerEmail,
        email: customerEmail,
        amount: amount / 100,
        currency,
        stripePaymentId: sessionId,
        stripePriceId: metadata.priceId,
        status: 'succeeded',
        metadata: {
          accessCode,
          productName: metadata.productName,
        },
        ipAddress: null,
        userAgent: null,
      });

      logger.info('Payment processed successfully', {
        customerEmail,
        accessCode,
        emailSent: true,
        whatsappSent: !!metadata.phone,
      });

      return {
        success: true,
        accessCode,
        emailSent: true,
      };
    } catch (error) {
      logger.error('Error processing successful payment', {
        error: error.message,
        stack: error.stack,
        customerEmail,
      });

      // Log del error
      await this.logHistoryService.logPaymentError({
        userId: customerEmail,
        email: customerEmail,
        errorType: 'PAYMENT_PROCESSING_ERROR',
        errorMessage: error.message,
        errorCode: error.code,
        stripePriceId: metadata?.priceId,
        metadata: paymentData,
        stack: error.stack,
        ipAddress: null,
      });

      throw error;
    }
  }

  /**
   * Obtener todos los precios activos (para configuración)
   */
  async getActivePrices(req, res) {
    try {
      const prices = await this.stripeService.getAllActivePrices();

      return res.status(200).json({
        success: true,
        prices,
        count: prices.length,
      });
    } catch (error) {
      logger.error('Error getting active prices', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Error obteniendo precios activos',
      });
    }
  }

  /**
   * Validar código de acceso
   */
  async validateAccessCode(req, res) {
    try {
      const { code, email } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Código requerido',
        });
      }

      const validation = await this.accessCodeService.validateCode(code, email);

      return res.status(200).json({
        success: validation.valid,
        ...validation,
      });
    } catch (error) {
      logger.error('Error validating access code', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Error validando código',
      });
    }
  }

  /**
   * Obtener historial de un usuario
   */
  async getUserHistory(req, res) {
    try {
      const { userId } = req.params;
      const { eventType, startDate, endDate, limit, skip } = req.query;

      const history = await this.logHistoryService.getUserHistory(userId, {
        eventType,
        startDate,
        endDate,
        limit: parseInt(limit) || 50,
        skip: parseInt(skip) || 0,
      });

      return res.status(200).json({
        success: true,
        history,
        count: history.length,
      });
    } catch (error) {
      logger.error('Error getting user history', {
        error: error.message,
        userId: req.params.userId,
      });

      return res.status(500).json({
        success: false,
        message: 'Error obteniendo historial',
      });
    }
  }

  /**
   * Obtener estadísticas de eficiencia
   */
  async getEfficiencyStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Se requieren startDate y endDate',
        });
      }

      const stats = await this.logHistoryService.getEfficiencyStats(
        startDate,
        endDate
      );

      return res.status(200).json({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error('Error getting efficiency stats', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas',
      });
    }
  }
}

module.exports = PaymentController;

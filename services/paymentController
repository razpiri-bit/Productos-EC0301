/**
 * CONTROLADOR DE PAGOS V2
 * 
 * Maneja pagos con métodos de notificación diferida (OXXO, transferencias)
 * 
 * FLUJO PARA MÉTODOS DIFERIDOS:
 * 1. Usuario inicia checkout → Crear sesión con múltiples métodos
 * 2. Usuario elige método (OXXO/transferencia)
 * 3. Se genera voucher/instrucciones
 * 4. Sistema crea registro de pago PENDIENTE
 * 5. Se envía email con instrucciones de pago
 * 6. Usuario paga en OXXO o hace transferencia
 * 7. Stripe envía webhook payment_intent.succeeded
 * 8. SOLO ENTONCES se completa el pedido y se envía código
 * 
 * @version 2.0.0
 * @author Roberto Azpiri García
 */

const { logger, LogHistoryService } = require('../utils/logger');
const StripeServiceV2 = require('../services/stripeServiceV2');
const EmailService = require('../services/emailService');
const WhatsAppService = require('../services/whatsappService');
const AccessCodeService = require('../services/accessCodeService');
const PaymentStateService = require('../services/paymentStateService');

class PaymentControllerV2 {
  constructor(config, database) {
    this.stripeService = new StripeServiceV2(config.stripe.secretKey);
    this.emailService = new EmailService(
      config.postmark.serverToken,
      config.postmark.fromEmail
    );
    this.whatsappService = new WhatsAppService(
      config.whatsapp.phoneNumberId,
      config.whatsapp.accessToken
    );
    this.accessCodeService = new AccessCodeService(database);
    this.paymentStateService = new PaymentStateService(database);
    this.logHistoryService = new LogHistoryService(database);

    this.config = config;
    this.db = database;
  }

  /**
   * PASO 1: Iniciar proceso de checkout
   * Ahora con soporte para OXXO y transferencias
   */
  async initiateCheckout(req, res) {
    try {
      const { 
        priceId, 
        customerEmail, 
        customerName, 
        productName,
        phone,
        paymentMethods = ['card', 'oxxo', 'customer_balance'] // Por defecto todos
      } = req.body;

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
        paymentMethods,
      });

      // Validar price_id
      const priceInfo = await this.stripeService.validatePriceId(priceId);

      // Crear sesión de checkout con múltiples métodos de pago
      const session = await this.stripeService.createCheckoutSession({
        priceId,
        successUrl: `${this.config.baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${this.config.baseUrl}/cancel`,
        customerEmail,
        paymentMethodTypes: paymentMethods,
        metadata: {
          customerName,
          productName,
          priceId,
          phone,
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
          paymentMethods,
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
        supportedPaymentMethods: paymentMethods,
      });
    } catch (error) {
      logger.error('Error in initiateCheckout', {
        error: error.message || error,
        stack: error.stack,
      });

      if (req.body.customerEmail) {
        await this.logHistoryService.logPaymentError({
          userId: req.body.customerEmail,
          email: req.body.customerEmail,
          errorType: error.code || 'CHECKOUT_ERROR',
          errorMessage: error.message || 'Error iniciando checkout',
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
   * PASO 2: Webhook de Stripe
   * CRÍTICO: Maneja múltiples eventos para métodos diferidos
   */
  async handleStripeWebhook(req, res) {
    try {
      const signature = req.headers['stripe-signature'];
      const rawBody = req.body;

      const webhookResult = await this.stripeService.handleWebhook(
        rawBody,
        signature,
        this.config.stripe.webhookSecret
      );

      logger.info('Webhook processed', {
        type: webhookResult.type,
        status: webhookResult.status,
      });

      // Procesar según tipo de evento
      switch (webhookResult.type) {
        case 'checkout.completed':
          await this.handleCheckoutCompleted(webhookResult);
          break;

        case 'payment_intent.created':
          await this.handlePaymentIntentCreated(webhookResult);
          break;

        case 'payment.processing':
          await this.handlePaymentProcessing(webhookResult);
          break;

        case 'payment.succeeded':
          // CRÍTICO: Este es el evento que completa el pedido
          await this.handlePaymentSucceeded(webhookResult);
          break;

        case 'payment.failed':
          await this.handlePaymentFailed(webhookResult);
          break;

        case 'payment.canceled':
          await this.handlePaymentCanceled(webhookResult);
          break;
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
   * Manejar checkout completado
   * Para métodos diferidos, SOLO crear registro pendiente
   */
  async handleCheckoutCompleted(webhookData) {
    const {
      sessionId,
      customerEmail,
      amount,
      currency,
      metadata,
      isPaid,
      isPending,
      paymentMethodTypes,
    } = webhookData;

    try {
      logger.info('Processing checkout completed', {
        sessionId,
        customerEmail,
        isPaid,
        isPending,
        paymentMethodTypes,
      });

      // Si el pago ya está completado (tarjeta), procesarlo inmediatamente
      if (isPaid) {
        logger.info('Payment already completed (instant method)', {
          sessionId,
          customerEmail,
        });
        // Buscar el payment intent de la sesión
        // y procesarlo como pago exitoso
        // (esto se manejará en payment.succeeded)
      }

      // Si el pago está pendiente (OXXO/transferencia)
      if (isPending) {
        logger.info('Payment pending (deferred method)', {
          sessionId,
          customerEmail,
          paymentMethodTypes,
        });

        // Aquí NO completamos el pedido
        // Solo enviamos instrucciones de pago
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling checkout completed', {
        error: error.message,
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Manejar Payment Intent creado
   * Se envían instrucciones de pago para OXXO/transferencia
   */
  async handlePaymentIntentCreated(webhookData) {
    const {
      paymentIntentId,
      amount,
      currency,
      isOxxo,
      isTransfer,
      nextAction,
    } = webhookData;

    try {
      logger.info('Processing payment intent created', {
        paymentIntentId,
        isOxxo,
        isTransfer,
        amount,
      });

      // Obtener detalles completos del payment intent
      const paymentIntent = await this.stripeService.getPaymentIntent(
        paymentIntentId
      );

      // Crear registro de pago pendiente
      const paymentRecord = await this.paymentStateService.createPendingPayment({
        sessionId: paymentIntent.sessionId,
        paymentIntentId,
        customerEmail: paymentIntent.receipt_email, // Obtener del payment intent
        customerName: paymentIntent.metadata?.customerName,
        amount: amount / 100,
        currency,
        paymentMethod: isOxxo ? 'oxxo' : isTransfer ? 'customer_balance' : 'other',
        productName: paymentIntent.metadata?.productName,
        priceId: paymentIntent.metadata?.priceId,
        metadata: paymentIntent.metadata,
      });

      // Enviar email con instrucciones de pago
      if (isOxxo) {
        await this.sendOxxoInstructions(paymentRecord, nextAction);
      } else if (isTransfer) {
        await this.sendTransferInstructions(paymentRecord, nextAction);
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling payment intent created', {
        error: error.message,
        paymentIntentId,
      });
      throw error;
    }
  }

  /**
   * CRÍTICO: Manejar pago exitoso
   * AQUÍ se completa el pedido para métodos diferidos
   */
  async handlePaymentSucceeded(webhookData) {
    const { paymentIntentId, amount, currency } = webhookData;

    try {
      logger.info('Processing payment succeeded', {
        paymentIntentId,
        amount,
      });

      // Obtener registro de pago
      const payment = await this.paymentStateService.getPayment(paymentIntentId);

      if (!payment) {
        logger.warn('Payment record not found', { paymentIntentId });
        // Esto puede pasar si fue pago con tarjeta (instantáneo)
        // En ese caso, procesar como antes
        return await this.processInstantPayment(webhookData);
      }

      // Actualizar estado a succeeded
      await this.paymentStateService.updatePaymentStatus(
        paymentIntentId,
        PaymentStateService.STATES.SUCCEEDED,
        'Pago confirmado por Stripe'
      );

      // AHORA SÍ completar el pedido
      await this.completeOrder(payment);

      return { success: true };
    } catch (error) {
      logger.error('Error handling payment succeeded', {
        error: error.message,
        paymentIntentId,
      });
      throw error;
    }
  }

  /**
   * Completar pedido: generar código y enviar notificaciones
   */
  async completeOrder(payment) {
    try {
      logger.info('Completing order', {
        paymentIntentId: payment.paymentIntentId,
        customerEmail: payment.customerEmail,
      });

      // Generar código de acceso
      const accessCode = await this.accessCodeService.createUniqueCode();

      // Guardar código
      await this.accessCodeService.saveAccessCode({
        code: accessCode,
        userId: payment.customerEmail,
        email: payment.customerEmail,
        productId: payment.priceId,
        productName: payment.productName,
        paymentId: payment.paymentIntentId,
        amount: payment.amount,
        currency: payment.currency,
        metadata: payment.metadata,
      });

      // Marcar pedido como completado
      await this.paymentStateService.markOrderCompleted(
        payment.paymentIntentId,
        accessCode
      );

      // Enviar email con código
      const emailData = {
        to: payment.customerEmail,
        name: payment.customerName,
        accessCode,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 días
        productName: payment.productName,
        amount: payment.amount,
        paymentId: payment.paymentIntentId,
      };

      await this.emailService.sendAccessCode(emailData);
      await this.paymentStateService.markNotificationSent(
        payment.paymentIntentId,
        'email',
        true
      );

      // Enviar WhatsApp si hay teléfono
      if (payment.metadata?.phone) {
        try {
          const formattedPhone = WhatsAppService.formatPhoneNumber(
            payment.metadata.phone
          );

          await this.whatsappService.sendAccessCode({
            to: formattedPhone,
            name: payment.customerName,
            accessCode,
            expiresAt: emailData.expiresAt,
            productName: payment.productName,
            amount: payment.amount,
          });

          await this.paymentStateService.markNotificationSent(
            payment.paymentIntentId,
            'whatsapp',
            true
          );
        } catch (whatsappError) {
          logger.warn('WhatsApp notification failed', {
            error: whatsappError.message,
            paymentIntentId: payment.paymentIntentId,
          });
        }
      }

      logger.info('Order completed successfully', {
        paymentIntentId: payment.paymentIntentId,
        accessCode,
        customerEmail: payment.customerEmail,
      });

      return { success: true, accessCode };
    } catch (error) {
      logger.error('Error completing order', {
        error: error.message,
        paymentIntentId: payment.paymentIntentId,
      });
      throw error;
    }
  }

  /**
   * Enviar instrucciones de pago OXXO
   */
  async sendOxxoInstructions(payment, nextAction) {
    try {
      const oxxoDetails = nextAction?.oxxo_display_details;

      const emailHtml = `
        <h2>Pago Pendiente - OXXO</h2>
        <p>Hola ${payment.customerName},</p>
        <p>Tu pedido está confirmado. Para completarlo, realiza el pago en cualquier tienda OXXO.</p>
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>Referencia de pago:</h3>
          <p style="font-size: 24px; font-weight: bold;">${oxxoDetails?.number || 'Ver en Stripe'}</p>
          <p><strong>Monto:</strong> $${payment.amount} ${payment.currency.toUpperCase()}</p>
          <p><strong>Expira:</strong> ${payment.expiresAt.toLocaleDateString('es-MX')}</p>
        </div>
        <p><strong>Instrucciones:</strong></p>
        <ol>
          <li>Acude a cualquier tienda OXXO</li>
          <li>Indica que harás un pago de servicio</li>
          <li>Proporciona la referencia de pago</li>
          <li>Realiza el pago en efectivo</li>
        </ol>
        <p>Una vez que realices el pago, recibirás tu código de acceso por email y WhatsApp.</p>
      `;

      await this.emailService.client.sendEmail({
        From: this.emailService.fromEmail,
        To: payment.customerEmail,
        Subject: '⏳ Pago Pendiente - Instrucciones OXXO',
        HtmlBody: emailHtml,
        Tag: 'oxxo-instructions',
      });

      await this.paymentStateService.markNotificationSent(
        payment.paymentIntentId,
        'email',
        false
      );

      logger.info('OXXO instructions sent', {
        paymentIntentId: payment.paymentIntentId,
        customerEmail: payment.customerEmail,
      });
    } catch (error) {
      logger.error('Error sending OXXO instructions', {
        error: error.message,
        paymentIntentId: payment.paymentIntentId,
      });
      throw error;
    }
  }

  /**
   * Enviar instrucciones de transferencia bancaria
   */
  async sendTransferInstructions(payment, nextAction) {
    try {
      const transferDetails = nextAction?.display_bank_transfer_instructions;

      const emailHtml = `
        <h2>Pago Pendiente - Transferencia Bancaria</h2>
        <p>Hola ${payment.customerName},</p>
        <p>Tu pedido está confirmado. Para completarlo, realiza una transferencia bancaria.</p>
        <div style="background: #f5f5f5; padding: 20px; margin: 20px 0;">
          <h3>Datos de la transferencia:</h3>
          <p><strong>Monto:</strong> $${payment.amount} ${payment.currency.toUpperCase()}</p>
          <p><strong>Expira:</strong> ${payment.expiresAt.toLocaleDateString('es-MX')}</p>
          <p>Los detalles completos de la transferencia se encuentran en tu página de pago de Stripe.</p>
        </div>
        <p>Una vez que realices la transferencia, recibirás tu código de acceso por email y WhatsApp.</p>
      `;

      await this.emailService.client.sendEmail({
        From: this.emailService.fromEmail,
        To: payment.customerEmail,
        Subject: '⏳ Pago Pendiente - Instrucciones de Transferencia',
        HtmlBody: emailHtml,
        Tag: 'transfer-instructions',
      });

      await this.paymentStateService.markNotificationSent(
        payment.paymentIntentId,
        'email',
        false
      );

      logger.info('Transfer instructions sent', {
        paymentIntentId: payment.paymentIntentId,
        customerEmail: payment.customerEmail,
      });
    } catch (error) {
      logger.error('Error sending transfer instructions', {
        error: error.message,
        paymentIntentId: payment.paymentIntentId,
      });
      throw error;
    }
  }

  /**
   * Manejar pago en proceso
   */
  async handlePaymentProcessing(webhookData) {
    const { paymentIntentId } = webhookData;

    try {
      await this.paymentStateService.updatePaymentStatus(
        paymentIntentId,
        PaymentStateService.STATES.PROCESSING,
        'Pago en proceso de validación'
      );

      logger.info('Payment marked as processing', { paymentIntentId });
    } catch (error) {
      logger.error('Error handling payment processing', {
        error: error.message,
        paymentIntentId,
      });
    }
  }

  /**
   * Manejar pago fallido
   */
  async handlePaymentFailed(webhookData) {
    const { paymentIntentId, error: paymentError } = webhookData;

    try {
      await this.paymentStateService.updatePaymentStatus(
        paymentIntentId,
        PaymentStateService.STATES.FAILED,
        `Pago fallido: ${paymentError?.message || 'Error desconocido'}`
      );

      logger.error('Payment failed', {
        paymentIntentId,
        error: paymentError,
      });
    } catch (error) {
      logger.error('Error handling payment failed', {
        error: error.message,
        paymentIntentId,
      });
    }
  }

  /**
   * Manejar pago cancelado
   */
  async handlePaymentCanceled(webhookData) {
    const { paymentIntentId } = webhookData;

    try {
      await this.paymentStateService.updatePaymentStatus(
        paymentIntentId,
        PaymentStateService.STATES.CANCELED,
        'Pago cancelado por el usuario o por el sistema'
      );

      logger.warn('Payment canceled', { paymentIntentId });
    } catch (error) {
      logger.error('Error handling payment canceled', {
        error: error.message,
        paymentIntentId,
      });
    }
  }

  /**
   * Procesar pago instantáneo (tarjeta)
   * Mantener compatibilidad con flujo anterior
   */
  async processInstantPayment(webhookData) {
    // Implementación del flujo original para pagos con tarjeta
    logger.info('Processing instant payment', webhookData);
    // ... (usar lógica del controlador original)
  }

  /**
   * Obtener estado de pago
   */
  async getPaymentStatus(req, res) {
    try {
      const { paymentIntentId } = req.params;

      const payment = await this.paymentStateService.getPayment(paymentIntentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Pago no encontrado',
        });
      }

      return res.status(200).json({
        success: true,
        payment: {
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          orderCompleted: payment.orderCompleted,
          createdAt: payment.createdAt,
          paidAt: payment.paidAt,
          expiresAt: payment.expiresAt,
        },
      });
    } catch (error) {
      logger.error('Error getting payment status', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Error obteniendo estado del pago',
      });
    }
  }

  /**
   * Obtener pagos pendientes (admin)
   */
  async getPendingPayments(req, res) {
    try {
      const payments = await this.paymentStateService.getPendingPayments();

      return res.status(200).json({
        success: true,
        payments,
        count: payments.length,
      });
    } catch (error) {
      logger.error('Error getting pending payments', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Error obteniendo pagos pendientes',
      });
    }
  }

  // Mantener los demás métodos del controlador original...
  // (validateAccessCode, getUserHistory, getEfficiencyStats, etc.)
}

module.exports = PaymentControllerV2;

/**
 * SERVICIO DE STRIPE MEJORADO
 * 
 * Soporta métodos de pago de notificación diferida:
 * - OXXO (pago en efectivo)
 * - Transferencias bancarias
 * - Tarjetas (instantáneo)
 * 
 * IMPORTANTE: Para OXXO y transferencias, NO completar el pedido
 * hasta recibir confirmación del pago vía webhook.
 * 
 * @version 2.0.0
 * @author Roberto Azpiri García
 * 
 * CAMBIOS v2.0.0:
 * - Agregado soporte para OXXO
 * - Agregado soporte para transferencias bancarias
 * - Estados de pago pendientes
 * - Notificaciones para instrucciones de pago
 */

const Stripe = require('stripe');
const { logger } = require('../utils/logger');

class StripeServiceV2 {
  constructor(secretKey) {
    this.stripe = new Stripe(secretKey);
    this.priceCache = new Map();
    this.productCache = new Map();
  }

  /**
   * Validar price_id
   */
  async validatePriceId(priceId) {
    try {
      if (this.priceCache.has(priceId)) {
        return this.priceCache.get(priceId);
      }

      const price = await this.stripe.prices.retrieve(priceId);
      
      this.priceCache.set(priceId, {
        id: price.id,
        active: price.active,
        currency: price.currency,
        amount: price.unit_amount,
        product: price.product,
        validatedAt: new Date(),
      });

      logger.info('Price ID validated successfully', {
        priceId,
        active: price.active,
        amount: price.unit_amount,
      });

      return this.priceCache.get(priceId);
    } catch (error) {
      logger.error('Invalid price ID', {
        priceId,
        error: error.message,
      });

      throw {
        code: 'INVALID_PRICE_ID',
        message: `El ID de precio '${priceId}' no existe en Stripe.`,
        originalError: error.message,
        priceId,
      };
    }
  }

  /**
   * Crear sesión de checkout con soporte para múltiples métodos de pago
   * Incluye OXXO y transferencias bancarias
   */
  async createCheckoutSession(data) {
    const {
      priceId,
      successUrl,
      cancelUrl,
      customerEmail,
      metadata = {},
      mode = 'payment',
      paymentMethodTypes = ['card', 'oxxo', 'customer_balance'], // Métodos soportados
    } = data;

    try {
      // Validar price_id
      const priceInfo = await this.validatePriceId(priceId);

      if (!priceInfo.active) {
        throw {
          code: 'INACTIVE_PRICE',
          message: 'El precio configurado no está activo',
          priceId,
        };
      }

      // Configuración de la sesión
      const sessionConfig = {
        mode,
        payment_method_types: paymentMethodTypes,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerEmail,
        metadata: {
          ...metadata,
          priceId,
          createdAt: new Date().toISOString(),
        },
        // Configuración para OXXO
        payment_method_options: {
          oxxo: {
            expires_after_days: 3, // Voucher expira en 3 días
          },
        },
        // Importante: Configurar idioma para OXXO
        locale: 'es',
      };

      // Para transferencias bancarias, agregar configuración adicional
      if (paymentMethodTypes.includes('customer_balance')) {
        sessionConfig.payment_method_options.customer_balance = {
          funding_type: 'bank_transfer',
          bank_transfer: {
            type: 'mx_bank_transfer', // Para México
          },
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionConfig);

      logger.info('Checkout session created', {
        sessionId: session.id,
        priceId,
        customerEmail,
        paymentMethodTypes,
        amount: priceInfo.amount,
      });

      return {
        sessionId: session.id,
        url: session.url,
        priceInfo,
        paymentMethodTypes,
      };
    } catch (error) {
      logger.error('Error creating checkout session', {
        error: error.message || error,
        priceId,
        customerEmail,
      });

      throw {
        code: error.code || 'CHECKOUT_ERROR',
        message: error.message || 'Error al crear la sesión de pago',
        details: error,
      };
    }
  }

  /**
   * Procesar webhook de Stripe
   * CRÍTICO: Maneja eventos de pago diferido
   */
  async handleWebhook(rawBody, signature, webhookSecret) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      logger.info('Webhook received', {
        type: event.type,
        eventId: event.id,
      });

      switch (event.type) {
        // Checkout completado (usuario terminó el flujo)
        case 'checkout.session.completed':
          return await this.handleCheckoutComplete(event.data.object);

        // IMPORTANTE: Pago confirmado (para OXXO y transferencias)
        case 'payment_intent.succeeded':
          return await this.handlePaymentSuccess(event.data.object);

        // Pago fallido
        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event.data.object);

        // OXXO: Voucher generado
        case 'payment_intent.created':
          return await this.handlePaymentIntentCreated(event.data.object);

        // Estados intermedios importantes
        case 'payment_intent.processing':
          return await this.handlePaymentProcessing(event.data.object);

        case 'payment_intent.canceled':
          return await this.handlePaymentCanceled(event.data.object);

        default:
          logger.info('Unhandled webhook event', { type: event.type });
          return { received: true, handled: false };
      }
    } catch (error) {
      logger.error('Webhook error', {
        error: error.message,
        stack: error.stack,
      });

      throw {
        code: 'WEBHOOK_ERROR',
        message: 'Error procesando webhook de Stripe',
        originalError: error.message,
      };
    }
  }

  /**
   * Manejar checkout completado
   * IMPORTANTE: No significa que el pago esté confirmado
   */
  async handleCheckoutComplete(session) {
    try {
      logger.info('Checkout completed', {
        sessionId: session.id,
        customerEmail: session.customer_email,
        paymentStatus: session.payment_status,
        paymentMethod: session.payment_method_types,
      });

      // CRÍTICO: Verificar estado del pago
      const isPaid = session.payment_status === 'paid';
      const isPending = session.payment_status === 'unpaid';

      return {
        type: 'checkout.completed',
        sessionId: session.id,
        customerEmail: session.customer_email,
        amount: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        paymentStatus: session.payment_status,
        isPaid, // true solo si el pago fue instantáneo (tarjeta)
        isPending, // true para OXXO y transferencias
        paymentMethodTypes: session.payment_method_types,
      };
    } catch (error) {
      logger.error('Error handling checkout complete', { error: error.message });
      throw error;
    }
  }

  /**
   * Manejar Payment Intent creado
   * Se dispara cuando se genera un voucher de OXXO o instrucciones de transferencia
   */
  async handlePaymentIntentCreated(paymentIntent) {
    logger.info('Payment Intent created', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      status: paymentIntent.status,
      paymentMethod: paymentIntent.payment_method_types,
    });

    // Verificar si es OXXO
    const isOxxo = paymentIntent.payment_method_types?.includes('oxxo');
    const isTransfer = paymentIntent.payment_method_types?.includes('customer_balance');

    return {
      type: 'payment_intent.created',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      isOxxo,
      isTransfer,
      // Si es OXXO, aquí estarán las instrucciones
      nextAction: paymentIntent.next_action,
    };
  }

  /**
   * Manejar pago en proceso
   * Se dispara cuando el usuario pagó en OXXO o hizo la transferencia
   * pero aún está en validación
   */
  async handlePaymentProcessing(paymentIntent) {
    logger.info('Payment processing', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      status: paymentIntent.status,
    });

    return {
      type: 'payment.processing',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'processing',
      message: 'Pago en proceso de validación',
    };
  }

  /**
   * CRÍTICO: Manejar pago exitoso
   * SOLO aquí se debe completar el pedido para OXXO y transferencias
   */
  async handlePaymentSuccess(paymentIntent) {
    logger.info('Payment succeeded', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      paymentMethod: paymentIntent.payment_method_types,
    });

    return {
      type: 'payment.succeeded',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'succeeded',
      // ESTE es el momento de completar el pedido
      shouldCompleteOrder: true,
    };
  }

  /**
   * Manejar pago fallido
   */
  async handlePaymentFailed(paymentIntent) {
    logger.error('Payment failed', {
      paymentIntentId: paymentIntent.id,
      lastError: paymentIntent.last_payment_error,
    });

    return {
      type: 'payment.failed',
      paymentIntentId: paymentIntent.id,
      error: paymentIntent.last_payment_error,
      status: 'failed',
    };
  }

  /**
   * Manejar pago cancelado
   */
  async handlePaymentCanceled(paymentIntent) {
    logger.warn('Payment canceled', {
      paymentIntentId: paymentIntent.id,
      cancellationReason: paymentIntent.cancellation_reason,
    });

    return {
      type: 'payment.canceled',
      paymentIntentId: paymentIntent.id,
      status: 'canceled',
    };
  }

  /**
   * Obtener detalles de un Payment Intent
   * Útil para verificar estado de pagos de OXXO
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId,
        {
          expand: ['payment_method'],
        }
      );

      logger.info('Payment Intent retrieved', {
        paymentIntentId,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
      });

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        paymentMethod: paymentIntent.payment_method,
        nextAction: paymentIntent.next_action,
        created: paymentIntent.created,
      };
    } catch (error) {
      logger.error('Error retrieving payment intent', {
        paymentIntentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtener todos los precios activos
   */
  async getAllActivePrices() {
    try {
      const prices = await this.stripe.prices.list({
        active: true,
        limit: 100,
      });

      logger.info('Retrieved active prices from Stripe', {
        count: prices.data.length,
      });

      return prices.data.map((price) => ({
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        product: price.product,
        nickname: price.nickname,
      }));
    } catch (error) {
      logger.error('Error retrieving active prices', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Limpiar caché
   */
  clearCache() {
    this.priceCache.clear();
    this.productCache.clear();
    logger.info('Stripe cache cleared');
  }
}

module.exports = StripeServiceV2;

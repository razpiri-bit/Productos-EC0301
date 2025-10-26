/**
 * SERVICIO DE STRIPE
 * 
 * Gestión centralizada de pagos con Stripe
 * Características:
 * - Validación automática de price_id
 * - Manejo robusto de errores
 * - Caché de configuración de productos
 * - Logging completo de transacciones
 * - Webhooks seguros
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 * 
 * HISTORIAL DE VERSIONES:
 * v1.0.0 - 2025-10-26 - Implementación inicial con validación de price_id
 */

const Stripe = require('stripe');
const { logger } = require('../utils/logger');

class StripeService {
  constructor(secretKey) {
    this.stripe = new Stripe(secretKey);
    this.priceCache = new Map();
    this.productCache = new Map();
  }

  /**
   * CORRECCIÓN PRINCIPAL: Validar que el price_id existe antes de usarlo
   * Esta función previene el error "No such price"
   */
  async validatePriceId(priceId) {
    try {
      // Verificar caché primero
      if (this.priceCache.has(priceId)) {
        return this.priceCache.get(priceId);
      }

      // Obtener información del precio desde Stripe
      const price = await this.stripe.prices.retrieve(priceId);
      
      // Guardar en caché
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
        currency: price.currency,
      });

      return this.priceCache.get(priceId);
    } catch (error) {
      logger.error('Invalid price ID', {
        priceId,
        error: error.message,
        errorType: error.type,
        errorCode: error.code,
      });

      // Retornar error específico
      throw {
        code: 'INVALID_PRICE_ID',
        message: `El ID de precio '${priceId}' no existe en Stripe. Verifica la configuración.`,
        originalError: error.message,
        priceId,
      };
    }
  }

  /**
   * Obtener todos los precios activos de Stripe
   * Útil para debugging y configuración inicial
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
   * Crear sesión de checkout con validación robusta
   */
  async createCheckoutSession(data) {
    const {
      priceId,
      successUrl,
      cancelUrl,
      customerEmail,
      metadata = {},
      mode = 'payment',
    } = data;

    try {
      // PASO 1: Validar price_id ANTES de crear la sesión
      const priceInfo = await this.validatePriceId(priceId);

      if (!priceInfo.active) {
        throw {
          code: 'INACTIVE_PRICE',
          message: 'El precio configurado no está activo en Stripe',
          priceId,
        };
      }

      // PASO 2: Crear sesión de checkout
      const session = await this.stripe.checkout.sessions.create({
        mode,
        payment_method_types: ['card'],
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
        // Importante: para suscripciones
        ...(mode === 'subscription' && {
          subscription_data: {
            metadata,
          },
        }),
      });

      logger.info('Checkout session created', {
        sessionId: session.id,
        priceId,
        customerEmail,
        amount: priceInfo.amount,
        currency: priceInfo.currency,
      });

      return {
        sessionId: session.id,
        url: session.url,
        priceInfo,
      };
    } catch (error) {
      logger.error('Error creating checkout session', {
        error: error.message || error,
        priceId,
        customerEmail,
        stack: error.stack,
      });

      // Retornar error amigable al usuario
      throw {
        code: error.code || 'CHECKOUT_ERROR',
        message: error.message || 'Error al crear la sesión de pago',
        details: error,
      };
    }
  }

  /**
   * Procesar webhook de Stripe
   */
  async handleWebhook(rawBody, signature, webhookSecret) {
    try {
      // Verificar firma del webhook
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      logger.info('Webhook received', {
        type: event.type,
        eventId: event.id,
      });

      // Procesar según tipo de evento
      switch (event.type) {
        case 'checkout.session.completed':
          return await this.handleCheckoutComplete(event.data.object);

        case 'payment_intent.succeeded':
          return await this.handlePaymentSuccess(event.data.object);

        case 'payment_intent.payment_failed':
          return await this.handlePaymentFailed(event.data.object);

        case 'customer.subscription.created':
          return await this.handleSubscriptionCreated(event.data.object);

        case 'customer.subscription.deleted':
          return await this.handleSubscriptionCancelled(event.data.object);

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
   */
  async handleCheckoutComplete(session) {
    try {
      logger.info('Checkout completed', {
        sessionId: session.id,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total,
        currency: session.currency,
      });

      return {
        type: 'checkout.completed',
        sessionId: session.id,
        customerEmail: session.customer_email,
        amount: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      };
    } catch (error) {
      logger.error('Error handling checkout complete', { error: error.message });
      throw error;
    }
  }

  /**
   * Manejar pago exitoso
   */
  async handlePaymentSuccess(paymentIntent) {
    logger.info('Payment succeeded', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });

    return {
      type: 'payment.succeeded',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
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
    };
  }

  /**
   * Manejar suscripción creada
   */
  async handleSubscriptionCreated(subscription) {
    logger.info('Subscription created', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
    });

    return {
      type: 'subscription.created',
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
    };
  }

  /**
   * Manejar suscripción cancelada
   */
  async handleSubscriptionCancelled(subscription) {
    logger.warn('Subscription cancelled', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
    });

    return {
      type: 'subscription.cancelled',
      subscriptionId: subscription.id,
      customerId: subscription.customer,
    };
  }

  /**
   * Crear Payment Intent directo (sin checkout)
   */
  async createPaymentIntent(data) {
    const { amount, currency, customerEmail, metadata = {} } = data;

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        receipt_email: customerEmail,
        metadata: {
          ...metadata,
          customerEmail,
        },
      });

      logger.info('Payment Intent created', {
        paymentIntentId: paymentIntent.id,
        amount,
        currency,
        customerEmail,
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (error) {
      logger.error('Error creating payment intent', {
        error: error.message,
        amount,
        currency,
      });
      throw error;
    }
  }

  /**
   * Limpiar caché (útil para actualizaciones)
   */
  clearCache() {
    this.priceCache.clear();
    this.productCache.clear();
    logger.info('Stripe cache cleared');
  }
}

module.exports = StripeService;

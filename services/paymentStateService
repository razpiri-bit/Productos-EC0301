/**
 * SERVICIO DE GESTIÓN DE ESTADOS DE PAGO
 * 
 * Maneja los diferentes estados de pago para métodos diferidos:
 * - pending: Esperando pago (OXXO, transferencia)
 * - processing: Pago recibido, en validación
 * - succeeded: Pago confirmado
 * - failed: Pago fallido
 * - canceled: Pago cancelado
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

const { logger } = require('../utils/logger');

class PaymentStateService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Estados de pago posibles
   */
  static STATES = {
    PENDING: 'pending',           // Esperando pago
    PROCESSING: 'processing',     // En proceso de validación
    SUCCEEDED: 'succeeded',       // Confirmado
    FAILED: 'failed',            // Fallido
    CANCELED: 'canceled',        // Cancelado
    EXPIRED: 'expired',          // Expirado (OXXO después de 3 días)
  };

  /**
   * Crear registro de pago pendiente
   * Se llama cuando el usuario completa el checkout pero el pago es diferido
   */
  async createPendingPayment(data) {
    const {
      sessionId,
      paymentIntentId,
      customerEmail,
      customerName,
      amount,
      currency,
      paymentMethod,
      productName,
      priceId,
      metadata = {},
    } = data;

    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const paymentRecord = {
        sessionId,
        paymentIntentId,
        customerEmail,
        customerName,
        amount,
        currency,
        paymentMethod, // 'oxxo', 'customer_balance', 'card'
        productName,
        priceId,
        status: PaymentStateService.STATES.PENDING,
        
        // Timestamps
        createdAt: new Date(),
        updatedAt: new Date(),
        paidAt: null,
        expiresAt: this.calculateExpiration(paymentMethod),
        
        // Metadatos
        metadata,
        
        // Flags de procesamiento
        orderCompleted: false,
        accessCodeGenerated: false,
        notificationsSent: {
          emailPending: false,
          emailSuccess: false,
          whatsappPending: false,
          whatsappSuccess: false,
        },
        
        // Historial de cambios de estado
        statusHistory: [
          {
            status: PaymentStateService.STATES.PENDING,
            timestamp: new Date(),
            reason: 'Pago iniciado',
          },
        ],
      };

      const result = await this.db
        .collection('payments')
        .insertOne(paymentRecord);

      logger.info('Pending payment created', {
        sessionId,
        paymentIntentId,
        customerEmail,
        paymentMethod,
        amount,
      });

      return {
        ...paymentRecord,
        _id: result.insertedId,
      };
    } catch (error) {
      logger.error('Error creating pending payment', {
        sessionId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Actualizar estado de pago
   */
  async updatePaymentStatus(paymentIntentId, newStatus, reason = '') {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
        $push: {
          statusHistory: {
            status: newStatus,
            timestamp: new Date(),
            reason,
          },
        },
      };

      // Si el pago fue exitoso, registrar cuándo se pagó
      if (newStatus === PaymentStateService.STATES.SUCCEEDED) {
        updateData.paidAt = new Date();
      }

      const result = await this.db.collection('payments').findOneAndUpdate(
        { paymentIntentId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        throw new Error('Payment not found');
      }

      logger.info('Payment status updated', {
        paymentIntentId,
        oldStatus: result.value.status,
        newStatus,
        reason,
      });

      return result.value;
    } catch (error) {
      logger.error('Error updating payment status', {
        paymentIntentId,
        newStatus,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Marcar pedido como completado
   */
  async markOrderCompleted(paymentIntentId, accessCode) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const result = await this.db.collection('payments').updateOne(
        { paymentIntentId },
        {
          $set: {
            orderCompleted: true,
            accessCodeGenerated: true,
            accessCode,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        throw new Error('Payment not found or already completed');
      }

      logger.info('Order marked as completed', {
        paymentIntentId,
        accessCode,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error marking order completed', {
        paymentIntentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Registrar envío de notificación
   */
  async markNotificationSent(paymentIntentId, notificationType, success = true) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const updateField = success
        ? `notificationsSent.${notificationType}Success`
        : `notificationsSent.${notificationType}Pending`;

      await this.db.collection('payments').updateOne(
        { paymentIntentId },
        {
          $set: {
            [updateField]: true,
            updatedAt: new Date(),
          },
        }
      );

      logger.info('Notification marked as sent', {
        paymentIntentId,
        notificationType,
        success,
      });
    } catch (error) {
      logger.error('Error marking notification sent', {
        paymentIntentId,
        notificationType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtener información de pago
   */
  async getPayment(paymentIntentId) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const payment = await this.db
        .collection('payments')
        .findOne({ paymentIntentId });

      return payment;
    } catch (error) {
      logger.error('Error getting payment', {
        paymentIntentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtener pagos pendientes
   */
  async getPendingPayments(filters = {}) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const query = {
        status: PaymentStateService.STATES.PENDING,
        ...filters,
      };

      const payments = await this.db
        .collection('payments')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return payments;
    } catch (error) {
      logger.error('Error getting pending payments', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtener pagos expirados que no se pagaron
   */
  async getExpiredPayments() {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const now = new Date();

      const payments = await this.db
        .collection('payments')
        .find({
          status: PaymentStateService.STATES.PENDING,
          expiresAt: { $lt: now },
        })
        .toArray();

      return payments;
    } catch (error) {
      logger.error('Error getting expired payments', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Marcar pagos expirados
   * Tarea periódica para mantener limpia la base de datos
   */
  async markExpiredPayments() {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const now = new Date();

      const result = await this.db.collection('payments').updateMany(
        {
          status: PaymentStateService.STATES.PENDING,
          expiresAt: { $lt: now },
        },
        {
          $set: {
            status: PaymentStateService.STATES.EXPIRED,
            updatedAt: now,
          },
          $push: {
            statusHistory: {
              status: PaymentStateService.STATES.EXPIRED,
              timestamp: now,
              reason: 'Pago no recibido antes de la fecha de expiración',
            },
          },
        }
      );

      if (result.modifiedCount > 0) {
        logger.info('Expired payments marked', {
          count: result.modifiedCount,
        });
      }

      return {
        expiredCount: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Error marking expired payments', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calcular fecha de expiración según método de pago
   */
  calculateExpiration(paymentMethod) {
    const expirationDate = new Date();

    switch (paymentMethod) {
      case 'oxxo':
        // OXXO expira en 3 días
        expirationDate.setDate(expirationDate.getDate() + 3);
        break;
      case 'customer_balance':
        // Transferencias bancarias: 7 días
        expirationDate.setDate(expirationDate.getDate() + 7);
        break;
      default:
        // Otros métodos: 1 día
        expirationDate.setDate(expirationDate.getDate() + 1);
    }

    return expirationDate;
  }

  /**
   * Obtener estadísticas de pagos por método
   */
  async getPaymentStatsByMethod(startDate, endDate) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      const stats = await this.db
        .collection('payments')
        .aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: {
                paymentMethod: '$paymentMethod',
                status: '$status',
              },
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
            },
          },
          { $sort: { '_id.paymentMethod': 1, '_id.status': 1 } },
        ])
        .toArray();

      return stats;
    } catch (error) {
      logger.error('Error getting payment stats', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = PaymentStateService;

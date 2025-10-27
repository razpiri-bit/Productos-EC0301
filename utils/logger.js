/**
 * SISTEMA DE LOGS Y HISTORIAL
 * 
 * Sistema centralizado para registro de eventos, errores y auditoría
 * Características:
 * - Registro jerárquico (info, warn, error, debug)
 * - Almacenamiento en archivos rotativos
 * - Almacenamiento en base de datos
 * - Trazabilidad completa de transacciones
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Crear directorio de logs si no existe
const logDir = process.env.LOG_FILE_PATH || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Formato personalizado de logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    return msg;
  })
);

// Configuración del logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // Logs de error
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Logs combinados
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 10,
    }),
    // Logs de pagos (críticos)
    new winston.transports.File({
      filename: path.join(logDir, 'payments.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 20,
    }),
  ],
});

// En desarrollo, también mostrar en consola
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

/**
 * Modelo de datos para historial en base de datos
 */
class LogHistoryService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Registra un evento de pago
   */
  async logPayment(data) {
    const logEntry = {
      eventType: 'payment',
      timestamp: new Date(),
      userId: data.userId,
      email: data.email,
      amount: data.amount,
      currency: data.currency,
      stripePaymentId: data.stripePaymentId,
      stripePriceId: data.stripePriceId,
      status: data.status,
      metadata: data.metadata || {},
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    };

    try {
      // Guardar en archivo de log
      logger.info('Payment processed', logEntry);

      // Guardar en base de datos
      if (this.db) {
        await this.db.collection('paymentHistory').insertOne(logEntry);
      }

      return logEntry;
    } catch (error) {
      logger.error('Error logging payment', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Registra un error de pago
   */
  async logPaymentError(data) {
    const errorLog = {
      eventType: 'payment_error',
      timestamp: new Date(),
      userId: data.userId,
      email: data.email,
      errorType: data.errorType,
      errorMessage: data.errorMessage,
      errorCode: data.errorCode,
      stripePriceId: data.stripePriceId,
      metadata: data.metadata || {},
      stack: data.stack,
      ipAddress: data.ipAddress,
    };

    try {
      logger.error('Payment error', errorLog);

      if (this.db) {
        await this.db.collection('errorHistory').insertOne(errorLog);
      }

      return errorLog;
    } catch (error) {
      logger.error('Error logging payment error', { error: error.message });
      throw error;
    }
  }

  /**
   * Registra envío de notificaciones
   */
  async logNotification(data) {
    const notificationLog = {
      eventType: 'notification',
      timestamp: new Date(),
      userId: data.userId,
      notificationType: data.type, // 'email' o 'whatsapp'
      destination: data.destination,
      status: data.status,
      messageId: data.messageId,
      metadata: data.metadata || {},
    };

    try {
      logger.info('Notification sent', notificationLog);

      if (this.db) {
        await this.db.collection('notificationHistory').insertOne(notificationLog);
      }

      return notificationLog;
    } catch (error) {
      logger.error('Error logging notification', { error: error.message });
      throw error;
    }
  }

  /**
   * Registra código de acceso generado
   */
  async logAccessCode(data) {
    const accessLog = {
      eventType: 'access_code_generated',
      timestamp: new Date(),
      userId: data.userId,
      email: data.email,
      accessCode: data.accessCode,
      expiresAt: data.expiresAt,
      productId: data.productId,
      paymentId: data.paymentId,
    };

    try {
      logger.info('Access code generated', accessLog);

      if (this.db) {
        await this.db.collection('accessCodeHistory').insertOne(accessLog);
      }

      return accessLog;
    } catch (error) {
      logger.error('Error logging access code', { error: error.message });
      throw error;
    }
  }

  /**
   * Obtiene historial de eventos para un usuario
   */
  async getUserHistory(userId, options = {}) {
    const {
      eventType = null,
      startDate = null,
      endDate = null,
      limit = 50,
      skip = 0,
    } = options;

    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const query = { userId };

      if (eventType) {
        query.eventType = eventType;
      }

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      // Buscar en todas las colecciones relevantes
      const collections = [
        'paymentHistory',
        'errorHistory',
        'notificationHistory',
        'accessCodeHistory',
      ];

      const results = [];
      for (const collectionName of collections) {
        const docs = await this.db
          .collection(collectionName)
          .find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(skip)
          .toArray();
        results.push(...docs);
      }

      // Ordenar por timestamp descendente
      results.sort((a, b) => b.timestamp - a.timestamp);

      return results.slice(0, limit);
    } catch (error) {
      logger.error('Error retrieving user history', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Obtiene estadísticas de eficiencia
   */
  async getEfficiencyStats(startDate, endDate) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const dateFilter = {
        timestamp: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };

      // Pagos exitosos
      const successfulPayments = await this.db
        .collection('paymentHistory')
        .countDocuments({ ...dateFilter, status: 'succeeded' });

      // Errores de pago
      const failedPayments = await this.db
        .collection('errorHistory')
        .countDocuments({ ...dateFilter, eventType: 'payment_error' });

      // Notificaciones enviadas
      const emailsSent = await this.db
        .collection('notificationHistory')
        .countDocuments({ ...dateFilter, notificationType: 'email', status: 'success' });

      const whatsappSent = await this.db
        .collection('notificationHistory')
        .countDocuments({ ...dateFilter, notificationType: 'whatsapp', status: 'success' });

      // Códigos generados
      const codesGenerated = await this.db
        .collection('accessCodeHistory')
        .countDocuments(dateFilter);

      const totalTransactions = successfulPayments + failedPayments;
      const successRate = totalTransactions > 0 
        ? (successfulPayments / totalTransactions) * 100 
        : 0;

      return {
        period: { startDate, endDate },
        payments: {
          successful: successfulPayments,
          failed: failedPayments,
          total: totalTransactions,
          successRate: successRate.toFixed(2) + '%',
        },
        notifications: {
          emails: emailsSent,
          whatsapp: whatsappSent,
          total: emailsSent + whatsappSent,
        },
        accessCodes: {
          generated: codesGenerated,
        },
      };
    } catch (error) {
      logger.error('Error retrieving efficiency stats', { error: error.message });
      throw error;
    }
  }
}

module.exports = { logger, LogHistoryService };

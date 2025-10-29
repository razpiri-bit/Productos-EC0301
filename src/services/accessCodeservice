/**
 * SERVICIO DE CÓDIGOS DE ACCESO
 * 
 * Generación y gestión de códigos de acceso únicos
 * Características:
 * - Códigos alfanuméricos seguros
 * - Validación de unicidad
 * - Expiración automática
 * - Trazabilidad completa
 * 
 * @version 1.0.0
 * @author Roberto Azpiri García
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

class AccessCodeService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generar código de acceso único
   */
  generateCode(length = 12) {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres ambiguos
    let code = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, characters.length);
      code += characters[randomIndex];
    }

    // Agregar guiones para legibilidad: XXXX-XXXX-XXXX
    if (length === 12) {
      code = code.match(/.{1,4}/g).join('-');
    }

    return code;
  }

  /**
   * Verificar unicidad del código
   */
  async isCodeUnique(code) {
    try {
      if (!this.db) {
        return true; // Si no hay DB, asumir único
      }

      const existing = await this.db
        .collection('accessCodes')
        .findOne({ code });

      return !existing;
    } catch (error) {
      logger.error('Error checking code uniqueness', {
        code,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Crear código de acceso único con reintentos
   */
  async createUniqueCode(maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const code = this.generateCode();
      const isUnique = await this.isCodeUnique(code);

      if (isUnique) {
        logger.info('Unique access code generated', {
          code,
          attempts: attempt,
        });
        return code;
      }

      logger.warn('Code collision detected', {
        code,
        attempt,
      });
    }

    throw {
      code: 'CODE_GENERATION_ERROR',
      message: 'No se pudo generar un código único después de varios intentos',
    };
  }

  /**
   * Guardar código de acceso en base de datos
   */
  async saveAccessCode(data) {
    const {
      code,
      userId,
      email,
      productId,
      productName,
      paymentId,
      amount,
      currency,
      expiresAt = null,
      metadata = {},
    } = data;

    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const accessCodeDoc = {
        code,
        userId,
        email,
        productId,
        productName,
        paymentId,
        amount,
        currency,
        status: 'active',
        usedAt: null,
        createdAt: new Date(),
        expiresAt: expiresAt || this.calculateExpiration(),
        metadata,
      };

      const result = await this.db
        .collection('accessCodes')
        .insertOne(accessCodeDoc);

      logger.info('Access code saved', {
        code,
        email,
        productName,
        insertedId: result.insertedId,
      });

      return {
        ...accessCodeDoc,
        _id: result.insertedId,
      };
    } catch (error) {
      logger.error('Error saving access code', {
        code,
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calcular fecha de expiración (90 días por defecto)
   */
  calculateExpiration(days = 90) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);
    return expirationDate;
  }

  /**
   * Validar código de acceso
   */
  async validateCode(code, email = null) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const query = { code };
      if (email) {
        query.email = email;
      }

      const accessCode = await this.db
        .collection('accessCodes')
        .findOne(query);

      if (!accessCode) {
        return {
          valid: false,
          reason: 'CODE_NOT_FOUND',
          message: 'Código no encontrado',
        };
      }

      // Verificar si está usado
      if (accessCode.usedAt) {
        return {
          valid: false,
          reason: 'CODE_ALREADY_USED',
          message: 'Este código ya fue utilizado',
          usedAt: accessCode.usedAt,
        };
      }

      // Verificar expiración
      if (accessCode.expiresAt && new Date() > new Date(accessCode.expiresAt)) {
        return {
          valid: false,
          reason: 'CODE_EXPIRED',
          message: 'Este código ha expirado',
          expiresAt: accessCode.expiresAt,
        };
      }

      // Verificar estado
      if (accessCode.status !== 'active') {
        return {
          valid: false,
          reason: 'CODE_INACTIVE',
          message: 'Este código está inactivo',
          status: accessCode.status,
        };
      }

      logger.info('Access code validated', {
        code,
        email: accessCode.email,
      });

      return {
        valid: true,
        accessCode,
      };
    } catch (error) {
      logger.error('Error validating code', {
        code,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Marcar código como usado
   */
  async markCodeAsUsed(code) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const result = await this.db.collection('accessCodes').updateOne(
        { code },
        {
          $set: {
            usedAt: new Date(),
            status: 'used',
          },
        }
      );

      if (result.modifiedCount === 0) {
        throw new Error('Código no encontrado o ya fue usado');
      }

      logger.info('Access code marked as used', { code });

      return {
        success: true,
        code,
        usedAt: new Date(),
      };
    } catch (error) {
      logger.error('Error marking code as used', {
        code,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtener información del código
   */
  async getCodeInfo(code) {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const accessCode = await this.db
        .collection('accessCodes')
        .findOne({ code });

      if (!accessCode) {
        return null;
      }

      return {
        code: accessCode.code,
        email: accessCode.email,
        productName: accessCode.productName,
        status: accessCode.status,
        createdAt: accessCode.createdAt,
        expiresAt: accessCode.expiresAt,
        usedAt: accessCode.usedAt,
        isValid:
          accessCode.status === 'active' &&
          !accessCode.usedAt &&
          new Date() < new Date(accessCode.expiresAt),
      };
    } catch (error) {
      logger.error('Error getting code info', {
        code,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Limpiar códigos expirados (tarea periódica)
   */
  async cleanExpiredCodes() {
    try {
      if (!this.db) {
        throw new Error('Database not connected');
      }

      const result = await this.db.collection('accessCodes').updateMany(
        {
          expiresAt: { $lt: new Date() },
          status: 'active',
        },
        {
          $set: { status: 'expired' },
        }
      );

      logger.info('Expired codes cleaned', {
        count: result.modifiedCount,
      });

      return {
        expiredCount: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Error cleaning expired codes', {
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = AccessCodeService;


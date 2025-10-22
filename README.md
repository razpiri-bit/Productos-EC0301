# 🎓 SkillsCert EC0301 - Sistema de Pago Automatizado

## 🚀 Sistema Completo con Email y WhatsApp

---

## 📦 ARCHIVOS INCLUIDOS

### ✅ Archivos Corregidos:
1. **login.html** - Login con redirección correcta
2. **checkout-mejorado.html** - Checkout con opciones Email/WhatsApp
3. **success.html** - Página de confirmación
4. **server.js** - Servidor principal con endpoints
5. **webhook-whatsapp-email.js** - Webhook con envío dual
6. **.env.example** - Variables de entorno
7. **GUIA-IMPLEMENTACION.md** - Guía paso a paso completa

---

## ⚡ INICIO RÁPIDO

### 1. Clonar y Configurar
```bash
# Instalar dependencias
npm install express stripe nodemailer twilio dotenv

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

### 2. Configurar Servicios

**Stripe:** https://stripe.com
- Obtén tus API Keys
- Configura Webhook: https://tu-dominio.com/webhook

**Gmail:**
- Activa verificación 2 pasos
- Genera contraseña de app

**Twilio:** https://twilio.com/try-twilio
- Obtén Account SID y Auth Token
- Activa WhatsApp Sandbox

### 3. Actualizar Archivos

Reemplaza en tu proyecto:
```
public/login.html → login.html
public/checkout.html → checkout-mejorado.html
public/success.html → success.html (nuevo)
server.js → server.js (actualizado)
webhook.js → webhook-whatsapp-email.js (nuevo)
```

### 4. Subir a GitHub y Render

```bash
git add .
git commit -m "feat: Sistema con WhatsApp/Email"
git push origin main
```

En Render:
- Agregar variables de entorno del .env
- Comando: `node server.js`

---

## 🎯 CARACTERÍSTICAS

### ✅ Implementado:
- [x] Checkout con opciones de entrega
- [x] Pago seguro con Stripe
- [x] Envío automático por Email
- [x] Envío automático por WhatsApp
- [x] Generación de códigos únicos
- [x] Login corregido
- [x] Página de éxito

### 🔜 Siguiente Fase:
- [ ] Base de datos (MongoDB/PostgreSQL)
- [ ] Panel de administración
- [ ] Gestión de usuarios
- [ ] Expiración automática de códigos

---

## 🧪 PROBAR

### Endpoint de Prueba:
```bash
# Solo Email
curl "https://tu-dominio.com/test-envio?email=tu@email.com&nombre=Test&metodo=email"

# Solo WhatsApp
curl "https://tu-dominio.com/test-envio?email=tu@email.com&telefono=5512345678&nombre=Test&metodo=whatsapp"

# Ambos
curl "https://tu-dominio.com/test-envio?email=tu@email.com&telefono=5512345678&nombre=Test&metodo=both"
```

### Tarjeta de Prueba Stripe:
```
Número: 4242 4242 4242 4242
Fecha: 12/34
CVC: 123
```

---

## 📋 CORRECCIÓN PRINCIPAL

### ❌ ANTES:
```javascript
// login.html - línea 115
window.location.href = '/app/index.html'; // Ruta incorrecta
```

### ✅ AHORA:
```javascript
// login.html - línea 115
window.location.href = '/Carta%20descriptiva%20ec0301%20pro.html'; // ✅ Correcto
```

---

## 🔄 FLUJO COMPLETO

```
1. Usuario → /checkout.html
2. Completa datos + Elige método (Email/WhatsApp/Ambos)
3. Paga con Stripe → /success.html
4. Webhook recibe pago
5. Genera código único
6. Envía código por método elegido
7. Usuario recibe código
8. Usuario → /login.html
9. Ingresa email + código
10. Validación exitosa
11. Redirige → /Carta descriptiva ec0301 pro.html ✅
```

---

## 📁 ESTRUCTURA ESPERADA

```
tu-proyecto/
├── public/
│   ├── index.html
│   ├── checkout.html              ← Reemplazar
│   ├── login.html                 ← Reemplazar
│   ├── success.html               ← Nuevo
│   └── Carta descriptiva ec0301 pro.html
├── server.js                      ← Reemplazar
├── webhook.js                     ← Nuevo
├── .env                           ← Crear (no subir a Git)
├── .env.example                   ← Subir a Git
└── package.json
```

---

## ⚙️ VARIABLES DE ENTORNO NECESARIAS

```env
DOMAIN=https://tu-dominio.com
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
EMAIL_USER=tu@email.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
PORT=3000
```

---

## 🐛 PROBLEMAS COMUNES

### Email no llega
- ✅ Verificar contraseña de app Gmail
- ✅ Revisar logs en Render

### WhatsApp no llega
- ✅ Activar Sandbox: enviar `join [codigo]` a +14155238886
- ✅ Verificar credenciales Twilio

### Login no redirige
- ✅ Verificar nombre exacto del archivo HTML
- ✅ Limpiar caché (Ctrl+Shift+R)

---

## 📞 SOPORTE

**Documentación completa:** Ver `GUIA-IMPLEMENTACION.md`

**Logs:**
- Render: Dashboard > Logs
- Stripe: Dashboard > Webhooks > Events
- Twilio: Console > Logs

---

## 🎉 RESULTADO

Sistema completamente funcional:
- ✅ Pago automatizado
- ✅ Envío dual (Email + WhatsApp)
- ✅ Login corregido
- ✅ Acceso inmediato a plataforma

**¡Todo listo para producción!** 🚀

---

**Desarrollado con ❤️ para SkillsCert**  
**Versión: 1.0.0**  
**Fecha: Octubre 2025**

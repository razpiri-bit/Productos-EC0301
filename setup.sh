#!/bin/bash

# ========================================
# SCRIPT DE CONFIGURACIÓN RÁPIDA
# SkillsCert Payment System
# ========================================

echo "╔═══════════════════════════════════════════╗"
echo "║   SkillsCert Payment System Setup        ║"
echo "║   Configuración Automatizada v1.0         ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Verificar Node.js
print_info "Verificando Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_success "Node.js encontrado: $NODE_VERSION"
else
    print_error "Node.js no está instalado. Por favor instala Node.js >= 18.0.0"
    exit 1
fi

# Verificar npm
print_info "Verificando npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    print_success "npm encontrado: $NPM_VERSION"
else
    print_error "npm no está instalado"
    exit 1
fi

# Instalar dependencias
print_info "Instalando dependencias..."
npm install
if [ $? -eq 0 ]; then
    print_success "Dependencias instaladas correctamente"
else
    print_error "Error al instalar dependencias"
    exit 1
fi

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    print_info "Creando archivo .env..."
    cp .env.example .env
    print_success "Archivo .env creado desde .env.example"
    print_warning "IMPORTANTE: Debes editar el archivo .env con tus credenciales"
else
    print_info "Archivo .env ya existe"
fi

# Crear directorio de logs
if [ ! -d "logs" ]; then
    print_info "Creando directorio de logs..."
    mkdir -p logs
    print_success "Directorio logs creado"
fi

# Verificar MongoDB
print_info "Verificando conexión a MongoDB..."
print_warning "Asegúrate de tener MongoDB corriendo o una URI de MongoDB Atlas configurada en .env"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   Configuración Completada                ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
print_info "Próximos pasos:"
echo ""
echo "1. Editar .env con tus credenciales:"
echo "   - STRIPE_SECRET_KEY"
echo "   - STRIPE_PRICE_ID_999"
echo "   - POSTMARK_SERVER_TOKEN"
echo "   - WHATSAPP_ACCESS_TOKEN"
echo "   - MONGODB_URI"
echo ""
echo "2. Obtener price IDs válidos de Stripe:"
echo "   npm start"
echo "   curl http://localhost:3000/api/prices"
echo ""
echo "3. Configurar webhooks en Stripe:"
echo "   https://dashboard.stripe.com/webhooks"
echo "   Endpoint: https://tu-dominio.com/webhook/stripe"
echo ""
echo "4. Iniciar servidor:"
echo "   npm run dev  (desarrollo)"
echo "   npm start    (producción)"
echo ""
print_success "¡Todo listo para comenzar!"

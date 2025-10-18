// auth.js - Script para proteger páginas

(function() {
    // Busca la "llave" (token) que guardamos después del login exitoso
    const token = sessionStorage.getItem('skillscert_access_token');

    // Verifica si el token existe y si parece válido (simplificado)
    if (!token || !token.startsWith('VALID_SESSION_')) {
        // Si no hay token o no es válido, redirige al usuario a la página de login
        console.log('Acceso no autorizado, redirigiendo a login...');
        // Asegúrate de que login.html no incluya este script para evitar un bucle infinito
        if (window.location.pathname !== '/login.html') {
             window.location.href = '/login.html';
        }
    } else {
        // Si hay un token válido, el usuario puede ver la página
        console.log('Acceso autorizado.');
    }
})(); // Esta función se ejecuta automáticamente al cargar la página
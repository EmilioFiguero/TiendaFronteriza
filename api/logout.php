<?php
declare(strict_types=1);

/**
 * POST api/logout.php
 * Cabecera: X-CSRF-Token. Destruye la sesión y borra la cookie.
 */
require_once __DIR__ . '/../includes/api.php';

solo_metodo('POST');
verificar_origen();

try {
    iniciar_sesion_segura();
    exigir_csrf();
    cerrar_sesion_completa();

    responder_json(['ok' => true, 'mensaje' => 'Sesión cerrada.']);
} catch (Throwable $e) {
    manejar_fallo($e);
}

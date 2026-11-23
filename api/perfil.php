<?php
declare(strict_types=1);

/**
 * GET api/perfil.php   (FUNCIÓN PROTEGIDA)
 * Devuelve los datos públicos del usuario. Sin sesión responde 401.
 */
require_once __DIR__ . '/../includes/api.php';

solo_metodo('GET');

try {
    iniciar_sesion_segura();
    $usuario = usuario_autenticado(obtener_conexion());
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    if ($usuario === null) {
        responder_error('no_autenticado', 'Debes iniciar sesión para ver esta información.', 401);
    }

    responder_json(['ok' => true, 'usuario' => $usuario]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

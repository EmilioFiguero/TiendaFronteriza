<?php
declare(strict_types=1);

/**
 * GET api/sesion.php
 * Dice si hay una sesión activa y devuelve los datos públicos del usuario.
 * También entrega el token CSRF que el frontend debe enviar en los POST.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/roles.php';

solo_metodo('GET');

try {
    iniciar_sesion_segura();
    $pdo = obtener_conexion();
    $usuario = usuario_autenticado($pdo);
    if ($usuario !== null) {
        // Solo sirve para mostrar el enlace al panel; los permisos reales se validan en api/admin/*.
        $usuario['es_admin'] = usuario_es_admin($pdo, (int) $usuario['id']);
    }

    // Si la sesión se cerró durante la comprobación (cuenta desactivada), se abre una limpia.
    iniciar_sesion_segura();
    $token = token_csrf();
    session_write_close();   // libera el bloqueo del archivo de sesión

    responder_json([
        'ok'          => true,
        'autenticado' => $usuario !== null,
        'usuario'     => $usuario,
        'csrf_token'  => $token,
    ]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

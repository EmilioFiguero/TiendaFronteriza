<?php
declare(strict_types=1);

/**
 * GET api/carrito.php   (FUNCIÓN PROTEGIDA: requiere sesión)
 * Devuelve el carrito del usuario autenticado, con precio y stock actuales de MariaDB.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/carrito.php';

solo_metodo('GET');

try {
    iniciar_sesion_segura();
    $pdo = obtener_conexion();
    $usuario = carrito_exigir_usuario($pdo);

    $carritoId = carrito_id_usuario($pdo, $usuario['id'], false);
    $carrito = carrito_leer($pdo, $carritoId);

    responder_json([
        'ok'      => true,
        'usuario' => ['id' => $usuario['id']],
        'carrito' => $carrito,
    ]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

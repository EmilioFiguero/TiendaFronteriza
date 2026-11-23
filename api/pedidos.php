<?php
declare(strict_types=1);

/**
 * GET api/pedidos.php?pagina=1   (FUNCIÓN PROTEGIDA: requiere sesión)
 * Historial de pedidos del usuario autenticado. El usuario sale SOLO de la sesión:
 * no existe ningún parámetro para pedir los pedidos de otra cuenta.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/pedidos.php';

solo_metodo('GET');

try {
    iniciar_sesion_segura();
    $pdo = obtener_conexion();
    $usuario = carrito_exigir_usuario($pdo);

    $pagina = 1;
    if (isset($_GET['pagina'])) {
        $texto = is_string($_GET['pagina']) ? $_GET['pagina'] : '';
        if (preg_match('/^[0-9]{1,6}$/', $texto) !== 1) {
            responder_error('validacion', 'Número de página no válido.', 422);
        }
        $pagina = (int) $texto;
    }

    responder_json(['ok' => true] + pedido_listar($pdo, $usuario['id'], $pagina));
} catch (Throwable $e) {
    manejar_fallo($e);
}

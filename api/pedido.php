<?php
declare(strict_types=1);

/**
 * GET api/pedido.php?numero=TF-123456   o   ?clave=<uuid>   (FUNCIÓN PROTEGIDA: requiere sesión)
 * Detalle de UN pedido, solo si pertenece al usuario de la sesión. Si el pedido no existe o es de
 * otra cuenta la respuesta es la misma (404): no se revela si el número existe.
 * "clave" sirve para recuperar una compra cuya respuesta se perdió.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/pedidos.php';

solo_metodo('GET');

try {
    iniciar_sesion_segura();
    $pdo = obtener_conexion();
    $usuario = carrito_exigir_usuario($pdo);

    $numero = isset($_GET['numero']) && is_string($_GET['numero']) ? $_GET['numero'] : null;
    $clave  = isset($_GET['clave']) && is_string($_GET['clave']) ? $_GET['clave'] : null;
    if (($numero === null) === ($clave === null)) {
        responder_error('validacion', 'Indica el número de pedido o la clave de la operación.', 422);
    }

    if ($numero !== null) {
        if (!pedido_numero_valido($numero)) {
            responder_error('validacion', 'Número de pedido no válido.', 422);
        }
        $pedido = pedido_buscar($pdo, $usuario['id'], 'numero_pedido', $numero);
    } else {
        if (!pedido_clave_valida($clave)) {
            responder_error('validacion', 'Clave de operación no válida.', 422);
        }
        $pedido = pedido_buscar($pdo, $usuario['id'], 'clave_idempotencia', (string) $clave);
    }

    if ($pedido === null) {
        responder_error('pedido_no_encontrado', 'No encontramos ese pedido en tu cuenta.', 404);
    }
    responder_json(['ok' => true, 'pedido' => $pedido]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

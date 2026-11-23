<?php
declare(strict_types=1);

/**
 * GET api/admin/pedido.php?numero=TF-000123   (solo administradores)
 * Detalle: cliente, envío, productos, importes originales, historial de estados, movimientos de inventario
 * del pedido y qué cambios de estado son posibles. Solo lectura.
 */
require_once __DIR__ . '/../../includes/admin_pedidos.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $numero = admin_texto_get('numero', 20);
    if (!pedido_numero_valido($numero)) {
        responder_error('validacion', 'Número de pedido no válido (formato TF-000000).', 422);
    }
    $pedido = pedido_admin_detalle($pdo, $numero);
    if ($pedido === null) {
        responder_error('no_encontrado', 'No encontramos ese pedido.', 404);
    }
    responder_json(['ok' => true, 'pedido' => $pedido]);
});

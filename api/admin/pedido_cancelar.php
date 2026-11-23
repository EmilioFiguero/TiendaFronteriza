<?php
declare(strict_types=1);

/**
 * POST api/admin/pedido_cancelar.php   (solo administradores; exige token CSRF)
 * JSON: { numero_pedido, estado_esperado, motivo (3–200 caracteres, obligatorio) }
 * Solo se cancelan pedidos pendiente, pagado o preparado. En UNA transacción: repone las existencias de cada línea,
 * registra un movimiento «cancelacion» por producto, cambia el estado, anota el historial y la auditoría.
 * Los importes del pedido no se modifican. 409 si ya está cancelado, ya salió (enviado/entregado) o cambió de estado.
 */
require_once __DIR__ . '/../../includes/admin_pedidos.php';
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $errores = [];
    $numero = isset($j['numero_pedido']) && is_string($j['numero_pedido']) ? $j['numero_pedido'] : '';
    if (!pedido_numero_valido($numero)) {
        $errores['numero_pedido'] = 'Número de pedido no válido.';
    }
    $esperado = isset($j['estado_esperado']) && is_string($j['estado_esperado']) ? $j['estado_esperado'] : '';
    if (!in_array($esperado, ADMIN_ESTADOS_TODOS, true)) {
        $errores['estado_esperado'] = 'Falta el estado que viste en pantalla.';
    }
    $motivo = prod_texto($j['motivo'] ?? null);
    if ($motivo === null || largo_texto($motivo) < 3 || largo_texto($motivo) > 200) {
        $errores['motivo'] = 'El motivo de la cancelación es obligatorio (3 a 200 caracteres).';
    }
    if ($errores !== []) {
        pedidos_admin_errores_422($errores);
    }

    $r = pedido_admin_cancelar($pdo, $admin, $numero, $esperado, $motivo);
    responder_json([
        'ok' => true,
        'mensaje' => 'Pedido ' . $numero . ' cancelado. Se repusieron ' . $r['unidades_repuestas'] . ' unidad(es) al inventario.',
        'unidades_repuestas' => $r['unidades_repuestas'],
        'pedido' => pedido_admin_detalle($pdo, $numero),
    ]);
});

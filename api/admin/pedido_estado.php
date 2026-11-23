<?php
declare(strict_types=1);

/**
 * POST api/admin/pedido_estado.php   (solo administradores; exige token CSRF)
 * JSON: { numero_pedido, estado_esperado, estado_nuevo: "pagado"|"preparado"|"enviado"|"entregado", motivo? (hasta 200) }
 * Transiciones: pendiente→pagado, pagado→preparado, preparado→enviado, enviado→entregado.
 * Para cancelar se usa pedido_cancelar.php (repone existencias). 409 si el estado ya cambió o la transición no es válida.
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
    $nuevo = isset($j['estado_nuevo']) && is_string($j['estado_nuevo']) ? $j['estado_nuevo'] : '';
    if ($nuevo === 'cancelado') {
        $errores['estado_nuevo'] = 'Para cancelar usa «Cancelar pedido»: así se reponen las existencias.';
    } elseif (!in_array($nuevo, ADMIN_ESTADOS_TODOS, true)) {
        $errores['estado_nuevo'] = 'Estado no válido.';
    }
    $motivo = null;
    if (isset($j['motivo']) && $j['motivo'] !== null && $j['motivo'] !== '') {
        $motivo = prod_texto($j['motivo']);
        if ($motivo === null || largo_texto($motivo) > 200) {
            $errores['motivo'] = 'El motivo no puede superar 200 caracteres.';
        }
    }
    if ($errores !== []) {
        pedidos_admin_errores_422($errores);
    }

    $r = pedido_admin_cambiar_estado($pdo, $admin, $numero, $esperado, $nuevo, $motivo);
    $detalle = pedido_admin_detalle($pdo, $numero);
    responder_json(['ok' => true, 'mensaje' => 'Pedido ' . $numero . ': ' . $r['anterior'] . ' → ' . $r['nuevo'] . '.', 'pedido' => $detalle]);
});

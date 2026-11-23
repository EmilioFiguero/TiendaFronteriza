<?php
declare(strict_types=1);

/**
 * POST api/admin/cupon_simular.php  (administradores; CSRF)
 * JSON: { id, subtotal }   -> calcula cuánto descontaría el cupón sobre ese subtotal. NO se guarda nada ni se aplica a ninguna compra.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $id = admin_entero($j['id'] ?? null);
    $sub = cupon_monto($j['subtotal'] ?? null, false);
    if ($id === null || $sub === null) {
        responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => ['subtotal' => 'Escribe un subtotal mayor a 0 (máximo dos decimales).']]);
    }
    $c = cupon_por_id($pdo, $id);
    if ($c === null) {
        responder_error('no_encontrado', 'No encontramos ese cupón.', 404);
    }
    $r = cupon_calcular($c, pedido_centavos($sub), cupon_ahora($pdo));
    responder_json(['ok' => true, 'simulacion' => true, 'codigo' => $c['codigo'], 'valido' => $r['valido'], 'motivo' => $r['motivo'],
        'subtotal' => pedido_pesos(pedido_centavos($sub)), 'descuento' => pedido_pesos($r['descuento_cent']),
        'subtotal_con_descuento' => pedido_pesos($r['subtotal_con_descuento_cent']),
        'aviso' => 'Simulación: no se aplicó a ninguna compra ni se guardó nada.']);
});

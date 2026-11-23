<?php
declare(strict_types=1);

/**
 * POST api/admin/oferta_guardar.php  (administradores; CSRF)
 * JSON: { producto_id, precio_anterior: "999.00" | null }   null = quitar la oferta.
 * Solo escribe productos.precio_anterior y productos.en_oferta. NO cambia productos.precio (precio efectivo de venta)
 * ni pedidos históricos. precio_anterior debe ser mayor al precio actual.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $id = admin_entero($j['producto_id'] ?? null);
    if ($id === null || !array_key_exists('precio_anterior', $j)) {
        responder_error('validacion', 'Revisa los datos enviados.', 422);
    }
    $ant = null;
    if ($j['precio_anterior'] !== null) {
        $ant = cupon_monto($j['precio_anterior'], false);
        if ($ant === null) {
            responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => ['precio_anterior' => 'Precio anterior no válido (mayor a 0, máximo dos decimales).']]);
        }
    }
    responder_json(['ok' => true, 'producto' => oferta_guardar($pdo, $admin, $id, $ant)]);
});

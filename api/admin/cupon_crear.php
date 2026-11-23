<?php
declare(strict_types=1);

/**
 * POST api/admin/cupon_crear.php  (administradores; CSRF)
 * JSON: { codigo, descripcion, tipo: porcentaje|monto_fijo, valor, compra_minima?, tope_descuento? (solo porcentaje),
 *         usos_maximos?, inicia? AAAA-MM-DD, termina? AAAA-MM-DD, activo? }
 * No modifica pedidos, carrito ni checkout.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    [$d, $e] = cupon_validar(leer_json(), true);
    if ($e !== []) {
        responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => $e]);
    }
    responder_json(['ok' => true, 'cupon' => cupon_crear($pdo, $admin, $d)], 201);
});

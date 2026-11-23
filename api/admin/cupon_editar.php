<?php
declare(strict_types=1);

/**
 * POST api/admin/cupon_editar.php  (administradores; CSRF)
 * JSON: { id, descripcion, tipo, valor, compra_minima?, tope_descuento?, usos_maximos?, inicia?, termina?, activo? }
 * El código no se puede cambiar.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $id = admin_entero($j['id'] ?? null);
    if ($id === null) {
        responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => ['id' => 'Cupón no válido.']]);
    }
    [$d, $e] = cupon_validar($j, false);
    if ($e !== []) {
        responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => $e]);
    }
    responder_json(['ok' => true, 'cupon' => cupon_editar($pdo, $admin, $id, $d)]);
});

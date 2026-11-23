<?php
declare(strict_types=1);

/** POST api/admin/cupon_estado.php  (administradores; CSRF)  JSON: { id, activo: true|false } */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $id = admin_entero($j['id'] ?? null);
    if ($id === null || !isset($j['activo']) || !is_bool($j['activo'])) {
        responder_error('validacion', 'Revisa los datos enviados.', 422);
    }
    responder_json(['ok' => true, 'cupon' => cupon_cambiar_estado($pdo, $admin, $id, $j['activo'])]);
});

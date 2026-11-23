<?php
declare(strict_types=1);

/**
 * POST api/admin/producto_estado.php   (solo administradores; exige token CSRF)
 * JSON: { id, activo: true|false }. Desactivar oculta el producto del catálogo público y de las compras nuevas,
 * pero conserva todo el historial. No existe ninguna operación para BORRAR productos.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $json = leer_json();
    $id = admin_entero($json['id'] ?? null);
    if ($id === null || !isset($json['activo']) || !is_bool($json['activo'])) {
        responder_error('validacion', 'Datos no válidos: indica id y activo (verdadero/falso).', 422);
    }
    $r = producto_cambiar_estado($pdo, $admin, $id, $json['activo']);
    responder_json(['ok' => true, 'cambiado' => $r['cambiado'], 'activo' => $r['activo'],
        'mensaje' => $r['cambiado'] ? ($r['activo'] ? 'Producto activado.' : 'Producto desactivado.') : 'El producto ya estaba en ese estado.']);
});

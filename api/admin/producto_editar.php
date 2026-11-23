<?php
declare(strict_types=1);

/**
 * POST api/admin/producto_editar.php   (solo administradores; exige token CSRF)
 * JSON: { id, nombre, descripcion, precio, categoria_id, marca_id, es_destacado?, en_oferta? }
 * No cambia el código (SKU), las existencias ni los pedidos anteriores. Sin cambios reales -> cambiado:false.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $json = leer_json();
    $id = admin_entero($json['id'] ?? null);
    if ($id === null) {
        responder_error('validacion', 'Identificador de producto no válido.', 422);
    }
    [$datos, $errores] = producto_validar($pdo, $json, false);
    if ($errores !== []) {
        producto_errores_422($errores);
    }
    $r = producto_actualizar($pdo, $admin, $id, $datos);
    responder_json(['ok' => true, 'cambiado' => $r['cambiado'], 'campos' => $r['campos'],
        'mensaje' => $r['cambiado'] ? 'Producto actualizado.' : 'No hubo cambios que guardar.']);
});

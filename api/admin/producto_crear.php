<?php
declare(strict_types=1);

/**
 * POST api/admin/producto_crear.php   (solo administradores; exige token CSRF)
 * JSON: { nombre, descripcion, precio, categoria_id, marca_id, codigo? (SKU, se genera pN si falta),
 *         stock? (existencias iniciales, 0 por omisión), es_destacado?, en_oferta?, activo? (true por omisión) }
 * Con existencias iniciales > 0 se registra un movimiento 'inicial'. La imagen se sube después con producto_imagen.php.
 * 201 {ok, id, codigo}. 422 con "errores" por campo.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    [$datos, $errores] = producto_validar($pdo, leer_json(), true);
    if ($errores !== []) {
        producto_errores_422($errores);
    }
    $r = producto_crear($pdo, $admin, $datos);
    responder_json(['ok' => true, 'id' => $r['id'], 'codigo' => $r['codigo'], 'mensaje' => 'Producto creado.'], 201);
});

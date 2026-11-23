<?php
declare(strict_types=1);

/**
 * GET api/admin/producto.php?id=3   (solo administradores)
 * Un producto completo (descripción, imágenes, banderas) + categorías y marcas para el formulario.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $id = admin_entero(isset($_GET['id']) && is_string($_GET['id']) ? $_GET['id'] : null);
    if ($id === null) {
        responder_error('validacion', 'Identificador de producto no válido.', 422);
    }
    $p = producto_detalle($pdo, $id);
    if ($p === null) {
        responder_error('no_encontrado', 'No encontramos ese producto.', 404);
    }
    responder_json(['ok' => true, 'producto' => $p] + prod_catalogos($pdo));
});

<?php
declare(strict_types=1);

/**
 * POST api/admin/producto_imagen_quitar.php   (solo administradores; exige token CSRF)
 * JSON: { imagen_id }. Solo imágenes subidas desde el panel; las originales de la tienda no se pueden quitar (409).
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $id = admin_entero(leer_json()['imagen_id'] ?? null);
    if ($id === null) {
        responder_error('validacion', 'Identificador de imagen no válido.', 422);
    }
    producto_quitar_imagen($pdo, $admin, $id);
    responder_json(['ok' => true, 'mensaje' => 'Imagen quitada.']);
});

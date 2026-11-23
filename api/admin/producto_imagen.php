<?php
declare(strict_types=1);

/**
 * POST api/admin/producto_imagen.php   (solo administradores; exige token CSRF)
 * multipart/form-data: producto_id (entero) + imagen (archivo JPG, PNG o WebP, máx. 2 MB, 100–6000 px por lado).
 * El tipo se comprueba por el CONTENIDO del archivo; se guarda con nombre aleatorio en
 * assets/images/products/uploads/ (carpeta donde el servidor no ejecuta scripts). La imagen pasa a ser la principal.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $id = admin_entero(isset($_POST['producto_id']) && is_string($_POST['producto_id']) ? $_POST['producto_id'] : null);
    if ($id === null) {
        responder_error('validacion', 'Identificador de producto no válido.', 422);
    }
    if (!isset($_FILES['imagen']) || !is_array($_FILES['imagen']) || is_array($_FILES['imagen']['error'] ?? null)) {
        responder_error('validacion', 'Selecciona una imagen JPG, PNG o WebP.', 422);
    }
    $r = producto_subir_imagen($pdo, $admin, $id, $_FILES['imagen']);
    responder_json(['ok' => true, 'imagen_id' => $r['imagen_id'], 'url' => $r['url'], 'mensaje' => 'Imagen agregada como principal.'], 201);
});

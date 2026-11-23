<?php
declare(strict_types=1);

/**
 * GET api/admin/cliente.php?id=12   (solo administradores)
 * Datos mínimos de una cuenta y sus últimos pedidos (folio, estado, importe, fecha, método de pago).
 * No incluye contraseñas, hashes ni direcciones.
 */
require_once __DIR__ . '/../../includes/admin_panel.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $id = admin_entero(isset($_GET['id']) && is_string($_GET['id']) ? $_GET['id'] : null);
    if ($id === null) {
        responder_error('validacion', 'Identificador de cliente no válido.', 422);
    }
    $cliente = cliente_detalle($pdo, $id);
    if ($cliente === null) {
        responder_error('no_encontrado', 'No encontramos esa cuenta.', 404);
    }
    responder_json(['ok' => true, 'cliente' => $cliente]);
});

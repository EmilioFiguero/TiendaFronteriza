<?php
declare(strict_types=1);

/**
 * GET api/admin/inventario_movimientos.php?producto_id=&tipo=inicial|venta|entrada|salida|ajuste|cancelacion&pagina=1
 * (solo administradores). Historial de movimientos: producto, cuánto cambió, existencias antes/después,
 * motivo, quién lo hizo, pedido (si fue una venta) y cuándo.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $tipo = admin_opcion_get('tipo', INV_TIPOS);
    $pid = admin_id_get('producto_id');
    responder_json(['ok' => true] + movimientos_listar($pdo, $pid, $tipo, admin_pagina()));
});

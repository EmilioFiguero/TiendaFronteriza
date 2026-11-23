<?php
declare(strict_types=1);

/**
 * GET api/admin/inventario.php?q=&stock=bajo|agotado|ok&estado=activo|inactivo&categoria=&marca=&orden=stock|id|nombre&pagina=1
 * (solo administradores). Existencias actuales de todos los productos. Es la misma lista que productos.php
 * pensada para la sección Inventario (por omisión ordena de menos a más existencias).
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $q      = admin_texto_get('q');
    $estado = admin_opcion_get('estado', ['activo', 'inactivo']);
    $stock  = admin_opcion_get('stock', ['bajo', 'agotado', 'ok']);
    $orden  = admin_opcion_get('orden', ['id', 'stock', 'nombre']);
    responder_json(['ok' => true] + productos_listar($pdo, $q, $estado, null, null, $stock, $orden === '' ? 'stock' : $orden, admin_pagina()));
});

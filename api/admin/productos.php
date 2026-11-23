<?php
declare(strict_types=1);

/**
 * GET api/admin/productos.php?q=&estado=activo|inactivo&categoria=<id>&marca=<id>&stock=bajo|agotado|ok&orden=id|stock|nombre|reciente&pagina=1
 * (solo administradores). Lista paginada de productos (también los inactivos) + categorías y marcas para los filtros.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $q      = admin_texto_get('q');
    $estado = admin_opcion_get('estado', ['activo', 'inactivo']);
    $stock  = admin_opcion_get('stock', ['bajo', 'agotado', 'ok']);
    $orden  = admin_opcion_get('orden', ['id', 'stock', 'nombre', 'reciente']);
    $cat = admin_id_get('categoria');
    $mar = admin_id_get('marca');
    responder_json(['ok' => true] + productos_listar($pdo, $q, $estado, $cat, $mar, $stock, $orden === '' ? 'id' : $orden, admin_pagina()) + prod_catalogos($pdo));
});

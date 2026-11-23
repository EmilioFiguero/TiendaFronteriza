<?php
declare(strict_types=1);

/**
 * GET api/admin/pedidos.php?q=&estado=&metodo=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&orden=recientes|antiguos|total_desc|total_asc&pagina=1
 * (solo administradores). Lista paginada de pedidos con conteos por estado. Solo lectura.
 */
require_once __DIR__ . '/../../includes/admin_pedidos.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $q      = admin_texto_get('q');
    $estado = admin_opcion_get('estado', ADMIN_ESTADOS_TODOS);
    $metodo = admin_opcion_get('metodo', pedido_metodos_pago());
    $orden  = admin_opcion_get('orden', PEDIDO_ORDENES);
    $desde  = admin_fecha_get('desde');
    $hasta  = admin_fecha_get('hasta');
    responder_json(['ok' => true] + pedidos_admin_listar($pdo, $q, $estado, $metodo, $desde, $hasta, $orden, admin_pagina()));
});

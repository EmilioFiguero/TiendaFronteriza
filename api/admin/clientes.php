<?php
declare(strict_types=1);

/**
 * GET api/admin/clientes.php?q=&estado=activo|inactivo&rol=cliente|admin|todos&pagina=1   (solo administradores)
 * Lista paginada de cuentas con su número de pedidos y lo comprado (ventas simuladas). Sin contraseñas ni hashes.
 */
require_once __DIR__ . '/../../includes/admin_panel.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $q      = admin_texto_get('q');
    $estado = admin_opcion_get('estado', ['activo', 'inactivo']);
    $rol    = admin_opcion_get('rol', ['cliente', 'admin', 'todos']);
    $pagina = admin_pagina();

    responder_json(['ok' => true] + clientes_listar($pdo, $q, $estado, $rol === '' ? 'cliente' : $rol, $pagina));
});

<?php
declare(strict_types=1);

/**
 * GET api/admin/cupones.php?q=&estado=vigente|programado|vencido|inactivo&pagina=1   (solo administradores)
 * Lista de cupones. FUNCIÓN ADMINISTRATIVA Y DE SIMULACIÓN: los cupones todavía no se aplican a compras.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $q = admin_texto_get('q');
    $estado = admin_opcion_get('estado', CUPON_ESTADOS);
    responder_json(['ok' => true, 'aplicable_a_compras' => false,
        'aviso' => 'Los cupones son una función administrativa y de simulación: todavía no se aplican a compras.'] + cupones_listar($pdo, $q, $estado, admin_pagina()));
});

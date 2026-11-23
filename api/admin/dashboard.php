<?php
declare(strict_types=1);

/**
 * GET api/admin/dashboard.php   (solo administradores)
 * Indicadores reales de MariaDB: productos, stock, clientes, pedidos por estado, ventas simuladas,
 * importes por cobrar y pedidos recientes. Los pedidos cancelados NO cuentan como ventas.
 */
require_once __DIR__ . '/../../includes/admin_panel.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    responder_json(['ok' => true, 'admin' => ['nombre' => $admin['nombre']], 'generado_ms' => time() * 1000] + admin_dashboard($pdo));
});

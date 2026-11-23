<?php
declare(strict_types=1);

/**
 * GET api/admin/reportes.php                                   -> catálogo de reportes
 * GET api/admin/reportes.php?reporte=<clave>&desde=&hasta=     -> un reporte (solo lectura, datos simulados)
 */
require_once __DIR__ . '/../../includes/admin_reportes.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $clave = admin_opcion_get('reporte', array_keys(REPORTES));
    if ($clave === '') {
        responder_json(['ok' => true, 'aviso' => REPORTE_AVISO, 'reportes' => array_map(static fn (string $k, string $t): array => ['clave' => $k, 'titulo' => $t], array_keys(REPORTES), REPORTES)]);
    }
    responder_json(['ok' => true, 'reporte' => reporte_generar($pdo, $clave, admin_fecha_get('desde'), admin_fecha_get('hasta'))]);
});

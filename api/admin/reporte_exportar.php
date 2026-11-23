<?php
declare(strict_types=1);

/**
 * GET api/admin/reporte_exportar.php?reporte=<clave>&desde=&hasta=  -> descarga CSV (UTF-8 con BOM). Queda en auditoría.
 */
require_once __DIR__ . '/../../includes/admin_reportes.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $clave = admin_opcion_get('reporte', array_keys(REPORTES));
    if ($clave === '') {
        responder_error('validacion', 'Falta el reporte a exportar.', 422);
    }
    $rep = reporte_generar($pdo, $clave, admin_fecha_get('desde'), admin_fecha_get('hasta'));
    admin_auditar($pdo, $admin['id'], 'reporte_exportado', 'reporte', $clave, $rep['periodo']['desde'] . ' a ' . $rep['periodo']['hasta'] . ' | filas=' . count($rep['filas']));
    $csv = reporte_csv($rep);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="reporte_' . $clave . '_' . $rep['periodo']['desde'] . '_' . $rep['periodo']['hasta'] . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Length: ' . strlen($csv));
    echo $csv;
    exit;
});

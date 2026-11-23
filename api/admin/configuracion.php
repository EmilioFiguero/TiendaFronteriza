<?php
declare(strict_types=1);

/**
 * GET  api/admin/configuracion.php  -> { ok, umbral_stock_bajo }
 * POST api/admin/configuracion.php  JSON { umbral_stock_bajo: 1..100 }  (exige token CSRF) -> guarda y audita.
 * El umbral define cuándo un producto cuenta como «stock bajo» en el resumen y en Inventario.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

$metodo = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
admin_endpoint($metodo === 'POST' ? 'POST' : 'GET', static function (PDO $pdo, array $admin): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
        $n = admin_entero(leer_json()['umbral_stock_bajo'] ?? null, 1, 100);
        if ($n === null) {
            responder_error('validacion', 'El umbral debe ser un entero de 1 a 100.', 422);
        }
        $r = configuracion_guardar_umbral($pdo, $admin, $n);
        responder_json(['ok' => true, 'cambiado' => $r['cambiado'], 'umbral_stock_bajo' => $r['umbral'],
            'mensaje' => $r['cambiado'] ? 'Umbral actualizado.' : 'El umbral ya tenía ese valor.']);
    }
    responder_json(['ok' => true, 'umbral_stock_bajo' => admin_umbral_stock($pdo)]);
});

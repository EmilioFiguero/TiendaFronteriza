<?php
declare(strict_types=1);

/**
 * POST api/admin/inventario_ajustar.php   (solo administradores; exige token CSRF)
 * JSON: { producto_id, tipo: "entrada"|"salida"|"ajuste", cantidad, stock_esperado, motivo (3–200 caracteres, obligatorio) }
 *   entrada: suma «cantidad» (1–100000).  salida: resta «cantidad» (no puede dejar existencias negativas).
 *   ajuste: fija las existencias en «cantidad» (0–100000).
 *   stock_esperado: las existencias que el administrador vio. Si ya cambiaron -> 409 existencias_cambiaron
 *   (protege contra solicitudes repetidas y contra ventas simultáneas).
 * Registra el movimiento y la auditoría en la misma transacción.
 */
require_once __DIR__ . '/../../includes/admin_catalogo.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $j = leer_json();
    $tipo = isset($j['tipo']) && is_string($j['tipo']) ? $j['tipo'] : '';
    $errores = [];

    $id = admin_entero($j['producto_id'] ?? null);
    if ($id === null) {
        $errores['producto_id'] = 'Producto no válido.';
    }
    if (!in_array($tipo, ['entrada', 'salida', 'ajuste'], true)) {
        $errores['tipo'] = 'Elige entrada, salida o ajuste.';
    }
    $cantidad = admin_entero($j['cantidad'] ?? null, $tipo === 'ajuste' ? 0 : 1, PROD_STOCK_MAX);
    if ($cantidad === null) {
        $errores['cantidad'] = $tipo === 'ajuste' ? 'Escribe las existencias finales (0 a ' . PROD_STOCK_MAX . ').' : 'Escribe una cantidad entera de 1 a ' . PROD_STOCK_MAX . '.';
    }
    $esperado = admin_entero($j['stock_esperado'] ?? null, 0, 2147483647);
    if ($esperado === null) {
        $errores['stock_esperado'] = 'Falta indicar las existencias que viste en pantalla.';
    }
    $motivo = prod_texto($j['motivo'] ?? null);
    if ($motivo === null || largo_texto($motivo) < 3 || largo_texto($motivo) > 200) {
        $errores['motivo'] = 'El motivo es obligatorio (3 a 200 caracteres).';
    }
    if ($errores !== []) {
        producto_errores_422($errores);
    }

    $r = inventario_ajustar($pdo, $admin, $id, $tipo, $cantidad, $esperado, $motivo);
    responder_json([
        'ok' => true, 'cambiado' => $r['cambiado'], 'stock' => $r['stock'], 'movimiento_id' => $r['movimiento_id'],
        'mensaje' => $r['cambiado'] ? 'Existencias actualizadas.' : 'Las existencias ya tenían ese valor; no se registró ningún movimiento.',
    ]);
});

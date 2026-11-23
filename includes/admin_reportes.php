<?php
declare(strict_types=1);

/**
 * Reportes administrativos (Fase 3.6.4). SOLO LECTURA: ningún reporte escribe en pedidos, productos ni inventario.
 *
 * Importante: todas las ventas y pagos de Tienda Fronteriza son SIMULACIONES académicas. Ningún reporte
 * presenta cifras como ingresos reales; cada uno lleva el aviso REPORTE_AVISO y los importes se rotulan «simulado».
 * Ventas simuladas = pedidos pagado, preparado, enviado o entregado. «Por cobrar (simulado)» = pendiente. «cancelado» no suma.
 * Privacidad: nunca se incluyen teléfonos ni direcciones; los clientes salen con nombre abreviado y correo enmascarado.
 */

require_once __DIR__ . '/admin_pedidos.php';
require_once __DIR__ . '/promociones.php';

const REPORTE_AVISO = 'Todas las ventas y pagos de Tienda Fronteriza son simulados (proyecto académico): estas cifras no son ingresos reales.';
const REPORTE_MAX_DIAS = 366;
const REPORTE_MAX_FILAS = 500;

const REPORTES = [
    'ventas_dia'        => 'Ventas simuladas por día',
    'ventas_estado'     => 'Pedidos por estado',
    'ventas_metodo'     => 'Ventas simuladas por método de pago',
    'productos_top'     => 'Productos más vendidos (simulado)',
    'ventas_categoria'  => 'Ventas simuladas por categoría',
    'ventas_marca'      => 'Ventas simuladas por marca',
    'inventario_bajo'   => 'Inventario bajo y agotado',
    'clientes_top'      => 'Clientes con más compras simuladas',
];

/* ===================== Utilidades ===================== */

/** Nombre abreviado: «Juan P.» (primer nombre + inicial del siguiente). */
function reporte_nombre_abreviado(string $nombre): string
{
    $partes = preg_split('/\s+/u', trim($nombre), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    if ($partes === []) {
        return '—';
    }
    $s = mb_substr($partes[0], 0, 20);
    if (count($partes) > 1) {
        $s .= ' ' . mb_strtoupper(mb_substr($partes[1], 0, 1)) . '.';
    }
    return $s;
}

/** Correo enmascarado: «j***@dominio.com». */
function reporte_correo_enmascarado(string $correo): string
{
    $pos = strrpos($correo, '@');
    if ($pos === false || $pos < 1) {
        return '***';
    }
    return mb_substr($correo, 0, 1) . '***' . substr($correo, $pos);
}

/** Convierte una suma DECIMAL de SQL (string o null) a pesos con exactitud de centavos. */
function reporte_pesos($v): float
{
    return pedido_pesos(pedido_centavos($v === null ? '0.00' : number_format((float) $v, 2, '.', '')));
}

/** Rango desde/hasta (AAAA-MM-DD). Por omisión, los últimos 30 días. 422 si es inválido o mayor a 366 días. */
function reporte_rango(string $desde, string $hasta): array
{
    $hoy = new DateTimeImmutable('today');
    $h = $hasta === '' ? $hoy : DateTimeImmutable::createFromFormat('!Y-m-d', $hasta);
    $d = $desde === '' ? $h->modify('-29 days') : DateTimeImmutable::createFromFormat('!Y-m-d', $desde);
    if ($d > $h) {
        responder_error('validacion', 'La fecha inicial no puede ser posterior a la final.', 422);
    }
    if ((int) $d->diff($h)->days + 1 > REPORTE_MAX_DIAS) {
        responder_error('validacion', 'El periodo máximo es de ' . REPORTE_MAX_DIAS . ' días.', 422);
    }
    return [$d->format('Y-m-d'), $h->format('Y-m-d')];
}

function reporte_marcadores_venta(): string
{
    return "'" . implode("','", ADMIN_ESTADOS_VENTA) . "'";   // constantes del código, no entrada del usuario
}

const REP_FILTRO_FECHA = 'p.creado_en >= :desde AND p.creado_en < DATE_ADD(:hasta, INTERVAL 1 DAY)';

function reporte_consulta(PDO $pdo, string $sql, array $params): array
{
    $s = $pdo->prepare($sql);
    $s->execute($params);
    return $s->fetchAll();
}

/** Arma la estructura estándar de un reporte. */
function reporte_armar(string $clave, array $rango, array $columnas, array $filas, array $resumen, ?array $grafica, array $notas = []): array
{
    return [
        'clave' => $clave, 'titulo' => REPORTES[$clave], 'aviso' => REPORTE_AVISO,
        'periodo' => ['desde' => $rango[0], 'hasta' => $rango[1]],
        'columnas' => $columnas, 'filas' => $filas, 'resumen' => $resumen, 'grafica' => $grafica,
        'notas' => $notas, 'truncado' => count($filas) >= REPORTE_MAX_FILAS,
    ];
}

const COL_DIN = 'dinero';
const COL_ENT = 'entero';
const COL_TXT = 'texto';

/* ===================== Los ocho reportes ===================== */

function reporte_generar(PDO $pdo, string $clave, string $desde, string $hasta): array
{
    $rango = reporte_rango($desde, $hasta);
    $p = [':desde' => $rango[0], ':hasta' => $rango[1]];
    $v = reporte_marcadores_venta();
    $lim = REPORTE_MAX_FILAS;

    switch ($clave) {
        case 'ventas_dia':
            $r = reporte_consulta($pdo, "SELECT DATE(p.creado_en) AS dia, COUNT(*) AS pedidos, SUM(p.subtotal) AS subtotal, SUM(p.impuestos) AS impuestos,
                    SUM(p.costo_envio) AS envio, SUM(p.total) AS total FROM pedidos p
                    WHERE p.estado IN ($v) AND " . REP_FILTRO_FECHA . ' GROUP BY DATE(p.creado_en) ORDER BY dia', $p);
            $filas = [];
            $tp = 0; $tt = 0;
            foreach ($r as $f) {
                $filas[] = ['dia' => $f['dia'], 'pedidos' => (int) $f['pedidos'], 'subtotal' => reporte_pesos($f['subtotal']), 'impuestos' => reporte_pesos($f['impuestos']),
                            'envio' => reporte_pesos($f['envio']), 'total' => reporte_pesos($f['total'])];
                $tp += (int) $f['pedidos'];
                $tt += pedido_centavos(number_format((float) $f['total'], 2, '.', ''));
            }
            return reporte_armar($clave, $rango, [
                ['clave' => 'dia', 'etiqueta' => 'Día', 'tipo' => COL_TXT], ['clave' => 'pedidos', 'etiqueta' => 'Pedidos', 'tipo' => COL_ENT],
                ['clave' => 'subtotal', 'etiqueta' => 'Subtotal (simulado)', 'tipo' => COL_DIN], ['clave' => 'impuestos', 'etiqueta' => 'IVA (simulado)', 'tipo' => COL_DIN],
                ['clave' => 'envio', 'etiqueta' => 'Envío (simulado)', 'tipo' => COL_DIN], ['clave' => 'total', 'etiqueta' => 'Total (simulado)', 'tipo' => COL_DIN],
            ], $filas, [
                ['etiqueta' => 'Pedidos con venta simulada', 'valor' => $tp, 'tipo' => COL_ENT],
                ['etiqueta' => 'Total de ventas simuladas', 'valor' => pedido_pesos($tt), 'tipo' => COL_DIN],
                ['etiqueta' => 'Promedio por pedido (simulado)', 'valor' => $tp > 0 ? pedido_pesos((int) round($tt / $tp)) : 0.0, 'tipo' => COL_DIN],
            ], ['etiqueta' => 'dia', 'valor' => 'total'], ['Se cuentan pedidos pagado, preparado, enviado y entregado. Pendientes y cancelados no suman.']);

        case 'ventas_estado':
            $r = reporte_consulta($pdo, 'SELECT p.estado, COUNT(*) AS pedidos, SUM(p.total) AS total FROM pedidos p WHERE ' . REP_FILTRO_FECHA . ' GROUP BY p.estado', $p);
            $por = [];
            foreach ($r as $f) {
                $por[$f['estado']] = $f;
            }
            $filas = [];
            $tp = 0;
            foreach (ADMIN_ESTADOS_TODOS as $e) {
                $f = $por[$e] ?? null;
                $tipo = in_array($e, ADMIN_ESTADOS_VENTA, true) ? 'Venta simulada' : ($e === 'pendiente' ? 'Por cobrar (simulado)' : 'No cuenta');
                $filas[] = ['estado' => $e, 'concepto' => $tipo, 'pedidos' => $f ? (int) $f['pedidos'] : 0, 'total' => $f ? reporte_pesos($f['total']) : 0.0];
                $tp += $f ? (int) $f['pedidos'] : 0;
            }
            return reporte_armar($clave, $rango, [
                ['clave' => 'estado', 'etiqueta' => 'Estado', 'tipo' => COL_TXT], ['clave' => 'concepto', 'etiqueta' => 'Cómo se considera', 'tipo' => COL_TXT],
                ['clave' => 'pedidos', 'etiqueta' => 'Pedidos', 'tipo' => COL_ENT], ['clave' => 'total', 'etiqueta' => 'Importe (simulado)', 'tipo' => COL_DIN],
            ], $filas, [['etiqueta' => 'Pedidos en el periodo', 'valor' => $tp, 'tipo' => COL_ENT]], ['etiqueta' => 'estado', 'valor' => 'pedidos'],
            ['Los pedidos cancelados ya repusieron sus existencias; su importe no es venta.']);

        case 'ventas_metodo':
            $r = reporte_consulta($pdo, "SELECT p.metodo_pago AS metodo, COUNT(*) AS pedidos, SUM(p.total) AS total FROM pedidos p
                    WHERE p.estado IN ($v) AND " . REP_FILTRO_FECHA . ' GROUP BY p.metodo_pago ORDER BY total DESC', $p);
            $filas = array_map(static fn (array $f): array => ['metodo' => $f['metodo'], 'pedidos' => (int) $f['pedidos'], 'total' => reporte_pesos($f['total'])], $r);
            return reporte_armar($clave, $rango, [
                ['clave' => 'metodo', 'etiqueta' => 'Método (simulado)', 'tipo' => COL_TXT], ['clave' => 'pedidos', 'etiqueta' => 'Pedidos', 'tipo' => COL_ENT],
                ['clave' => 'total', 'etiqueta' => 'Total (simulado)', 'tipo' => COL_DIN],
            ], $filas, [['etiqueta' => 'Métodos con ventas', 'valor' => count($filas), 'tipo' => COL_ENT]], ['etiqueta' => 'metodo', 'valor' => 'total'],
            ['No se procesa ningún pago real ni se guardan datos de tarjetas o cuentas.']);

        case 'productos_top':
            $r = reporte_consulta($pdo, "SELECT d.producto_id, MAX(d.nombre_producto) AS nombre, SUM(d.cantidad) AS unidades, SUM(d.cantidad * d.precio_unitario) AS importe
                    FROM detalle_pedidos d JOIN pedidos p ON p.id = d.pedido_id
                    WHERE p.estado IN ($v) AND " . REP_FILTRO_FECHA . " GROUP BY d.producto_id ORDER BY unidades DESC, importe DESC, d.producto_id LIMIT $lim", $p);
            $filas = array_map(static fn (array $f): array => ['producto' => (string) $f['nombre'], 'unidades' => (int) $f['unidades'], 'importe' => reporte_pesos($f['importe'])], $r);
            return reporte_armar($clave, $rango, [
                ['clave' => 'producto', 'etiqueta' => 'Producto', 'tipo' => COL_TXT], ['clave' => 'unidades', 'etiqueta' => 'Unidades', 'tipo' => COL_ENT],
                ['clave' => 'importe', 'etiqueta' => 'Importe antes de IVA (simulado)', 'tipo' => COL_DIN],
            ], $filas, [['etiqueta' => 'Unidades vendidas (simulado)', 'valor' => array_sum(array_column($filas, 'unidades')), 'tipo' => COL_ENT]],
            ['etiqueta' => 'producto', 'valor' => 'unidades'], ['Usa el precio y el nombre guardados en cada pedido, no el precio actual del catálogo.']);

        case 'ventas_categoria':
        case 'ventas_marca':
            $esCat = $clave === 'ventas_categoria';
            $tabla = $esCat ? 'categorias' : 'marcas';
            $fk = $esCat ? 'categoria_id' : 'marca_id';
            $r = reporte_consulta($pdo, "SELECT x.nombre AS nombre, SUM(d.cantidad) AS unidades, SUM(d.cantidad * d.precio_unitario) AS importe
                    FROM detalle_pedidos d JOIN pedidos p ON p.id = d.pedido_id JOIN productos pr ON pr.id = d.producto_id JOIN $tabla x ON x.id = pr.$fk
                    WHERE p.estado IN ($v) AND " . REP_FILTRO_FECHA . ' GROUP BY x.id, x.nombre ORDER BY importe DESC', $p);
            $filas = array_map(static fn (array $f): array => ['nombre' => (string) $f['nombre'], 'unidades' => (int) $f['unidades'], 'importe' => reporte_pesos($f['importe'])], $r);
            return reporte_armar($clave, $rango, [
                ['clave' => 'nombre', 'etiqueta' => $esCat ? 'Categoría' : 'Marca', 'tipo' => COL_TXT], ['clave' => 'unidades', 'etiqueta' => 'Unidades', 'tipo' => COL_ENT],
                ['clave' => 'importe', 'etiqueta' => 'Importe antes de IVA (simulado)', 'tipo' => COL_DIN],
            ], $filas, [['etiqueta' => 'Unidades vendidas (simulado)', 'valor' => array_sum(array_column($filas, 'unidades')), 'tipo' => COL_ENT]],
            ['etiqueta' => 'nombre', 'valor' => 'importe'], ['La ' . ($esCat ? 'categoría' : 'marca') . ' es la que tiene hoy el producto en el catálogo; los importes son los de cada pedido.']);

        case 'inventario_bajo':
            $umbral = admin_umbral_stock($pdo);
            $r = reporte_consulta($pdo, "SELECT pr.codigo, pr.nombre, m.nombre AS marca, pr.stock FROM productos pr JOIN marcas m ON m.id = pr.marca_id
                    WHERE pr.activo = 1 AND pr.stock <= :u ORDER BY pr.stock, pr.id LIMIT $lim", [':u' => $umbral]);
            $filas = array_map(static fn (array $f): array => ['codigo' => (string) $f['codigo'], 'producto' => (string) $f['nombre'], 'marca' => (string) $f['marca'],
                'stock' => (int) $f['stock'], 'situacion' => (int) $f['stock'] === 0 ? 'Agotado' : 'Stock bajo'], $r);
            return reporte_armar($clave, $rango, [
                ['clave' => 'codigo', 'etiqueta' => 'Código', 'tipo' => COL_TXT], ['clave' => 'producto', 'etiqueta' => 'Producto', 'tipo' => COL_TXT],
                ['clave' => 'marca', 'etiqueta' => 'Marca', 'tipo' => COL_TXT], ['clave' => 'stock', 'etiqueta' => 'Existencias', 'tipo' => COL_ENT],
                ['clave' => 'situacion', 'etiqueta' => 'Situación', 'tipo' => COL_TXT],
            ], $filas, [
                ['etiqueta' => 'Umbral de stock bajo', 'valor' => $umbral, 'tipo' => COL_ENT],
                ['etiqueta' => 'Productos activos en alerta', 'valor' => count($filas), 'tipo' => COL_ENT],
            ], ['etiqueta' => 'producto', 'valor' => 'stock'], ['Foto actual del inventario: no depende del periodo elegido.']);

        case 'clientes_top':
            $r = reporte_consulta($pdo, "SELECT u.id, u.nombre, u.correo, COUNT(*) AS pedidos, SUM(p.total) AS total FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
                    WHERE p.estado IN ($v) AND " . REP_FILTRO_FECHA . " GROUP BY u.id, u.nombre, u.correo ORDER BY total DESC, u.id LIMIT 50", $p);
            $filas = array_map(static fn (array $f): array => ['cliente' => reporte_nombre_abreviado((string) $f['nombre']), 'correo' => reporte_correo_enmascarado((string) $f['correo']),
                'pedidos' => (int) $f['pedidos'], 'total' => reporte_pesos($f['total'])], $r);
            return reporte_armar($clave, $rango, [
                ['clave' => 'cliente', 'etiqueta' => 'Cliente', 'tipo' => COL_TXT], ['clave' => 'correo', 'etiqueta' => 'Correo (enmascarado)', 'tipo' => COL_TXT],
                ['clave' => 'pedidos', 'etiqueta' => 'Pedidos', 'tipo' => COL_ENT], ['clave' => 'total', 'etiqueta' => 'Total (simulado)', 'tipo' => COL_DIN],
            ], $filas, [['etiqueta' => 'Clientes con compras simuladas', 'valor' => count($filas), 'tipo' => COL_ENT]], null,
            ['Por privacidad se muestran nombre abreviado y correo enmascarado; no se incluyen teléfonos ni direcciones. Máximo 50 clientes.']);
    }
    responder_error('validacion', 'Reporte no válido.', 422);
}

/* ===================== CSV ===================== */

/** Neutraliza fórmulas de hoja de cálculo (=, +, -, @, tab, retorno) anteponiendo apóstrofo. */
function reporte_csv_celda($valor): string
{
    $s = (string) $valor;
    return $s !== '' && strpos("=+-@\t\r", $s[0]) !== false ? "'" . $s : $s;
}

/** Devuelve el CSV (UTF-8 con BOM). Primero el aviso de simulación y el periodo, luego los encabezados y filas. */
function reporte_csv(array $rep): string
{
    $f = fopen('php://temp', 'w+');
    fwrite($f, "\xEF\xBB\xBF");
    fputcsv($f, [reporte_csv_celda($rep['titulo'])], ',', '"', '');
    fputcsv($f, [reporte_csv_celda($rep['aviso'])], ',', '"', '');
    fputcsv($f, ['Periodo', $rep['periodo']['desde'], $rep['periodo']['hasta']], ',', '"', '');
    fputcsv($f, array_map(static fn (array $c): string => reporte_csv_celda($c['etiqueta']), $rep['columnas']), ',', '"', '');
    foreach ($rep['filas'] as $fila) {
        $out = [];
        foreach ($rep['columnas'] as $c) {
            $x = $fila[$c['clave']] ?? '';
            $out[] = $c['tipo'] === COL_DIN ? number_format((float) $x, 2, '.', '') : reporte_csv_celda($x);
        }
        fputcsv($f, $out, ',', '"', '');
    }
    rewind($f);
    $csv = (string) stream_get_contents($f);
    fclose($f);
    return $csv;
}

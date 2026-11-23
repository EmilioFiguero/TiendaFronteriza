<?php
declare(strict_types=1);

/**
 * Administración de pedidos (Fase 3.6.3).
 *
 * - Listado con búsqueda y filtros, y detalle de un pedido.
 * - Cambio de estado CONTROLADO (solo transiciones permitidas, nunca saltar ni retroceder).
 * - Cancelación con reposición de existencias: todo en UNA transacción (estado + existencias + movimientos
 *   de inventario + historial + auditoría). Si algo falla no se aplica nada.
 *
 * Los importes y las líneas de un pedido NUNCA se modifican aquí: solo cambia pedidos.estado.
 * No se toca includes/pedidos.php (el checkout). Pagos y envíos siguen siendo simulaciones académicas.
 */

require_once __DIR__ . '/admin.php';
require_once __DIR__ . '/inventario.php';
require_once __DIR__ . '/catalogo.php';

/** Transiciones permitidas. Los estados finales (entregado, cancelado) no tienen salida. */
const PEDIDO_TRANSICIONES = [
    'pendiente'  => ['pagado', 'cancelado'],
    'pagado'     => ['preparado', 'cancelado'],
    'preparado'  => ['enviado', 'cancelado'],
    'enviado'    => ['entregado'],
    'entregado'  => [],
    'cancelado'  => [],
];
const PEDIDO_ORDENES    = ['recientes', 'antiguos', 'total_desc', 'total_asc'];
const PEDIDO_REINT_ADM  = 3;

/** Estados a los que puede pasar un pedido desde $estado. */
function pedido_siguientes(string $estado): array
{
    return PEDIDO_TRANSICIONES[$estado] ?? [];
}

/** Fecha ?nombre=AAAA-MM-DD (válida de verdad: rechaza 2026-02-31). '' si no viene; 422 si es inválida. */
function admin_fecha_get(string $nombre): string
{
    $v = isset($_GET[$nombre]) && is_string($_GET[$nombre]) ? trim($_GET[$nombre]) : '';
    if ($v === '') {
        return '';
    }
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
    if ($d === false || $d->format('Y-m-d') !== $v || $d->format('Y') < '2020' || $d->format('Y') > '2100') {
        responder_error('validacion', 'Fecha no válida: ' . $nombre . ' (usa AAAA-MM-DD).', 422);
    }
    return $v;
}

function pedidos_admin_errores_422(array $errores): void
{
    responder_error('validacion', 'Revisa los datos enviados.', 422, null, ['errores' => $errores]);
}

/* ===================== Lectura ===================== */

/**
 * Listado paginado (15 por página). Filtros: q (número, nombre/correo de envío, nombre/correo de la cuenta),
 * estado, metodo, desde, hasta (por fecha de creación) y orden.
 */
function pedidos_admin_listar(PDO $pdo, string $q, string $estado, string $metodo, string $desde, string $hasta, string $orden, int $pagina): array
{
    if ($desde !== '' && $hasta !== '' && $desde > $hasta) {
        responder_error('validacion', 'La fecha «desde» no puede ser posterior a «hasta».', 422);
    }
    $donde = [];
    $params = [];
    if ($q !== '') {
        // Un nombre de parámetro por uso: con prepares nativos no se pueden repetir.
        $donde[] = "(p.numero_pedido LIKE :q1 ESCAPE '\\\\' OR p.envio_nombre LIKE :q2 ESCAPE '\\\\' OR p.envio_correo LIKE :q3 ESCAPE '\\\\'
                     OR u.nombre LIKE :q4 ESCAPE '\\\\' OR u.correo LIKE :q5 ESCAPE '\\\\')";
        foreach (['q1', 'q2', 'q3', 'q4', 'q5'] as $k) {
            $params[':' . $k] = admin_like($q);
        }
    }
    if ($estado !== '') {
        $donde[] = 'p.estado = :estado';
        $params[':estado'] = $estado;
    }
    if ($metodo !== '') {
        $donde[] = 'p.metodo_pago = :metodo';
        $params[':metodo'] = $metodo;
    }
    if ($desde !== '') {
        $donde[] = 'p.creado_en >= :desde';
        $params[':desde'] = $desde . ' 00:00:00';
    }
    if ($hasta !== '') {
        $donde[] = 'p.creado_en < DATE_ADD(:hasta, INTERVAL 1 DAY)';
        $params[':hasta'] = $hasta . ' 00:00:00';
    }
    $sqlDonde = $donde === [] ? '' : 'WHERE ' . implode(' AND ', $donde);
    $orderBy = [
        'recientes'  => 'p.creado_en DESC, p.id DESC',
        'antiguos'   => 'p.creado_en ASC, p.id ASC',
        'total_desc' => 'p.total DESC, p.id DESC',
        'total_asc'  => 'p.total ASC, p.id ASC',
    ][$orden === '' ? 'recientes' : $orden];

    $contar = $pdo->prepare("SELECT COUNT(*) FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id $sqlDonde");
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare(
        "SELECT p.numero_pedido, p.estado, p.metodo_pago, p.total, p.envio_nombre, UNIX_TIMESTAMP(p.creado_en) AS ts,
                u.nombre AS cuenta_nombre, u.correo AS cuenta_correo,
                (SELECT COALESCE(SUM(d.cantidad), 0) FROM detalle_pedidos d WHERE d.pedido_id = p.id) AS unidades
           FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
           $sqlDonde
          ORDER BY $orderBy
          LIMIT :lim OFFSET :off"
    );
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    $pedidos = [];
    foreach ($lista->fetchAll() as $f) {
        $pedidos[] = [
            'numero_pedido' => (string) $f['numero_pedido'],
            'estado'        => (string) $f['estado'],
            'metodo_pago'   => (string) $f['metodo_pago'],
            'total'         => pedido_pesos(pedido_centavos($f['total'])),
            'unidades'      => (int) $f['unidades'],
            'cliente'       => (string) $f['cuenta_nombre'],
            'correo'        => (string) $f['cuenta_correo'],
            'envio_nombre'  => (string) $f['envio_nombre'],
            'creado_en_ms'  => ((int) $f['ts']) * 1000,
            'siguientes'    => pedido_siguientes((string) $f['estado']),
        ];
    }

    // Conteo por estado de TODA la tienda (para las etiquetas de filtro rápido).
    $conteos = array_fill_keys(ADMIN_ESTADOS_TODOS, 0);
    foreach ($pdo->query('SELECT estado, COUNT(*) AS n FROM pedidos GROUP BY estado')->fetchAll() as $c) {
        $conteos[(string) $c['estado']] = (int) $c['n'];
    }

    return ['pagina' => $pagina, 'paginas' => $paginas, 'total' => $total, 'por_pagina' => ADMIN_POR_PAGINA, 'conteos' => $conteos, 'pedidos' => $pedidos];
}

/** Detalle completo de un pedido por número (TF-######), o null. Sin contraseñas ni datos de pago (no existen). */
function pedido_admin_detalle(PDO $pdo, string $numero): ?array
{
    $s = $pdo->prepare(
        'SELECT ' . PEDIDO_COLUMNAS . ', p.usuario_id, p.creado_en AS creado_raw, u.nombre AS cuenta_nombre, u.correo AS cuenta_correo, u.activo AS cuenta_activa
           FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
          WHERE p.numero_pedido = :n'
    );
    $s->execute([':n' => $numero]);
    $fila = $s->fetch();
    if ($fila === false) {
        return null;
    }
    $id = (int) $fila['id'];
    $lineas = pedido_lineas_de($pdo, [$id]);
    $pedido = pedido_formatear($fila, $lineas[$id] ?? []);
    $pedido['cuenta'] = [
        'id'     => (int) $fila['usuario_id'],
        'nombre' => (string) $fila['cuenta_nombre'],
        'correo' => (string) $fila['cuenta_correo'],
        'activa' => (int) $fila['cuenta_activa'] === 1,
    ];

    // Historial: primero «Pedido registrado» (calculado con la regla del checkout) y luego los cambios hechos desde el panel.
    $historial = [[
        'anterior' => null,
        'nuevo'    => pedido_estado_inicial((string) $fila['metodo_pago']),
        'motivo'   => null,
        'quien'    => 'Cliente (compra)',
        'fecha_ms' => $pedido['creado_en_ms'],
    ]];
    $h = $pdo->prepare(
        'SELECT h.estado_anterior, h.estado_nuevo, h.motivo, UNIX_TIMESTAMP(h.creado_en) AS ts, u.nombre
           FROM pedido_historial_estados h LEFT JOIN usuarios u ON u.id = h.usuario_id
          WHERE h.pedido_id = :id ORDER BY h.id'
    );
    $h->execute([':id' => $id]);
    foreach ($h->fetchAll() as $r) {
        $historial[] = [
            'anterior' => (string) $r['estado_anterior'],
            'nuevo'    => (string) $r['estado_nuevo'],
            'motivo'   => $r['motivo'] !== null ? (string) $r['motivo'] : null,
            'quien'    => $r['nombre'] !== null ? (string) $r['nombre'] : 'Administrador (cuenta eliminada)',
            'fecha_ms' => ((int) $r['ts']) * 1000,
        ];
    }
    $pedido['historial'] = $historial;

    $m = $pdo->prepare(
        'SELECT m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo, UNIX_TIMESTAMP(m.creado_en) AS ts, p.codigo, p.nombre
           FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id
          WHERE m.pedido_id = :id ORDER BY m.id'
    );
    $m->execute([':id' => $id]);
    $pedido['movimientos'] = array_map(static fn (array $r): array => [
        'tipo' => (string) $r['tipo'], 'cantidad' => (int) $r['cantidad'], 'antes' => (int) $r['stock_anterior'],
        'despues' => (int) $r['stock_nuevo'], 'codigo' => (string) $r['codigo'], 'producto' => (string) $r['nombre'],
        'fecha_ms' => ((int) $r['ts']) * 1000,
    ], $m->fetchAll());

    $pedido['siguientes'] = pedido_siguientes($pedido['estado']);
    $pedido['cancelable'] = in_array('cancelado', $pedido['siguientes'], true);
    return $pedido;
}

/* ===================== Escritura ===================== */

/**
 * Cambia el estado de un pedido (NO para cancelar: eso exige reposición y pasa por pedido_admin_cancelar).
 * $esperado: estado que el administrador veía; si ya cambió -> 409 (evita aplicar dos veces o pisar a otro admin).
 */
function pedido_admin_cambiar_estado(PDO $pdo, array $admin, string $numero, string $esperado, string $nuevo, ?string $motivo): array
{
    return pedido_admin_transaccion($pdo, $numero, static function (array $p) use ($pdo, $admin, $esperado, $nuevo, $motivo): array {
        pedido_admin_validar_transicion($p, $esperado, $nuevo);
        pedido_admin_aplicar_estado($pdo, $admin, $p, $nuevo, $motivo);
        admin_auditar($pdo, $admin['id'], 'pedido_estado_cambiado', 'pedido', $p['numero_pedido'],
            sprintf('%s -> %s%s', $p['estado'], $nuevo, $motivo !== null && $motivo !== '' ? ' | motivo=' . $motivo : ''));
        return ['anterior' => $p['estado'], 'nuevo' => $nuevo, 'unidades_repuestas' => 0];
    });
}

/** Cancela un pedido y repone las existencias de TODAS sus líneas, todo o nada. */
function pedido_admin_cancelar(PDO $pdo, array $admin, string $numero, string $esperado, string $motivo): array
{
    return pedido_admin_transaccion($pdo, $numero, static function (array $p) use ($pdo, $admin, $esperado, $motivo): array {
        pedido_admin_validar_transicion($p, $esperado, 'cancelado');

        // Unidades por producto (detalle_pedidos tiene una línea por producto; se agrupa por si acaso).
        $l = $pdo->prepare('SELECT producto_id, SUM(cantidad) AS unidades FROM detalle_pedidos WHERE pedido_id = :id GROUP BY producto_id ORDER BY producto_id');
        $l->execute([':id' => $p['id']]);
        $lineas = $l->fetchAll();
        if ($lineas === []) {
            throw new RuntimeException('El pedido no tiene líneas.');
        }

        // Bloquear los productos en orden de id (el mismo orden que usa el checkout: evita bloqueos cruzados).
        $ids = array_map(static fn (array $f): int => (int) $f['producto_id'], $lineas);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $b = $pdo->prepare("SELECT id, stock FROM productos WHERE id IN ($marcas) ORDER BY id FOR UPDATE");
        $b->execute($ids);
        $stocks = [];
        foreach ($b->fetchAll() as $f) {
            $stocks[(int) $f['id']] = (int) $f['stock'];
        }

        $repuestas = 0;
        $detalle = [];
        foreach ($lineas as $f) {
            $pid = (int) $f['producto_id'];
            $cant = (int) $f['unidades'];
            if (!isset($stocks[$pid])) {
                throw new RuntimeException('Producto del pedido no encontrado.');
            }
            $antes = $stocks[$pid];
            $despues = $antes + $cant;
            $u = $pdo->prepare('UPDATE productos SET stock = :n WHERE id = :id AND stock = :a');
            $u->execute([':n' => $despues, ':id' => $pid, ':a' => $antes]);
            if ($u->rowCount() !== 1) {
                throw new RuntimeException('No se pudo reponer las existencias.');
            }
            inventario_registrar($pdo, $pid, 'cancelacion', $cant, $antes, $despues,
                'Cancelación ' . $p['numero_pedido'] . ': ' . $motivo, $admin['id'], $p['id']);
            $repuestas += $cant;
            $detalle[] = 'p' . $pid . '+' . $cant;
        }

        pedido_admin_aplicar_estado($pdo, $admin, $p, 'cancelado', $motivo);
        admin_auditar($pdo, $admin['id'], 'pedido_cancelado', 'pedido', $p['numero_pedido'],
            sprintf('%s -> cancelado | unidades repuestas=%d (%s) | motivo=%s', $p['estado'], $repuestas, implode(',', $detalle), $motivo));
        return ['anterior' => $p['estado'], 'nuevo' => 'cancelado', 'unidades_repuestas' => $repuestas];
    });
}

/** Bloquea el pedido, ejecuta $cuerpo dentro de la transacción y reintenta si hubo deadlock/espera de bloqueo. */
function pedido_admin_transaccion(PDO $pdo, string $numero, callable $cuerpo): array
{
    for ($intento = 1; ; $intento++) {
        $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        $pdo->exec('SET SESSION innodb_lock_wait_timeout = 10');
        $pdo->beginTransaction();
        try {
            $s = $pdo->prepare('SELECT id, numero_pedido, estado, metodo_pago FROM pedidos WHERE numero_pedido = :n FOR UPDATE');
            $s->execute([':n' => $numero]);
            $fila = $s->fetch();
            if ($fila === false) {
                $pdo->rollBack();
                responder_error('no_encontrado', 'No encontramos ese pedido.', 404);
            }
            $p = ['id' => (int) $fila['id'], 'numero_pedido' => (string) $fila['numero_pedido'], 'estado' => (string) $fila['estado']];
            $r = $cuerpo($p);
            $pdo->commit();
            return $r;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof PDOException) {
                $errno = errno_de_pdo($e);
                if (($errno === 1213 || $errno === 1205) && $intento < PEDIDO_REINT_ADM) {
                    usleep(random_int(40000, 120000) * $intento);
                    continue;
                }
                if ($errno === 1062) {   // reposición ya registrada para este pedido: nunca se repone dos veces
                    responder_error('ya_repuesto', 'Este pedido ya tiene sus existencias repuestas; no se aplicó ningún cambio.', 409);
                }
            }
            throw $e;
        }
    }
}

/** 409 si el estado ya no es el que el administrador veía, o si la transición no está permitida. */
function pedido_admin_validar_transicion(array $p, string $esperado, string $nuevo): void
{
    if ($p['estado'] !== $esperado) {
        pedido_admin_abortar('estado_cambio', 'El pedido ya no está «' . $esperado . '»: ahora está «' . $p['estado'] . '». Actualiza la pantalla y revisa antes de continuar.', ['actual' => $p['estado']]);
    }
    if (!in_array($nuevo, pedido_siguientes($p['estado']), true)) {
        $txt = pedido_siguientes($p['estado']) === [] ? 'es un estado final' : 'solo puede pasar a: ' . implode(', ', pedido_siguientes($p['estado']));
        pedido_admin_abortar('transicion_no_permitida', 'No se puede pasar de «' . $p['estado'] . '» a «' . $nuevo . '» (' . $txt . ').', ['actual' => $p['estado']]);
    }
}

/** Revierte la transacción en curso y responde 409. */
function pedido_admin_abortar(string $codigo, string $mensaje, array $extra): void
{
    $pdo = obtener_conexion();
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    responder_error($codigo, $mensaje, 409, null, $extra);
}

/** UPDATE del estado (con comprobación del estado actual) + fila de historial. */
function pedido_admin_aplicar_estado(PDO $pdo, array $admin, array $p, string $nuevo, ?string $motivo): void
{
    $u = $pdo->prepare('UPDATE pedidos SET estado = :n WHERE id = :id AND estado = :a');
    $u->execute([':n' => $nuevo, ':id' => $p['id'], ':a' => $p['estado']]);
    if ($u->rowCount() !== 1) {
        throw new RuntimeException('No se pudo cambiar el estado.');
    }
    $h = $pdo->prepare(
        'INSERT INTO pedido_historial_estados (pedido_id, estado_anterior, estado_nuevo, motivo, usuario_id)
         VALUES (:p, :a, :n, :m, :u)'
    );
    $h->execute([':p' => $p['id'], ':a' => $p['estado'], ':n' => $nuevo, ':m' => $motivo === null || $motivo === '' ? null : mb_substr($motivo, 0, 200), ':u' => $admin['id']]);
}

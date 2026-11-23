<?php
declare(strict_types=1);

/**
 * Consultas del panel administrativo (Fase 3.6.1): dashboard, clientes y auditoría.
 * Solo lectura salvo cliente_cambiar_estado(). Todas las consultas son preparadas.
 */

require_once __DIR__ . '/admin.php';

/* ===================== Dashboard ===================== */

function admin_dashboard(PDO $pdo): array
{
    $umbral = admin_umbral_stock($pdo);
    // Productos
    $f = $pdo->prepare(
        'SELECT COUNT(*) AS total,
                COALESCE(SUM(activo = 1), 0) AS activos,
                COALESCE(SUM(activo = 0), 0) AS inactivos,
                COALESCE(SUM(activo = 1 AND stock >= 1 AND stock <= :umbral), 0) AS stock_bajo,
                COALESCE(SUM(activo = 1 AND stock = 0), 0) AS agotados
           FROM productos'
    );
    $f->execute([':umbral' => $umbral]);
    $p = $f->fetch();

    $alertas = $pdo->prepare(
        'SELECT codigo, nombre, stock FROM productos
          WHERE activo = 1 AND stock <= :umbral
          ORDER BY stock ASC, nombre ASC LIMIT 8'
    );
    $alertas->execute([':umbral' => $umbral]);

    // Clientes (solo cuentas con rol cliente)
    $c = $pdo->query(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(activo = 1), 0) AS activos,
                COALESCE(SUM(activo = 0), 0) AS inactivos
           FROM usuarios WHERE rol = 'cliente'"
    )->fetch();

    // Pedidos por estado (cantidad e importe); los 6 estados siempre presentes
    $porEstado = [];
    foreach (ADMIN_ESTADOS_TODOS as $estado) {
        $porEstado[$estado] = ['cantidad' => 0, 'importe' => 0.0];
    }
    $totalPedidos = 0;
    foreach ($pdo->query('SELECT estado, COUNT(*) AS n, COALESCE(SUM(total), 0) AS importe FROM pedidos GROUP BY estado')->fetchAll() as $fila) {
        $porEstado[(string) $fila['estado']] = [
            'cantidad' => (int) $fila['n'],
            'importe'  => pedido_pesos(pedido_centavos($fila['importe'])),
        ];
        $totalPedidos += (int) $fila['n'];
    }

    // Ventas simuladas = pagado + preparado + enviado + entregado. Pendiente (por cobrar) y cancelado quedan fuera.
    $ventasN = 0;
    $ventasCent = 0;
    foreach (ADMIN_ESTADOS_VENTA as $estado) {
        $ventasN += $porEstado[$estado]['cantidad'];
        $ventasCent += (int) round($porEstado[$estado]['importe'] * 100);
    }

    // Pedidos recientes
    $recientes = [];
    $r = $pdo->query(
        'SELECT p.numero_pedido, p.estado, p.metodo_pago, p.total, UNIX_TIMESTAMP(p.creado_en) AS ts, u.nombre AS cliente
           FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
          ORDER BY p.creado_en DESC, p.id DESC LIMIT 8'
    );
    foreach ($r->fetchAll() as $fila) {
        $recientes[] = [
            'numero_pedido' => (string) $fila['numero_pedido'],
            'cliente'       => (string) $fila['cliente'],
            'estado'        => (string) $fila['estado'],
            'metodo_pago'   => (string) $fila['metodo_pago'],
            'total'         => pedido_pesos(pedido_centavos($fila['total'])),
            'creado_en_ms'  => ((int) $fila['ts']) * 1000,
        ];
    }

    return [
        'umbral_stock_bajo' => $umbral,
        'productos' => [
            'total'      => (int) $p['total'],
            'activos'    => (int) $p['activos'],
            'inactivos'  => (int) $p['inactivos'],
            'stock_bajo' => (int) $p['stock_bajo'],
            'agotados'   => (int) $p['agotados'],
            'alertas'    => array_map(
                static fn(array $a): array => ['codigo' => (string) $a['codigo'], 'nombre' => (string) $a['nombre'], 'stock' => (int) $a['stock']],
                $alertas->fetchAll()
            ),
        ],
        'clientes' => ['total' => (int) $c['total'], 'activos' => (int) $c['activos'], 'inactivos' => (int) $c['inactivos']],
        'pedidos'  => ['total' => $totalPedidos, 'por_estado' => $porEstado],
        'ventas'   => [
            'cantidad'    => $ventasN,
            'importe'     => pedido_pesos($ventasCent),
            'por_cobrar'  => $porEstado['pendiente'],
            'cancelados'  => $porEstado['cancelado'],
        ],
        'recientes' => $recientes,
    ];
}

/* ===================== Clientes ===================== */

function cliente_formatear(array $f): array
{
    return [
        'id'            => (int) $f['id'],
        'nombre'        => (string) $f['nombre'],
        'correo'        => (string) $f['correo'],
        'rol'           => (string) $f['rol'],
        'activo'        => (int) $f['activo'] === 1,
        'creado_en_ms'  => ((int) $f['ts']) * 1000,
        'pedidos'       => (int) $f['pedidos'],
        'comprado'      => pedido_pesos(pedido_centavos($f['comprado'])),   // solo estados que cuentan como venta
    ];
}

/** Lista paginada. Nunca incluye password_hash. */
function clientes_listar(PDO $pdo, string $q, string $estado, string $rol, int $pagina): array
{
    $donde = [];
    $params = [];
    if ($rol !== 'todos') {
        $donde[] = 'u.rol = :rol';
        $params[':rol'] = $rol === 'admin' ? ROL_ADMIN : ROL_CLIENTE;
    }
    if ($estado === 'activo') {
        $donde[] = 'u.activo = 1';
    } elseif ($estado === 'inactivo') {
        $donde[] = 'u.activo = 0';
    }
    if ($q !== '') {
        $donde[] = "(u.nombre LIKE :q1 ESCAPE '\\\\' OR u.correo LIKE :q2 ESCAPE '\\\\')";
        $params[':q1'] = admin_like($q);
        $params[':q2'] = admin_like($q);
    }
    $sqlDonde = $donde === [] ? '' : 'WHERE ' . implode(' AND ', $donde);

    $contar = $pdo->prepare("SELECT COUNT(*) FROM usuarios u $sqlDonde");
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare(
        "SELECT u.id, u.nombre, u.correo, u.rol, u.activo, UNIX_TIMESTAMP(u.creado_en) AS ts,
                COUNT(p.id) AS pedidos,
                COALESCE(SUM(CASE WHEN p.estado IN ('pagado','preparado','enviado','entregado') THEN p.total END), 0) AS comprado
           FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id
           $sqlDonde
          GROUP BY u.id
          ORDER BY u.creado_en DESC, u.id DESC
          LIMIT :lim OFFSET :off"
    );
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    return [
        'clientes' => array_map('cliente_formatear', $lista->fetchAll()),
        'pagina'   => $pagina,
        'paginas'  => $paginas,
        'total'    => $total,
    ];
}

/** Un cliente con sus pedidos (solo lo necesario: folio, estado, importe, fecha, método). null si no existe. */
function cliente_detalle(PDO $pdo, int $id): ?array
{
    $f = $pdo->prepare(
        "SELECT u.id, u.nombre, u.correo, u.rol, u.activo, UNIX_TIMESTAMP(u.creado_en) AS ts,
                COUNT(p.id) AS pedidos,
                COALESCE(SUM(CASE WHEN p.estado IN ('pagado','preparado','enviado','entregado') THEN p.total END), 0) AS comprado
           FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id
          WHERE u.id = :id GROUP BY u.id"
    );
    $f->execute([':id' => $id]);
    $fila = $f->fetch();
    if ($fila === false) {
        return null;
    }

    $ped = $pdo->prepare(
        'SELECT numero_pedido, estado, metodo_pago, total, UNIX_TIMESTAMP(creado_en) AS ts
           FROM pedidos WHERE usuario_id = :id ORDER BY creado_en DESC, id DESC LIMIT 50'
    );
    $ped->execute([':id' => $id]);
    $pedidos = [];
    foreach ($ped->fetchAll() as $p) {
        $pedidos[] = [
            'numero_pedido' => (string) $p['numero_pedido'],
            'estado'        => (string) $p['estado'],
            'metodo_pago'   => (string) $p['metodo_pago'],
            'total'         => pedido_pesos(pedido_centavos($p['total'])),
            'creado_en_ms'  => ((int) $p['ts']) * 1000,
        ];
    }

    return cliente_formatear($fila) + ['ultimos_pedidos' => $pedidos];
}

/**
 * Activa o desactiva una cuenta de cliente. Reglas (en el servidor):
 *  - un administrador no puede cambiar su propio estado;
 *  - no se puede cambiar el estado de OTRO administrador (primero hay que retirarle el rol);
 *  - repetir la misma operación no cambia nada ni duplica la auditoría.
 * Cambio + auditoría van en una sola transacción.
 *
 * @return array{cambiado:bool,activo:bool}
 */
function cliente_cambiar_estado(PDO $pdo, array $admin, int $id, bool $activo, string $motivo): array
{
    if ($id === $admin['id']) {
        responder_error('no_permitido', 'No puedes cambiar el estado de tu propia cuenta.', 409);
    }

    $pdo->beginTransaction();
    try {
        $f = $pdo->prepare('SELECT id, correo, rol, activo FROM usuarios WHERE id = :id FOR UPDATE');
        $f->execute([':id' => $id]);
        $u = $f->fetch();

        if ($u === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos esa cuenta.', 404);
        }
        if ($u['rol'] !== ROL_CLIENTE) {
            $pdo->rollBack();
            responder_error(
                'no_permitido',
                'No se puede activar ni desactivar a un administrador desde el panel. Primero retira su rol (ver LEEME.txt).',
                409
            );
        }
        if (((int) $u['activo'] === 1) === $activo) {
            $pdo->rollBack();   // ya estaba así: sin cambios y sin registro duplicado
            return ['cambiado' => false, 'activo' => $activo];
        }

        $actualizar = $pdo->prepare('UPDATE usuarios SET activo = :a WHERE id = :id AND rol = :rol');
        $actualizar->execute([':a' => $activo ? 1 : 0, ':id' => $id, ':rol' => ROL_CLIENTE]);

        admin_auditar(
            $pdo,
            $admin['id'],
            $activo ? 'cliente_activado' : 'cliente_desactivado',
            'usuario',
            $id,
            'correo=' . $u['correo'] . ($motivo !== '' ? ' | motivo=' . $motivo : '')
        );
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return ['cambiado' => true, 'activo' => $activo];
}

/* ===================== Auditoría ===================== */

function auditoria_listar(PDO $pdo, string $accion, string $entidad, int $pagina): array
{
    $donde = [];
    $params = [];
    if ($accion !== '') {
        $donde[] = 'a.accion = :accion';
        $params[':accion'] = $accion;
    }
    if ($entidad !== '') {
        $donde[] = 'a.entidad = :entidad';
        $params[':entidad'] = $entidad;
    }
    $sqlDonde = $donde === [] ? '' : 'WHERE ' . implode(' AND ', $donde);

    $contar = $pdo->prepare("SELECT COUNT(*) FROM auditoria_admin a $sqlDonde");
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare(
        "SELECT a.id, a.accion, a.entidad, a.entidad_id, a.detalle, a.ip, UNIX_TIMESTAMP(a.creado_en) AS ts,
                u.nombre AS admin_nombre, u.correo AS admin_correo
           FROM auditoria_admin a LEFT JOIN usuarios u ON u.id = a.admin_id
           $sqlDonde
          ORDER BY a.id DESC LIMIT :lim OFFSET :off"
    );
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    $registros = [];
    foreach ($lista->fetchAll() as $f) {
        $registros[] = [
            'id'           => (int) $f['id'],
            'accion'       => (string) $f['accion'],
            'entidad'      => (string) $f['entidad'],
            'entidad_id'   => $f['entidad_id'] !== null ? (string) $f['entidad_id'] : null,
            'detalle'      => $f['detalle'] !== null ? (string) $f['detalle'] : null,
            'ip'           => $f['ip'] !== null ? (string) $f['ip'] : null,
            'admin'        => $f['admin_nombre'] !== null ? (string) $f['admin_nombre'] . ' <' . (string) $f['admin_correo'] . '>' : 'Sistema (consola)',
            'creado_en_ms' => ((int) $f['ts']) * 1000,
        ];
    }

    $acciones = $pdo->query('SELECT DISTINCT accion FROM auditoria_admin ORDER BY accion')->fetchAll(PDO::FETCH_COLUMN);
    $entidades = $pdo->query('SELECT DISTINCT entidad FROM auditoria_admin ORDER BY entidad')->fetchAll(PDO::FETCH_COLUMN);

    return [
        'registros' => $registros,
        'pagina'    => $pagina,
        'paginas'   => $paginas,
        'total'     => $total,
        'acciones'  => array_map('strval', $acciones),
        'entidades' => array_map('strval', $entidades),
    ];
}

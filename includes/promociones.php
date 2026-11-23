<?php
declare(strict_types=1);

/**
 * Promociones administrativas (Fase 3.6.4).
 *
 *  - CUPONES: función administrativa y DE SIMULACIÓN. Ninguna compra (carrito/checkout/pedidos) los aplica todavía;
 *    este archivo NO es usado por includes/pedidos.php y no modifica ningún importe de pedidos.
 *    cupon_calcular() es una función pura en centavos pensada para poder reutilizarla en una fase futura.
 *  - OFERTAS DE PRODUCTO: solo escriben productos.precio_anterior y productos.en_oferta (precio de lista a mostrar tachado).
 *    NO tocan productos.precio, que es el precio efectivo de venta; los pedidos guardan su propio precio en detalle_pedidos.
 */

require_once __DIR__ . '/admin_catalogo.php';

const CUPON_ESTADOS    = ['vigente', 'programado', 'vencido', 'inactivo'];
const CUPON_TIPOS      = ['porcentaje', 'monto_fijo'];
const CUPON_MAX_USOS   = 1000000;
const OFERTA_ESTADOS   = ['ok', 'incompleta', 'huerfana', 'sin_oferta'];

/* ===================== Cupones: validación ===================== */

/** Importe MXN opcionalmente en cero ("0", "150", "150.5"); null si no es válido. Devuelve "150.50". */
function cupon_monto($valor, bool $permitirCero): ?string
{
    if ($valor === null || $valor === '') {
        return null;
    }
    if (is_int($valor)) {
        $s = (string) $valor;
    } elseif (is_float($valor)) {
        $r = round($valor, 2);
        if (abs($valor - $r) > 1e-9) {
            return null;
        }
        $s = number_format($r, 2, '.', '');
    } elseif (is_string($valor)) {
        $s = trim($valor);
    } else {
        return null;
    }
    if (preg_match('/^\d{1,6}(\.\d{1,2})?$/', $s) !== 1) {
        return null;
    }
    $c = pedido_centavos($s);
    if ($c > 99999999 || ($c === 0 && !$permitirCero)) {
        return null;
    }
    return pedido_decimal($c);
}

/** Fecha AAAA-MM-DD válida de verdad o null. */
function cupon_fecha($valor): ?string
{
    if (!is_string($valor)) {
        return null;
    }
    $v = trim($valor);
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
    if ($d === false || $d->format('Y-m-d') !== $v || $d->format('Y') < '2020' || $d->format('Y') > '2100') {
        return null;
    }
    return $v;
}

/** Código en MAYÚSCULAS (A-Z 0-9 _ -), 3 a 20 caracteres; null si no es válido. */
function cupon_codigo($valor): ?string
{
    if (!is_string($valor)) {
        return null;
    }
    $c = strtoupper(trim($valor));
    return preg_match('/^[A-Z0-9_-]{3,20}$/', $c) === 1 ? $c : null;
}

/**
 * Valida el cuerpo JSON de alta/edición. Devuelve [datos, errores]. $conCodigo: en la edición el código no se cambia.
 */
function cupon_validar(array $j, bool $conCodigo): array
{
    $e = [];
    $d = [];
    if ($conCodigo) {
        $d['codigo'] = cupon_codigo($j['codigo'] ?? null);
        if ($d['codigo'] === null) {
            $e['codigo'] = 'Código de 3 a 20 caracteres: letras, números, guion o guion bajo.';
        }
    }
    $desc = prod_texto($j['descripcion'] ?? null);
    if ($desc === null || largo_texto($desc) < 3 || largo_texto($desc) > 200) {
        $e['descripcion'] = 'La descripción es obligatoria (3 a 200 caracteres).';
    }
    $d['descripcion'] = $desc;

    $tipo = isset($j['tipo']) && is_string($j['tipo']) ? $j['tipo'] : '';
    if (!in_array($tipo, CUPON_TIPOS, true)) {
        $e['tipo'] = 'Elige porcentaje o monto fijo.';
    }
    $d['tipo'] = $tipo;

    $valor = cupon_monto($j['valor'] ?? null, false);
    if ($valor === null) {
        $e['valor'] = 'Escribe un valor mayor a 0 (máximo dos decimales).';
    } elseif ($tipo === 'porcentaje' && pedido_centavos($valor) > 10000) {
        $e['valor'] = 'El porcentaje no puede ser mayor a 100.';
    }
    $d['valor'] = $valor;

    $min = array_key_exists('compra_minima', $j) && $j['compra_minima'] !== null && $j['compra_minima'] !== '' ? cupon_monto($j['compra_minima'], true) : '0.00';
    if ($min === null) {
        $e['compra_minima'] = 'Compra mínima no válida (0 o un importe con máximo dos decimales).';
    }
    $d['compra_minima'] = $min;

    $tope = null;
    if (isset($j['tope_descuento']) && $j['tope_descuento'] !== null && $j['tope_descuento'] !== '') {
        $tope = cupon_monto($j['tope_descuento'], false);
        if ($tope === null) {
            $e['tope_descuento'] = 'Tope no válido (mayor a 0, máximo dos decimales).';
        } elseif ($tipo !== 'porcentaje') {
            $e['tope_descuento'] = 'El tope solo aplica a cupones de porcentaje.';
        }
    }
    $d['tope_descuento'] = $tope;

    $usos = null;
    if (isset($j['usos_maximos']) && $j['usos_maximos'] !== null && $j['usos_maximos'] !== '') {
        $usos = admin_entero($j['usos_maximos'], 1, CUPON_MAX_USOS);
        if ($usos === null) {
            $e['usos_maximos'] = 'Usos máximos: un entero entre 1 y ' . CUPON_MAX_USOS . '.';
        }
    }
    $d['usos_maximos'] = $usos;

    $ini = null;
    $fin = null;
    if (isset($j['inicia']) && $j['inicia'] !== null && $j['inicia'] !== '') {
        $ini = cupon_fecha($j['inicia']);
        if ($ini === null) {
            $e['inicia'] = 'Fecha de inicio no válida (AAAA-MM-DD).';
        }
    }
    if (isset($j['termina']) && $j['termina'] !== null && $j['termina'] !== '') {
        $fin = cupon_fecha($j['termina']);
        if ($fin === null) {
            $e['termina'] = 'Fecha de fin no válida (AAAA-MM-DD).';
        }
    }
    if ($ini !== null && $fin !== null && $fin < $ini) {
        $e['termina'] = 'La fecha de fin no puede ser anterior a la de inicio.';
    }
    $d['inicia_en'] = $ini !== null ? $ini . ' 00:00:00' : null;
    $d['termina_en'] = $fin !== null ? $fin . ' 23:59:59' : null;

    if (isset($j['activo']) && !is_bool($j['activo'])) {
        $e['activo'] = 'Valor no válido.';
    }
    $d['activo'] = isset($j['activo']) && $j['activo'] === false ? 0 : 1;
    return [$d, $e];
}

/* ===================== Cupones: lectura ===================== */

function cupon_estado_de(array $f, string $ahora): string
{
    if ((int) $f['activo'] !== 1) {
        return 'inactivo';
    }
    if ($f['inicia_en'] !== null && $ahora < (string) $f['inicia_en']) {
        return 'programado';
    }
    if ($f['termina_en'] !== null && $ahora > (string) $f['termina_en']) {
        return 'vencido';
    }
    return 'vigente';
}

function cupon_formatear(array $f, string $ahora): array
{
    return [
        'id'             => (int) $f['id'],
        'codigo'         => (string) $f['codigo'],
        'descripcion'    => (string) $f['descripcion'],
        'tipo'           => (string) $f['tipo'],
        'valor'          => (float) $f['valor'],
        'compra_minima'  => (float) $f['compra_minima'],
        'tope_descuento' => $f['tope_descuento'] !== null ? (float) $f['tope_descuento'] : null,
        'usos_maximos'   => $f['usos_maximos'] !== null ? (int) $f['usos_maximos'] : null,
        'usos_registrados' => 0,   // los cupones todavía no se aplican a compras
        'inicia'         => $f['inicia_en'] !== null ? substr((string) $f['inicia_en'], 0, 10) : null,
        'termina'        => $f['termina_en'] !== null ? substr((string) $f['termina_en'], 0, 10) : null,
        'activo'         => (int) $f['activo'] === 1,
        'estado'         => cupon_estado_de($f, $ahora),
    ];
}

const CUPON_COLUMNAS = 'id, codigo, descripcion, tipo, valor, compra_minima, tope_descuento, usos_maximos, inicia_en, termina_en, activo';

function cupon_ahora(PDO $pdo): string
{
    return (string) $pdo->query('SELECT NOW()')->fetchColumn();
}

function cupones_listar(PDO $pdo, string $q, string $estado, int $pagina): array
{
    $donde = [];
    $params = [];
    if ($q !== '') {
        $donde[] = "(codigo LIKE :q1 ESCAPE '\\\\' OR descripcion LIKE :q2 ESCAPE '\\\\')";
        $params[':q1'] = admin_like($q);
        $params[':q2'] = admin_like($q);
    }
    $cond = [
        'inactivo'   => 'activo = 0',
        'programado' => 'activo = 1 AND inicia_en IS NOT NULL AND inicia_en > NOW()',
        'vencido'    => 'activo = 1 AND termina_en IS NOT NULL AND termina_en < NOW()',
        'vigente'    => 'activo = 1 AND (inicia_en IS NULL OR inicia_en <= NOW()) AND (termina_en IS NULL OR termina_en >= NOW())',
    ];
    if ($estado !== '') {
        $donde[] = '(' . $cond[$estado] . ')';
    }
    $sqlDonde = $donde === [] ? '' : 'WHERE ' . implode(' AND ', $donde);

    $contar = $pdo->prepare("SELECT COUNT(*) FROM cupones $sqlDonde");
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare('SELECT ' . CUPON_COLUMNAS . " FROM cupones $sqlDonde ORDER BY id DESC LIMIT :lim OFFSET :off");
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();
    $ahora = cupon_ahora($pdo);

    $conteos = array_fill_keys(CUPON_ESTADOS, 0);
    foreach ($pdo->query('SELECT ' . CUPON_COLUMNAS . ' FROM cupones')->fetchAll() as $f) {
        $conteos[cupon_estado_de($f, $ahora)]++;
    }
    return [
        'pagina' => $pagina, 'paginas' => $paginas, 'total' => $total, 'por_pagina' => ADMIN_POR_PAGINA, 'conteos' => $conteos,
        'cupones' => array_map(static fn (array $f): array => cupon_formatear($f, $ahora), $lista->fetchAll()),
    ];
}

function cupon_por_id(PDO $pdo, int $id, bool $bloquear = false): ?array
{
    $s = $pdo->prepare('SELECT ' . CUPON_COLUMNAS . ' FROM cupones WHERE id = :id' . ($bloquear ? ' FOR UPDATE' : ''));
    $s->execute([':id' => $id]);
    $f = $s->fetch();
    return $f === false ? null : $f;
}

/* ===================== Cupones: escritura ===================== */

function cupon_crear(PDO $pdo, array $admin, array $d): array
{
    $pdo->beginTransaction();
    try {
        $i = $pdo->prepare(
            'INSERT INTO cupones (codigo, descripcion, tipo, valor, compra_minima, tope_descuento, usos_maximos, inicia_en, termina_en, activo, creado_por)
             VALUES (:codigo, :descripcion, :tipo, :valor, :minima, :tope, :usos, :inicia, :termina, :activo, :creador)'
        );
        $i->execute([
            ':codigo' => $d['codigo'], ':descripcion' => $d['descripcion'], ':tipo' => $d['tipo'], ':valor' => $d['valor'],
            ':minima' => $d['compra_minima'], ':tope' => $d['tope_descuento'], ':usos' => $d['usos_maximos'],
            ':inicia' => $d['inicia_en'], ':termina' => $d['termina_en'], ':activo' => $d['activo'], ':creador' => $admin['id'],
        ]);
        $id = (int) $pdo->lastInsertId();
        admin_auditar($pdo, $admin['id'], 'cupon_creado', 'cupon', $id,
            sprintf('%s | %s %s | min=%s | tope=%s', $d['codigo'], $d['tipo'], $d['valor'], $d['compra_minima'], $d['tope_descuento'] ?? '-'));
        $pdo->commit();
        return cupon_formatear(cupon_por_id($pdo, $id) ?? [], cupon_ahora($pdo));
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($e instanceof PDOException && errno_de_pdo($e) === 1062) {
            responder_error('validacion', 'Ya existe un cupón con ese código.', 422, null, ['errores' => ['codigo' => 'Ya existe un cupón con ese código.']]);
        }
        throw $e;
    }
}

function cupon_editar(PDO $pdo, array $admin, int $id, array $d): array
{
    $pdo->beginTransaction();
    try {
        $antes = cupon_por_id($pdo, $id, true);
        if ($antes === null) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese cupón.', 404);
        }
        $u = $pdo->prepare(
            'UPDATE cupones SET descripcion = :descripcion, tipo = :tipo, valor = :valor, compra_minima = :minima, tope_descuento = :tope,
                    usos_maximos = :usos, inicia_en = :inicia, termina_en = :termina, activo = :activo WHERE id = :id'
        );
        $u->execute([
            ':descripcion' => $d['descripcion'], ':tipo' => $d['tipo'], ':valor' => $d['valor'], ':minima' => $d['compra_minima'],
            ':tope' => $d['tope_descuento'], ':usos' => $d['usos_maximos'], ':inicia' => $d['inicia_en'], ':termina' => $d['termina_en'],
            ':activo' => $d['activo'], ':id' => $id,
        ]);
        admin_auditar($pdo, $admin['id'], 'cupon_editado', 'cupon', $id,
            sprintf('%s | antes: %s %s min=%s tope=%s | despues: %s %s min=%s tope=%s', $antes['codigo'], $antes['tipo'], $antes['valor'], $antes['compra_minima'],
                $antes['tope_descuento'] ?? '-', $d['tipo'], $d['valor'], $d['compra_minima'], $d['tope_descuento'] ?? '-'));
        $pdo->commit();
        return cupon_formatear(cupon_por_id($pdo, $id) ?? [], cupon_ahora($pdo));
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function cupon_cambiar_estado(PDO $pdo, array $admin, int $id, bool $activo): array
{
    $pdo->beginTransaction();
    try {
        $c = cupon_por_id($pdo, $id, true);
        if ($c === null) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese cupón.', 404);
        }
        if (((int) $c['activo'] === 1) !== $activo) {
            $pdo->prepare('UPDATE cupones SET activo = :a WHERE id = :id')->execute([':a' => $activo ? 1 : 0, ':id' => $id]);
            admin_auditar($pdo, $admin['id'], $activo ? 'cupon_activado' : 'cupon_desactivado', 'cupon', $id, (string) $c['codigo']);
        }
        $pdo->commit();
        return cupon_formatear(cupon_por_id($pdo, $id) ?? [], cupon_ahora($pdo));
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/* ===================== Simulador (función pura en centavos) ===================== */

/**
 * Calcula, SIN aplicar a nada, el descuento que daría un cupón sobre un subtotal.
 * @param array  $c            fila de cupones
 * @param int    $subtotalCent subtotal en centavos (antes de IVA y envío)
 * @param string $ahora        'AAAA-MM-DD HH:MM:SS'
 * @return array{valido:bool,motivo:?string,descuento_cent:int,subtotal_con_descuento_cent:int}
 */
function cupon_calcular(array $c, int $subtotalCent, string $ahora): array
{
    $rechazo = static fn (string $m): array => ['valido' => false, 'motivo' => $m, 'descuento_cent' => 0, 'subtotal_con_descuento_cent' => $subtotalCent];
    $estado = cupon_estado_de($c, $ahora);
    if ($estado === 'inactivo') {
        return $rechazo('El cupón está inactivo.');
    }
    if ($estado === 'programado') {
        return $rechazo('El cupón todavía no está vigente (inicia el ' . substr((string) $c['inicia_en'], 0, 10) . ').');
    }
    if ($estado === 'vencido') {
        return $rechazo('El cupón venció el ' . substr((string) $c['termina_en'], 0, 10) . '.');
    }
    $minima = pedido_centavos((string) $c['compra_minima']);
    if ($subtotalCent < $minima) {
        return $rechazo('El subtotal no alcanza la compra mínima de ' . pedido_decimal($minima) . ' MXN.');
    }
    $valorCent = pedido_centavos((string) $c['valor']);
    if ($c['tipo'] === 'porcentaje') {
        $desc = intdiv($subtotalCent * $valorCent + 5000, 10000);   // redondeo al centavo más cercano
        if ($c['tope_descuento'] !== null) {
            $desc = min($desc, pedido_centavos((string) $c['tope_descuento']));
        }
    } else {
        $desc = $valorCent;
    }
    $desc = max(0, min($desc, $subtotalCent));   // nunca más que el subtotal
    return ['valido' => true, 'motivo' => null, 'descuento_cent' => $desc, 'subtotal_con_descuento_cent' => $subtotalCent - $desc];
}

/* ===================== Ofertas de producto (precio anterior) ===================== */

function oferta_estado_de(array $f): string
{
    $enOferta = (int) $f['en_oferta'] === 1;
    $tieneAnt = $f['precio_anterior'] !== null;
    if ($enOferta && $tieneAnt && pedido_centavos((string) $f['precio_anterior']) > pedido_centavos((string) $f['precio'])) {
        return 'ok';
    }
    if ($enOferta) {
        return 'incompleta';
    }
    return $tieneAnt ? 'huerfana' : 'sin_oferta';
}

function oferta_formatear(array $f): array
{
    $precio = pedido_centavos((string) $f['precio']);
    $ant = $f['precio_anterior'] !== null ? pedido_centavos((string) $f['precio_anterior']) : null;
    $estado = oferta_estado_de($f);
    return [
        'id' => (int) $f['id'], 'codigo' => (string) $f['codigo'], 'nombre' => (string) $f['nombre'], 'marca' => (string) $f['marca'],
        'precio' => pedido_pesos($precio), 'precio_anterior' => $ant !== null ? pedido_pesos($ant) : null,
        'en_oferta' => (int) $f['en_oferta'] === 1, 'activo' => (int) $f['activo'] === 1,
        'descuento_pct' => ($estado === 'ok' && $ant !== null) ? (int) round((1 - $precio / $ant) * 100) : null,
        'estado' => $estado,
    ];
}

const OFERTA_SELECT = 'SELECT p.id, p.codigo, p.nombre, m.nombre AS marca, p.precio, p.precio_anterior, p.en_oferta, p.activo
                         FROM productos p JOIN marcas m ON m.id = p.marca_id';

function ofertas_listar(PDO $pdo, string $q, string $estado, int $pagina): array
{
    $donde = [];
    $params = [];
    if ($q !== '') {
        $donde[] = "(p.nombre LIKE :q1 ESCAPE '\\\\' OR p.codigo LIKE :q2 ESCAPE '\\\\')";
        $params[':q1'] = admin_like($q);
        $params[':q2'] = admin_like($q);
    }
    $cond = [
        'ok'         => 'p.en_oferta = 1 AND p.precio_anterior IS NOT NULL AND p.precio_anterior > p.precio',
        'incompleta' => 'p.en_oferta = 1 AND (p.precio_anterior IS NULL OR p.precio_anterior <= p.precio)',
        'huerfana'   => 'p.en_oferta = 0 AND p.precio_anterior IS NOT NULL',
        'sin_oferta' => 'p.en_oferta = 0 AND p.precio_anterior IS NULL',
    ];
    if ($estado !== '') {
        $donde[] = '(' . $cond[$estado] . ')';
    }
    $sqlDonde = $donde === [] ? '' : 'WHERE ' . implode(' AND ', $donde);
    $contar = $pdo->prepare("SELECT COUNT(*) FROM productos p $sqlDonde");
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);
    $lista = $pdo->prepare(OFERTA_SELECT . " $sqlDonde ORDER BY p.id LIMIT :lim OFFSET :off");
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    $conteos = array_fill_keys(OFERTA_ESTADOS, 0);
    foreach ($pdo->query(OFERTA_SELECT)->fetchAll() as $f) {
        $conteos[oferta_estado_de($f)]++;
    }
    return ['pagina' => $pagina, 'paginas' => $paginas, 'total' => $total, 'por_pagina' => ADMIN_POR_PAGINA, 'conteos' => $conteos,
            'productos' => array_map('oferta_formatear', $lista->fetchAll())];
}

/**
 * Fija o quita la oferta de un producto. $anterior = null  =>  quitar oferta (en_oferta = 0 y precio_anterior = NULL).
 * Con oferta: precio_anterior debe ser MAYOR que el precio actual (se valida contra el precio vigente, dentro de la transacción).
 * Nunca modifica productos.precio, existencias, estado ni pedidos.
 */
function oferta_guardar(PDO $pdo, array $admin, int $productoId, ?string $anterior): array
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare(OFERTA_SELECT . ' WHERE p.id = :id FOR UPDATE');
        $s->execute([':id' => $productoId]);
        $antes = $s->fetch();
        if ($antes === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese producto.', 404);
        }
        if ($anterior !== null && pedido_centavos($anterior) <= pedido_centavos((string) $antes['precio'])) {
            $pdo->rollBack();
            responder_error('validacion', 'El precio anterior debe ser mayor al precio actual (' . $antes['precio'] . ').', 422,
                null, ['errores' => ['precio_anterior' => 'Debe ser mayor al precio actual de ' . $antes['precio'] . ' MXN.']]);
        }
        $pdo->prepare('UPDATE productos SET precio_anterior = :a, en_oferta = :o WHERE id = :id')
            ->execute([':a' => $anterior, ':o' => $anterior === null ? 0 : 1, ':id' => $productoId]);
        admin_auditar($pdo, $admin['id'], $anterior === null ? 'oferta_quitada' : 'oferta_guardada', 'producto', $productoId,
            sprintf('%s | precio=%s | precio_anterior %s -> %s | en_oferta %d -> %d', $antes['codigo'], $antes['precio'],
                $antes['precio_anterior'] ?? '-', $anterior ?? '-', (int) $antes['en_oferta'], $anterior === null ? 0 : 1));
        $pdo->commit();
        $s2 = $pdo->prepare(OFERTA_SELECT . ' WHERE p.id = :id');
        $s2->execute([':id' => $productoId]);
        return oferta_formatear($s2->fetch());
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

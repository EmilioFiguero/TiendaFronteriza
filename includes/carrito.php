<?php
declare(strict_types=1);

/**
 * Carrito de compras en MariaDB (tablas `carritos` y `detalle_carrito`).
 *
 * Reglas de seguridad:
 *  - El usuario SIEMPRE sale de la sesión PHP. Ningún endpoint acepta un
 *    usuario_id ni un carrito_id del navegador: nadie puede tocar el carrito de otra persona.
 *  - El navegador nunca envía precios. Precio, stock y estado "activo" se leen de `productos`.
 *  - Todas las consultas son preparadas (PDO). Las escrituras corren en transacción
 *    con el carrito bloqueado (FOR UPDATE): dos pestañas o dos clics se ponen en fila.
 *  - Las operaciones son ABSOLUTAS ("deja el producto X en N unidades" / "quita X"),
 *    así que repetir una solicitud no duplica nada.
 */

require_once __DIR__ . '/catalogo.php';

const CARRITO_MAX_LINEAS      = 50;   // productos distintos por carrito
const CARRITO_MAX_CANTIDAD    = 99;   // unidades por línea
const CARRITO_MAX_CAMBIOS     = 50;   // cambios por solicitud
const CARRITO_LIM_VENTANA     = 60;   // segundos
const CARRITO_LIM_ESCRITURAS  = 120;  // solicitudes de escritura por usuario en la ventana

/** Usuario autenticado o 401. Cierra la sesión PHP para no bloquear otras solicitudes. */
function carrito_exigir_usuario(PDO $pdo): array
{
    $usuario = usuario_autenticado($pdo);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    if ($usuario === null) {
        responder_error('no_autenticado', 'Inicia sesión para usar el carrito de tu cuenta.', 401);
    }
    return $usuario;
}

/**
 * El navegador indica de qué cuenta cree que es el carrito ("usuario_esperado").
 * Si la sesión actual es de OTRA cuenta (p. ej. se inició sesión con otro usuario en otra pestaña),
 * se rechaza con 409 y NO se escribe nada: los carritos de dos usuarios nunca se mezclan.
 */
function carrito_verificar_usuario_esperado(array $datos, array $usuario): void
{
    $esperado = carrito_entero($datos['usuario_esperado'] ?? null, 1, 2147483647);
    if ($esperado === null) {
        responder_error('validacion', 'Datos del carrito no válidos.', 422);
    }
    if ($esperado !== $usuario['id']) {
        responder_error('usuario_distinto', 'Tu sesión cambió. Se volverá a cargar el carrito de tu cuenta actual.', 409);
    }
}

/** Limita las escrituras por usuario (archivos en storage/limites, sin tocar la BD). */
function carrito_limitar_escrituras(int $usuarioId): void
{
    $clave = 'carrito|' . $usuarioId;
    $espera = limitador_bloqueado($clave, CARRITO_LIM_VENTANA, CARRITO_LIM_ESCRITURAS);
    if ($espera > 0) {
        responder_limite($espera);
    }
    limitador_registrar($clave, CARRITO_LIM_VENTANA);
}

/** Entero estricto dentro de un rango (rechaza texto, decimales y booleanos). */
function carrito_entero($valor, int $min, int $max): ?int
{
    if (!is_int($valor) || $valor < $min || $valor > $max) {
        return null;
    }
    return $valor;
}

/** id del carrito del usuario (lo crea si hace falta y $crear = true). */
function carrito_id_usuario(PDO $pdo, int $usuarioId, bool $crear): ?int
{
    $buscar = $pdo->prepare('SELECT id FROM carritos WHERE usuario_id = :u');
    $buscar->execute([':u' => $usuarioId]);
    $id = $buscar->fetchColumn();
    if ($id !== false) {
        return (int) $id;
    }
    if (!$crear) {
        return null;
    }
    // INSERT IGNORE: si otra solicitud lo creó al mismo tiempo, UNIQUE(usuario_id) evita el duplicado.
    $pdo->prepare('INSERT IGNORE INTO carritos (usuario_id) VALUES (:u)')->execute([':u' => $usuarioId]);
    $buscar->execute([':u' => $usuarioId]);
    $id = $buscar->fetchColumn();
    if ($id === false) {
        throw new RuntimeException('No se pudo crear el carrito.');
    }
    return (int) $id;
}

/** Bloquea la fila del carrito hasta terminar la transacción. */
function carrito_bloquear(PDO $pdo, int $carritoId): void
{
    $bloquear = $pdo->prepare('SELECT id FROM carritos WHERE id = :c FOR UPDATE');
    $bloquear->execute([':c' => $carritoId]);
}

/** Líneas actuales: codigo => ['pid' => id interno, 'q' => cantidad] (incluye productos inactivos). */
function carrito_lineas(PDO $pdo, int $carritoId): array
{
    $consulta = $pdo->prepare(
        'SELECT p.codigo, p.id AS pid, dc.cantidad
           FROM detalle_carrito dc
           JOIN productos p ON p.id = dc.producto_id
          WHERE dc.carrito_id = :c
          ORDER BY dc.id ASC'
    );
    $consulta->execute([':c' => $carritoId]);
    $lineas = [];
    foreach ($consulta->fetchAll() as $fila) {
        $lineas[(string) $fila['codigo']] = ['pid' => (int) $fila['pid'], 'q' => (int) $fila['cantidad']];
    }
    return $lineas;
}

/** Datos mínimos de varios productos por código: codigo => [pid, stock, activo]. */
function carrito_productos_por_codigo(PDO $pdo, array $codigos): array
{
    $codigos = array_values(array_unique($codigos));
    if ($codigos === []) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($codigos), '?'));
    $consulta = $pdo->prepare("SELECT id, codigo, stock, activo FROM productos WHERE codigo IN ($marcas)");
    $consulta->execute($codigos);
    $mapa = [];
    foreach ($consulta->fetchAll() as $fila) {
        $mapa[(string) $fila['codigo']] = [
            'pid'    => (int) $fila['id'],
            'stock'  => (int) $fila['stock'],
            'activo' => (int) $fila['activo'] === 1,
        ];
    }
    return $mapa;
}

/**
 * Carrito listo para el navegador: cada línea trae la cantidad guardada y el producto
 * con precio y stock ACTUALES de MariaDB (mismo formato que api/productos.php).
 * Los productos desactivados no se muestran (la línea no se borra).
 */
function carrito_leer(PDO $pdo, ?int $carritoId): array
{
    if ($carritoId === null) {
        return ['items' => []];
    }
    $consulta = $pdo->prepare(
        'SELECT p.codigo, dc.cantidad
           FROM detalle_carrito dc
           JOIN productos p ON p.id = dc.producto_id
          WHERE dc.carrito_id = :c AND p.activo = 1
          ORDER BY dc.id ASC'
    );
    $consulta->execute([':c' => $carritoId]);
    $lineas = $consulta->fetchAll();
    if ($lineas === []) {
        return ['items' => []];
    }

    $codigos = array_map(static fn(array $l): string => (string) $l['codigo'], $lineas);
    $marcas = implode(',', array_fill(0, count($codigos), '?'));
    $productos = $pdo->prepare(catalogo_select_base() . " WHERE p.codigo IN ($marcas)");
    $productos->execute($codigos);
    $formateados = [];
    foreach ($productos->fetchAll() as $fila) {
        $formateados[(string) $fila['codigo']] = catalogo_formatear($fila);
    }

    $items = [];
    foreach ($lineas as $linea) {
        $codigo = (string) $linea['codigo'];
        if (!isset($formateados[$codigo])) {
            continue;
        }
        $cantidad = (int) $linea['cantidad'];
        $items[] = [
            'codigo'        => $codigo,
            'cantidad'      => $cantidad,
            'excede_stock'  => $cantidad > $formateados[$codigo]['stock'],
            'producto'      => $formateados[$codigo],
        ];
    }
    return ['items' => $items];
}

/** Inserta o actualiza una línea (UNIQUE carrito+producto: nunca se duplica). */
function carrito_guardar_linea(PDO $pdo, int $carritoId, int $productoId, int $cantidad): void
{
    $pdo->prepare(
        'INSERT INTO detalle_carrito (carrito_id, producto_id, cantidad) VALUES (:c, :p, :q)
         ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)'
    )->execute([':c' => $carritoId, ':p' => $productoId, ':q' => $cantidad]);
}

function carrito_borrar_linea(PDO $pdo, int $carritoId, int $productoId): void
{
    $pdo->prepare('DELETE FROM detalle_carrito WHERE carrito_id = :c AND producto_id = :p')
        ->execute([':c' => $carritoId, ':p' => $productoId]);
}

function carrito_tocar(PDO $pdo, int $carritoId): void
{
    $pdo->prepare('UPDATE carritos SET actualizado_en = NOW() WHERE id = :c')->execute([':c' => $carritoId]);
}

/** Valida un código de producto recibido del navegador. */
function carrito_codigo($valor): ?string
{
    if (!is_string($valor) || !catalogo_codigo_valido($valor)) {
        return null;
    }
    return $valor;
}

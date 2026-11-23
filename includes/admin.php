<?php
declare(strict_types=1);

/**
 * Autorización administrativa y auditoría (Fase 3.6.1).
 *
 * Cada endpoint de api/admin/ pasa por admin_endpoint(), que en el SERVIDOR:
 *   1) acepta solo el método HTTP permitido, y en POST verifica el origen;
 *   2) exige sesión (401 si no hay);
 *   3) lee el rol DE MARIADB en cada solicitud (nunca de la sesión ni del navegador):
 *      si no es 'admin' responde 403, así retirar el rol revoca el acceso de inmediato;
 *   4) en POST exige el token CSRF;
 *   5) limita las solicitudes por administrador.
 * Nada de esto depende de que el JavaScript oculte botones.
 */

require_once __DIR__ . '/api.php';
require_once __DIR__ . '/roles.php';
require_once __DIR__ . '/pedidos.php';   // solo para sus utilidades de importes (pedido_centavos / pedido_pesos)

const ADMIN_LIM_VENTANA     = 60;    // segundos
const ADMIN_LIM_SOLICITUDES = 300;   // por administrador y ventana
const ADMIN_POR_PAGINA      = 15;
const ADMIN_STOCK_BAJO      = 2;     // valor por omisión; desde 3.6.2 se configura en el panel (tabla configuracion_tienda)

/** Estados de pedido que cuentan como «venta simulada». «pendiente» y «cancelado» NO son ventas. */
const ADMIN_ESTADOS_VENTA = ['pagado', 'preparado', 'enviado', 'entregado'];
const ADMIN_ESTADOS_TODOS = ['pendiente', 'pagado', 'preparado', 'enviado', 'entregado', 'cancelado'];

/**
 * Plantilla de todos los endpoints administrativos.
 * @param callable(PDO,array):void $accion  recibe la conexión y el administrador autenticado; debe responder.
 */
function admin_endpoint(string $metodo, callable $accion): void
{
    solo_metodo($metodo);
    if ($metodo !== 'GET') {
        verificar_origen();
    }

    try {
        iniciar_sesion_segura();
        $pdo = obtener_conexion();
        $admin = admin_exigir($pdo, $metodo !== 'GET');
        $accion($pdo, $admin);
    } catch (Throwable $e) {
        // Tabla inexistente (1146): falta aplicar una migración. Respuesta clara en vez de un error genérico.
        if ($e instanceof PDOException && errno_de_pdo($e) === 1146) {
            registrar_log(generar_referencia(), 'migracion_pendiente', substr($e->getMessage(), 0, 200));
            responder_error('migracion_pendiente', 'Falta aplicar una migración de la base de datos (ver LEEME.txt de la fase instalada).', 503);
        }
        manejar_fallo($e);
    }
}

/** Comprueba sesión + rol (+ CSRF en escritura). Responde 401/403/503/429 y termina si no procede. */
function admin_exigir(PDO $pdo, bool $escritura): array
{
    $usuario = usuario_autenticado($pdo);
    if ($usuario === null) {
        session_write_close();
        responder_error('no_autenticado', 'Inicia sesión para continuar.', 401);
    }

    try {
        $consulta = $pdo->prepare('SELECT rol FROM usuarios WHERE id = :id');
        $consulta->execute([':id' => $usuario['id']]);
        $rol = $consulta->fetchColumn();
    } catch (PDOException $e) {
        if (errno_de_pdo($e) === 1054) {
            session_write_close();
            responder_error(
                'migracion_pendiente',
                'Falta aplicar la migración A de la Fase 3.6.1 en la base de datos (ver LEEME.txt).',
                503
            );
        }
        throw $e;
    }

    if ($rol !== ROL_ADMIN) {
        // Se anota el intento (sin datos sensibles) para poder revisarlo después.
        registrar_log(generar_referencia(), 'admin_denegado', sprintf(
            'usuario=%d metodo=%s ruta=%s',
            $usuario['id'],
            (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
            basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''))
        ));
        session_write_close();
        responder_error('sin_permiso', 'No tienes permiso para realizar esta operación.', 403);
    }

    if ($escritura) {
        exigir_csrf();
    }
    session_write_close();   // libera el archivo de sesión: el resto de la solicitud no lo necesita

    $clave = 'admin|' . $usuario['id'];
    $espera = limitador_bloqueado($clave, ADMIN_LIM_VENTANA, ADMIN_LIM_SOLICITUDES);
    if ($espera > 0) {
        responder_limite($espera);
    }
    limitador_registrar($clave, ADMIN_LIM_VENTANA);

    $usuario['rol'] = ROL_ADMIN;
    return $usuario;
}

/**
 * Registra una operación administrativa. Se llama DENTRO de la misma transacción que el cambio,
 * de modo que no puede existir un cambio sin su registro ni al revés.
 * No guardar aquí contraseñas, tokens ni datos que no hagan falta.
 *
 * @param int|string|null $entidadId
 */
function admin_auditar(PDO $pdo, ?int $adminId, string $accion, string $entidad, $entidadId, string $detalle = ''): void
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? substr((string) $_SERVER['REMOTE_ADDR'], 0, 45) : null;   // sin confiar en cabeceras proxy
    $insertar = $pdo->prepare(
        'INSERT INTO auditoria_admin (admin_id, accion, entidad, entidad_id, detalle, ip)
         VALUES (:admin, :accion, :entidad, :entidad_id, :detalle, :ip)'
    );
    $insertar->execute([
        ':admin'      => $adminId,
        ':accion'     => substr($accion, 0, 50),
        ':entidad'    => substr($entidad, 0, 40),
        ':entidad_id' => $entidadId === null ? null : substr((string) $entidadId, 0, 40),
        ':detalle'    => $detalle === '' ? null : mb_substr($detalle, 0, 500),
        ':ip'         => $ip,
    ]);
}

/** Entero positivo de la URL o del JSON (rechaza texto, decimales y negativos). */
function admin_entero($valor, int $min = 1, int $max = 2147483647): ?int
{
    if (is_int($valor)) {
        $n = $valor;
    } elseif (is_string($valor) && preg_match('/^[0-9]{1,10}$/', $valor) === 1) {
        $n = (int) $valor;
    } else {
        return null;
    }
    return ($n >= $min && $n <= $max) ? $n : null;
}

/** Página solicitada (?pagina=). 422 si no es un entero válido. */
function admin_pagina(): int
{
    if (!isset($_GET['pagina'])) {
        return 1;
    }
    $p = admin_entero(is_string($_GET['pagina']) ? $_GET['pagina'] : null, 1, 1000000);
    if ($p === null) {
        responder_error('validacion', 'Número de página no válido.', 422);
    }
    return $p;
}

/** Texto de búsqueda (?q=) ya limpio, máx. 80 caracteres. */
function admin_texto_get(string $nombre, int $max = 80): string
{
    $v = isset($_GET[$nombre]) && is_string($_GET[$nombre]) ? trim($_GET[$nombre]) : '';
    $v = preg_replace('/[\x00-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

/** Valor de ?nombre= que debe estar en una lista blanca; '' si no viene. 422 si trae algo distinto. */
function admin_opcion_get(string $nombre, array $permitidos): string
{
    $v = isset($_GET[$nombre]) && is_string($_GET[$nombre]) ? $_GET[$nombre] : '';
    if ($v !== '' && !in_array($v, $permitidos, true)) {
        responder_error('validacion', 'Filtro no válido: ' . $nombre . '.', 422);
    }
    return $v;
}

/** Escapa % _ \ para usar el texto dentro de un LIKE ... ESCAPE '\'. */
function admin_like(string $texto): string
{
    return '%' . addcslashes($texto, '%_\\') . '%';
}

/**
 * Umbral de stock bajo configurado (1..100). Si la migración B aún no existe o el valor no es válido,
 * usa el valor por omisión (2): así el resumen nunca se rompe.
 */
function admin_umbral_stock(PDO $pdo): int
{
    try {
        $c = $pdo->prepare("SELECT valor FROM configuracion_tienda WHERE clave = 'umbral_stock_bajo'");
        $c->execute();
        $v = $c->fetchColumn();
    } catch (PDOException $e) {
        if (errno_de_pdo($e) === 1146) {   // tabla inexistente
            return ADMIN_STOCK_BAJO;
        }
        throw $e;
    }
    $n = is_string($v) ? admin_entero($v, 1, 100) : null;
    return $n ?? ADMIN_STOCK_BAJO;
}

/** Id opcional de la URL (?categoria=3). null si no viene; 422 si no es un entero válido. */
function admin_id_get(string $nombre): ?int
{
    if (!isset($_GET[$nombre]) || $_GET[$nombre] === '') {
        return null;
    }
    $n = admin_entero(is_string($_GET[$nombre]) ? $_GET[$nombre] : null);
    if ($n === null) {
        responder_error('validacion', 'Filtro no válido: ' . $nombre . '.', 422);
    }
    return $n;
}

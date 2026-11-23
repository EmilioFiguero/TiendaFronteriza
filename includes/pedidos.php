<?php
declare(strict_types=1);

/**
 * Pedidos (Fase 3.5): registro de compras, existencias e historial.
 * Tablas: `pedidos`, `detalle_pedidos` (+ `productos`, `carritos`, `detalle_carrito`).
 *
 * El pago y el envío son SIMULACIONES académicas: no se conecta ningún banco,
 * ninguna tarjeta ni ninguna paquetería, y no se guarda ningún dato bancario.
 *
 * Reglas de seguridad:
 *  - El usuario sale SIEMPRE de la sesión PHP. Ningún endpoint acepta usuario_id.
 *  - El navegador solo envía datos de envío, método de pago y una clave de operación.
 *    Productos, cantidades, precios, existencias, impuestos y envío se leen/calculan aquí.
 *  - Todo el registro ocurre en UNA transacción: pedido, detalle, existencias y vaciado del carrito.
 *  - Importes en centavos enteros (nunca flotantes) para que total = subtotal + impuestos + envío exacto.
 */

require_once __DIR__ . '/carrito.php';
require_once __DIR__ . '/inventario.php';   // Fase 3.6.2: movimiento de salida por venta
require_once __DIR__ . '/politicas.php';    // Etapa 2: aceptación de políticas en el checkout

const PEDIDO_TASA_IVA_MILESIMAS = 160;            // 16.0 % -> tasa_impuesto 0.1600
const PEDIDO_ENVIO_GRATIS_DESDE = 150000;         // $1,500.00 (centavos), sobre el subtotal
const PEDIDO_ZONA_GRATIS        = 'Envío gratis (promoción simulada)';
const PEDIDO_LIM_VENTANA        = 60;             // segundos
const PEDIDO_LIM_INTENTOS       = 10;             // solicitudes de compra por usuario en la ventana
const PEDIDO_REINTENTOS_BD      = 3;              // deadlock / tiempo de espera de bloqueo
const PEDIDO_POR_PAGINA         = 10;

/** Rechazo de negocio (no es un fallo del servidor): se responde con su código HTTP y se revierte todo. */
class PedidoRechazo extends Exception
{
    public string $codigoApi;
    public int $http;
    public array $extra;

    public function __construct(string $codigoApi, string $mensaje, int $http, array $extra = [])
    {
        parent::__construct($mensaje);
        $this->codigoApi = $codigoApi;
        $this->http = $http;
        $this->extra = $extra;
    }
}

/* ===================== Importes en centavos ===================== */

/** "700.00" (DECIMAL de MariaDB) -> 70000. */
function pedido_centavos($valor): int
{
    $texto = (string) $valor;
    if (preg_match('/^(\d+)(?:\.(\d{1,2}))?$/', $texto, $m) !== 1) {
        throw new RuntimeException('Importe no válido en la base de datos.');
    }
    return ((int) $m[1]) * 100 + (int) str_pad($m[2] ?? '0', 2, '0');
}

/** 70000 -> "700.00" (para guardar en DECIMAL). */
function pedido_decimal(int $centavos): string
{
    return sprintf('%d.%02d', intdiv($centavos, 100), $centavos % 100);
}

function pedido_pesos(int $centavos): float
{
    return $centavos / 100;
}

/** IVA redondeado al centavo (mitad hacia arriba). */
function pedido_iva(int $subtotalCent): int
{
    return intdiv($subtotalCent * PEDIDO_TASA_IVA_MILESIMAS + 500, 1000);
}

/**
 * Envío SIMULADO por zona (primer dígito del C.P.). Mismas reglas que js/checkout.js.
 * @return array{0:int,1:string} [costo en centavos, zona]
 */
function pedido_envio(string $cp, int $subtotalCent): array
{
    if ($subtotalCent >= PEDIDO_ENVIO_GRATIS_DESDE) {
        return [0, PEDIDO_ZONA_GRATIS];
    }
    $d = (int) $cp[0];
    if ($d <= 1) {
        return [5900, 'Zona Metropolitana (CDMX / Edomex)'];
    }
    if ($d <= 4) {
        return [9900, 'Zona Centro'];
    }
    if ($d <= 7) {
        return [12900, 'Zona Occidente y Sureste'];
    }
    return [14900, 'Zona Norte y Frontera'];
}

/* ===================== Validación de la entrada ===================== */

function pedido_metodos_pago(): array
{
    return ['tarjeta', 'paypal', 'transferencia'];
}

/** Estado inicial: el pago simulado con tarjeta/PayPal "se aprueba"; la transferencia queda pendiente. */
function pedido_estado_inicial(string $metodo): string
{
    return $metodo === 'transferencia' ? 'pendiente' : 'pagado';
}

function pedido_clave_valida($valor): bool
{
    return is_string($valor) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $valor) === 1;
}

function pedido_numero_valido($valor): bool
{
    return is_string($valor) && preg_match('/^TF-[0-9]{6}$/', $valor) === 1;
}

/** Texto de envío: sin caracteres de control ni < >, espacios normalizados. */
function pedido_texto_envio($valor): string
{
    if (!is_string($valor)) {
        return '';
    }
    $limpio = preg_replace('/\s+/u', ' ', trim($valor));
    return $limpio === null ? '' : $limpio;
}

/**
 * Valida y normaliza el cuerpo de la compra. Si algo no es válido responde 422 con "errores" por campo.
 * @return array{envio:array,metodo:string,clave:string,total_mostrado:?int}
 */
function pedido_validar_entrada(array $datos): array
{
    $errores = [];

    $clave = $datos['clave'] ?? null;
    if (!pedido_clave_valida($clave)) {
        $errores['clave'] = 'Clave de operación no válida.';
    }

    // Etapa 2: sin aceptación explícita (booleano true) no se registra el pedido.
    if (!politicas_aceptacion_presente($datos)) {
        $errores['aceptacion'] = POLITICAS_MENSAJE_CHECKOUT;
    }

    $metodo = $datos['metodo_pago'] ?? null;
    if (!is_string($metodo) || !in_array($metodo, pedido_metodos_pago(), true)) {
        $errores['metodo_pago'] = 'Selecciona un método de pago válido.';
    }

    $totalMostrado = null;
    if (array_key_exists('total_mostrado', $datos) && $datos['total_mostrado'] !== null) {
        $t = $datos['total_mostrado'];
        if ((!is_int($t) && !is_float($t)) || !is_finite((float) $t) || $t < 0 || $t > 10000000) {
            $errores['total_mostrado'] = 'Total no válido.';
        } else {
            $totalMostrado = (int) round(((float) $t) * 100);
        }
    }

    $e = $datos['envio'] ?? null;
    $envio = [];
    if (!is_array($e) || ($e !== [] && array_is_list($e))) {
        $errores['envio'] = 'Faltan los datos de envío.';
    } else {
        // campo => [etiqueta, largo máximo, obligatorio]
        $campos = [
            'nombre'        => ['nombre', 100, true],
            'correo'        => ['correo', 150, true],
            'calle'         => ['calle', 120, true],
            'num_exterior'  => ['número exterior', 10, true],
            'num_interior'  => ['número interior', 10, false],
            'colonia'       => ['colonia', 100, true],
            'ciudad'        => ['ciudad', 100, true],
            'estado'        => ['estado', 60, true],
        ];
        foreach ($campos as $campo => [$etiqueta, $max, $obligatorio]) {
            $valor = pedido_texto_envio($e[$campo] ?? '');
            $envio[$campo] = $valor;
            if ($valor === '') {
                if ($obligatorio) {
                    $errores['envio.' . $campo] = 'El campo ' . $etiqueta . ' es obligatorio.';
                }
                continue;
            }
            if (preg_match('//u', $valor) !== 1 || preg_match('/[\x00-\x1F\x7F<>]/u', $valor) === 1) {
                $errores['envio.' . $campo] = 'El campo ' . $etiqueta . ' contiene caracteres no válidos.';
            } elseif (largo_texto($valor) > $max) {
                $errores['envio.' . $campo] = 'El campo ' . $etiqueta . ' no puede superar ' . $max . ' caracteres.';
            }
        }

        $envio['correo'] = normalizar_correo($envio['correo']);
        if ($envio['correo'] !== '' && error_correo($envio['correo']) !== '') {
            $errores['envio.correo'] = 'Escribe un correo con formato válido.';
        }

        // Teléfono: 10 dígitos (se acepta separadores y +52 inicial, igual que el formulario).
        $digitos = preg_replace('/\D/', '', is_string($e['telefono'] ?? null) ? (string) $e['telefono'] : '') ?? '';
        if (strlen($digitos) === 12 && strpos($digitos, '52') === 0) {
            $digitos = substr($digitos, 2);
        }
        if (strlen($digitos) !== 10) {
            $errores['envio.telefono'] = 'Escribe un teléfono válido a 10 dígitos.';
        }
        $envio['telefono'] = $digitos;

        $cp = is_string($e['codigo_postal'] ?? null) ? trim((string) $e['codigo_postal']) : '';
        if (preg_match('/^[0-9]{5}$/', $cp) !== 1) {
            $errores['envio.codigo_postal'] = 'Usa un código postal válido de 5 dígitos.';
        }
        $envio['codigo_postal'] = $cp;
    }

    if ($errores !== []) {
        responder_error('validacion', 'Revisa los datos de tu pedido.', 422, null, ['errores' => $errores]);
    }

    return ['envio' => $envio, 'metodo' => (string) $metodo, 'clave' => (string) $clave, 'total_mostrado' => $totalMostrado];
}

/* ===================== Límite de solicitudes ===================== */

function pedido_limitar(int $usuarioId): void
{
    $clave = 'pedido|' . $usuarioId;
    $espera = limitador_bloqueado($clave, PEDIDO_LIM_VENTANA, PEDIDO_LIM_INTENTOS);
    if ($espera > 0) {
        responder_limite($espera);
    }
    limitador_registrar($clave, PEDIDO_LIM_VENTANA);
}

/* ===================== Lectura de pedidos (siempre del dueño) ===================== */

const PEDIDO_COLUMNAS = 'p.id, p.numero_pedido, p.estado, p.metodo_pago, p.guia_envio, p.zona_envio,
        p.envio_nombre, p.envio_correo, p.envio_telefono, p.envio_calle, p.envio_num_exterior,
        p.envio_num_interior, p.envio_colonia, p.envio_ciudad, p.envio_estado, p.envio_codigo_postal,
        p.subtotal, p.tasa_impuesto, p.impuestos, p.costo_envio, p.total,
        UNIX_TIMESTAMP(p.creado_en) AS creado_ts';

/** Líneas de varios pedidos: pedido_id => [líneas]. */
function pedido_lineas_de(PDO $pdo, array $pedidoIds): array
{
    if ($pedidoIds === []) {
        return [];
    }
    $marcas = implode(',', array_fill(0, count($pedidoIds), '?'));
    $consulta = $pdo->prepare(
        "SELECT d.pedido_id, d.nombre_producto, d.cantidad, d.precio_unitario, pr.codigo, m.nombre AS marca,
                (SELECT i.ruta FROM imagenes_productos i WHERE i.producto_id = pr.id ORDER BY i.orden ASC LIMIT 1) AS imagen
           FROM detalle_pedidos d
           JOIN productos pr ON pr.id = d.producto_id
           JOIN marcas m ON m.id = pr.marca_id
          WHERE d.pedido_id IN ($marcas)
          ORDER BY d.pedido_id, d.id"
    );
    $consulta->execute(array_values($pedidoIds));
    $porPedido = [];
    foreach ($consulta->fetchAll() as $fila) {
        $precio = pedido_centavos($fila['precio_unitario']);
        $cantidad = (int) $fila['cantidad'];
        $porPedido[(int) $fila['pedido_id']][] = [
            'codigo'          => (string) $fila['codigo'],
            'nombre'          => (string) $fila['nombre_producto'],   // nombre del MOMENTO de la compra
            'marca'           => (string) $fila['marca'],
            'imagen'          => catalogo_imagen($fila['imagen'] !== null ? (string) $fila['imagen'] : null),
            'cantidad'        => $cantidad,
            'precio_unitario' => pedido_pesos($precio),              // precio del MOMENTO de la compra
            'total_linea'     => pedido_pesos($precio * $cantidad),
        ];
    }
    return $porPedido;
}

/** Formato público de un pedido (filas de PEDIDO_COLUMNAS + sus líneas). */
function pedido_formatear(array $fila, array $lineas): array
{
    $zona = $fila['zona_envio'] !== null ? (string) $fila['zona_envio'] : null;
    return [
        'numero_pedido' => (string) $fila['numero_pedido'],
        'estado'        => (string) $fila['estado'],
        'metodo_pago'   => (string) $fila['metodo_pago'],
        'creado_en_ms'  => ((int) $fila['creado_ts']) * 1000,
        'guia_envio'    => $fila['guia_envio'] !== null ? (string) $fila['guia_envio'] : null,
        'envio' => [
            'nombre'        => (string) $fila['envio_nombre'],
            'correo'        => (string) $fila['envio_correo'],
            'telefono'      => (string) $fila['envio_telefono'],
            'calle'         => (string) $fila['envio_calle'],
            'num_exterior'  => (string) $fila['envio_num_exterior'],
            'num_interior'  => $fila['envio_num_interior'] !== null ? (string) $fila['envio_num_interior'] : '',
            'colonia'       => (string) $fila['envio_colonia'],
            'ciudad'        => (string) $fila['envio_ciudad'],
            'estado'        => (string) $fila['envio_estado'],
            'codigo_postal' => (string) $fila['envio_codigo_postal'],
        ],
        'subtotal'      => pedido_pesos(pedido_centavos($fila['subtotal'])),
        'tasa_impuesto' => (float) $fila['tasa_impuesto'],
        'impuestos'     => pedido_pesos(pedido_centavos($fila['impuestos'])),
        'zona_envio'    => $zona,
        'costo_envio'   => pedido_pesos(pedido_centavos($fila['costo_envio'])),
        'envio_gratis'  => $zona === PEDIDO_ZONA_GRATIS,
        'total'         => pedido_pesos(pedido_centavos($fila['total'])),
        'items'         => $lineas,
    ];
}

/** Un pedido SOLO si pertenece a $usuarioId (por número o por clave). null si no existe o es de otra cuenta. */
function pedido_buscar(PDO $pdo, int $usuarioId, string $campo, string $valor): ?array
{
    if (!in_array($campo, ['numero_pedido', 'clave_idempotencia'], true)) {   // lista blanca (nunca viene del navegador)
        throw new InvalidArgumentException('Campo de búsqueda no permitido.');
    }
    $consulta = $pdo->prepare('SELECT ' . PEDIDO_COLUMNAS . " FROM pedidos p WHERE p.usuario_id = :u AND p.$campo = :v");
    $consulta->execute([':u' => $usuarioId, ':v' => $valor]);
    $fila = $consulta->fetch();
    if ($fila === false) {
        return null;
    }
    $lineas = pedido_lineas_de($pdo, [(int) $fila['id']]);
    return pedido_formatear($fila, $lineas[(int) $fila['id']] ?? []);
}

/** Historial paginado del usuario (más recientes primero). */
function pedido_listar(PDO $pdo, int $usuarioId, int $pagina): array
{
    $total = $pdo->prepare('SELECT COUNT(*) FROM pedidos WHERE usuario_id = :u');
    $total->execute([':u' => $usuarioId]);
    $cuantos = (int) $total->fetchColumn();
    $paginas = max(1, (int) ceil($cuantos / PEDIDO_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $consulta = $pdo->prepare(
        'SELECT ' . PEDIDO_COLUMNAS . ' FROM pedidos p WHERE p.usuario_id = :u
          ORDER BY p.creado_en DESC, p.id DESC LIMIT :lim OFFSET :off'
    );
    $consulta->bindValue(':u', $usuarioId, PDO::PARAM_INT);
    $consulta->bindValue(':lim', PEDIDO_POR_PAGINA, PDO::PARAM_INT);
    $consulta->bindValue(':off', ($pagina - 1) * PEDIDO_POR_PAGINA, PDO::PARAM_INT);
    $consulta->execute();
    $filas = $consulta->fetchAll();

    $lineas = pedido_lineas_de($pdo, array_map(static fn(array $f): int => (int) $f['id'], $filas));
    $pedidos = [];
    foreach ($filas as $fila) {
        $pedidos[] = pedido_formatear($fila, $lineas[(int) $fila['id']] ?? []);
    }
    return ['pedidos' => $pedidos, 'pagina' => $pagina, 'paginas' => $paginas, 'total' => $cuantos];
}

/* ===================== Registro de la compra ===================== */

/** Compara el pedido ya guardado con lo que llega ahora (misma clave = misma operación). */
function pedido_es_misma_operacion(array $guardado, array $entrada): bool
{
    $g = $guardado['envio'];
    $n = $entrada['envio'];
    foreach (['nombre', 'correo', 'telefono', 'calle', 'num_exterior', 'num_interior', 'colonia', 'ciudad', 'estado', 'codigo_postal'] as $campo) {
        if (($g[$campo] ?? '') !== ($n[$campo] ?? '')) {
            return false;
        }
    }
    if ($guardado['metodo_pago'] !== $entrada['metodo']) {
        return false;
    }
    if ($entrada['total_mostrado'] !== null && $entrada['total_mostrado'] !== (int) round($guardado['total'] * 100)) {
        return false;
    }
    return true;
}

/** Respuesta de una clave ya usada: el mismo pedido, o 409 si los datos no coinciden. */
function pedido_repetido(array $guardado, array $entrada): array
{
    if (!pedido_es_misma_operacion($guardado, $entrada)) {
        throw new PedidoRechazo(
            'clave_reutilizada',
            'Esta compra ya se registró con otros datos. Revisa «Mis pedidos»; si necesitas otra compra, vuelve a empezar desde tu carrito.',
            409
        );
    }
    return ['pedido' => $guardado, 'repetido' => true];
}

/** Nombre de la restricción única que provocó un error 1062. */
function pedido_llave_duplicada(PDOException $e): string
{
    foreach (['uq_pedidos_numero', 'uq_pedidos_guia', 'uq_pedidos_usuario_clave'] as $llave) {
        if (strpos($e->getMessage(), $llave) !== false) {
            return $llave;
        }
    }
    return '';
}

/**
 * Registra la compra. Devuelve ['pedido' => ..., 'repetido' => bool].
 * Lanza PedidoRechazo para errores de negocio; cualquier otra excepción es un fallo interno.
 * Nunca deja nada a medias: cualquier error revierte pedido, detalle, existencias y carrito.
 */
function pedido_registrar(PDO $pdo, int $usuarioId, array $entrada): array
{
    // El carrito existe antes de la transacción (INSERT IGNORE + UNIQUE(usuario_id)).
    $carritoId = carrito_id_usuario($pdo, $usuarioId, true);

    for ($intento = 1; ; $intento++) {
        try {
            return pedido_transaccion($pdo, $usuarioId, (int) $carritoId, $entrada);
        } catch (PedidoRechazo $r) {
            throw $r;
        } catch (PDOException $e) {
            $errno = errno_de_pdo($e);
            // Deadlock (1213) o tiempo de espera de bloqueo (1205): se reintenta; nada quedó guardado.
            if (($errno === 1213 || $errno === 1205) && $intento < PEDIDO_REINTENTOS_BD) {
                usleep(random_int(40000, 120000) * $intento);
                continue;
            }
            if ($errno === 1062 && pedido_llave_duplicada($e) === 'uq_pedidos_usuario_clave') {
                // Misma clave guardada por otra solicitud: se devuelve ese pedido.
                $guardado = pedido_buscar($pdo, $usuarioId, 'clave_idempotencia', $entrada['clave']);
                if ($guardado !== null) {
                    return pedido_repetido($guardado, $entrada);
                }
            }
            throw $e;
        }
    }
}

function pedido_transaccion(PDO $pdo, int $usuarioId, int $carritoId, array $entrada): array
{
    // READ COMMITTED: lecturas siempre al día y sin bloqueos de "hueco" entre usuarios distintos.
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 10');
    $pdo->beginTransaction();
    try {
        // (1) Bloquear el carrito del usuario: dos clics / dos pestañas / un reintento se ponen en fila.
        carrito_bloquear($pdo, $carritoId);

        // (2) ¿Ya existe un pedido con esta clave? -> es la misma operación repetida: se devuelve, no se duplica.
        $existente = pedido_buscar($pdo, $usuarioId, 'clave_idempotencia', $entrada['clave']);
        if ($existente !== null) {
            $pdo->rollBack();   // no se escribió nada
            return pedido_repetido($existente, $entrada);
        }

        // (3) Líneas del carrito del servidor y bloqueo de productos en orden fijo de id (evita deadlocks).
        $consulta = $pdo->prepare('SELECT producto_id, cantidad FROM detalle_carrito WHERE carrito_id = :c ORDER BY producto_id');
        $consulta->execute([':c' => $carritoId]);
        $lineasCarrito = $consulta->fetchAll();
        if ($lineasCarrito === []) {
            throw new PedidoRechazo('carrito_vacio', 'Tu carrito está vacío; no hay nada que comprar.', 409);
        }

        $ids = array_map(static fn(array $l): int => (int) $l['producto_id'], $lineasCarrito);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $consulta = $pdo->prepare("SELECT id, nombre, precio, stock, activo FROM productos WHERE id IN ($marcas) ORDER BY id FOR UPDATE");
        $consulta->execute($ids);
        $productos = [];
        foreach ($consulta->fetchAll() as $p) {
            $productos[(int) $p['id']] = $p;
        }

        // (4) Validar con los datos REALES (los productos desactivados no se muestran en el carrito: se omiten).
        $compra = [];
        $problemas = [];
        $subtotal = 0;
        foreach ($lineasCarrito as $linea) {
            $pid = (int) $linea['producto_id'];
            $cantidad = (int) $linea['cantidad'];
            $p = $productos[$pid] ?? null;
            if ($p === null || (int) $p['activo'] !== 1) {
                continue;
            }
            $stock = (int) $p['stock'];
            if ($stock <= 0 || $cantidad > $stock) {
                $problemas[] = [
                    'nombre'     => (string) $p['nombre'],
                    'motivo'     => $stock <= 0 ? 'sin_stock' : 'stock_insuficiente',
                    'disponible' => max(0, $stock),
                    'solicitado' => $cantidad,
                ];
                continue;
            }
            $precio = pedido_centavos($p['precio']);
            $compra[] = ['pid' => $pid, 'nombre' => (string) $p['nombre'], 'cantidad' => $cantidad, 'precio' => $precio];
            $subtotal += $precio * $cantidad;
        }
        if ($problemas !== []) {
            throw new PedidoRechazo(
                'existencias',
                'Algunos productos de tu carrito ya no tienen las existencias solicitadas. No se registró ningún pedido ni se vació tu carrito.',
                409,
                ['problemas' => $problemas]
            );
        }
        if ($compra === []) {
            throw new PedidoRechazo('carrito_vacio', 'Tu carrito no tiene productos disponibles para comprar.', 409);
        }

        // (5) Totales calculados aquí, en centavos.
        $impuestos = pedido_iva($subtotal);
        [$costoEnvio, $zona] = pedido_envio($entrada['envio']['codigo_postal'], $subtotal);
        $total = $subtotal + $impuestos + $costoEnvio;

        // Si el total que el usuario vio no coincide (cambió un precio, etc.), se pide confirmar de nuevo.
        if ($entrada['total_mostrado'] !== null && $entrada['total_mostrado'] !== $total) {
            throw new PedidoRechazo(
                'precios_cambiaron',
                'El total de tu pedido cambió desde que lo revisaste. Revisa el resumen actualizado y confirma de nuevo.',
                409,
                ['total_actual' => pedido_pesos($total)]
            );
        }

        // (6) Pedido: número y guía únicos (si chocan, se genera otro).
        $e = $entrada['envio'];
        $insertar = $pdo->prepare(
            'INSERT INTO pedidos (numero_pedido, usuario_id, envio_nombre, envio_correo, envio_telefono, envio_calle,
                                  envio_num_exterior, envio_num_interior, envio_colonia, envio_ciudad, envio_estado,
                                  envio_codigo_postal, metodo_pago, estado, subtotal, tasa_impuesto, impuestos,
                                  zona_envio, costo_envio, total, guia_envio, clave_idempotencia)
             VALUES (:numero, :u, :nombre, :correo, :tel, :calle, :ext, :int, :colonia, :ciudad, :estado,
                     :cp, :metodo, :est, :subtotal, :tasa, :impuestos, :zona, :envio, :total, :guia, :clave)'
        );
        $pedidoId = 0;
        $numero = '';
        for ($i = 0; $i < 12 && $pedidoId === 0; $i++) {
            $numero = 'TF-' . random_int(100000, 999999);
            $guia = 'GF-' . random_int(10000000, 99999999);
            try {
                $insertar->execute([
                    ':numero' => $numero, ':u' => $usuarioId, ':nombre' => $e['nombre'], ':correo' => $e['correo'],
                    ':tel' => $e['telefono'], ':calle' => $e['calle'], ':ext' => $e['num_exterior'],
                    ':int' => $e['num_interior'] !== '' ? $e['num_interior'] : null,
                    ':colonia' => $e['colonia'], ':ciudad' => $e['ciudad'], ':estado' => $e['estado'],
                    ':cp' => $e['codigo_postal'], ':metodo' => $entrada['metodo'],
                    ':est' => pedido_estado_inicial($entrada['metodo']),
                    ':subtotal' => pedido_decimal($subtotal), ':tasa' => '0.1600', ':impuestos' => pedido_decimal($impuestos),
                    ':zona' => $zona, ':envio' => pedido_decimal($costoEnvio), ':total' => pedido_decimal($total),
                    ':guia' => $guia, ':clave' => $entrada['clave'],
                ]);
                $pedidoId = (int) $pdo->lastInsertId();
            } catch (PDOException $ex) {
                $llave = errno_de_pdo($ex) === 1062 ? pedido_llave_duplicada($ex) : '';
                if ($llave !== 'uq_pedidos_numero' && $llave !== 'uq_pedidos_guia') {
                    throw $ex;   // cualquier otro error (incluida la clave repetida) revierte todo
                }
            }
        }
        if ($pedidoId === 0) {
            throw new RuntimeException('No se pudo generar un número de pedido único.');
        }

        // (6b) Etapa 2: constancia de aceptación vinculada a ESTE pedido, en la misma transacción.
        politicas_registrar_aceptacion($pdo, $usuarioId, POLITICAS_CONTEXTO_CHECKOUT, $pedidoId);

        // (7) Detalle con nombre y precio del momento + descuento de existencias (condicional).
        $detalle = $pdo->prepare(
            'INSERT INTO detalle_pedidos (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
             VALUES (:pedido, :producto, :nombre, :cantidad, :precio)'
        );
        $descontar = $pdo->prepare('UPDATE productos SET stock = stock - :q WHERE id = :id AND stock >= :q2');
        foreach ($compra as $linea) {
            $detalle->execute([
                ':pedido' => $pedidoId, ':producto' => $linea['pid'], ':nombre' => $linea['nombre'],
                ':cantidad' => $linea['cantidad'], ':precio' => pedido_decimal($linea['precio']),
            ]);
            $descontar->execute([':q' => $linea['cantidad'], ':id' => $linea['pid'], ':q2' => $linea['cantidad']]);
            if ($descontar->rowCount() !== 1) {
                // Red de seguridad: nunca se deja el stock negativo ni se vende lo que no hay.
                throw new PedidoRechazo(
                    'existencias',
                    'Un producto se agotó mientras se procesaba tu compra. No se registró ningún pedido ni se vació tu carrito.',
                    409,
                    ['problemas' => [['nombre' => $linea['nombre'], 'motivo' => 'sin_stock', 'disponible' => 0, 'solicitado' => $linea['cantidad']]]]
                );
            }
            // Fase 3.6.2: movimiento de salida en la MISMA transacción. La fila del producto está bloqueada
            // (FOR UPDATE), así que las existencias leídas arriba son las anteriores a este descuento.
            // Si el registro falla, se revierte todo el pedido; si el pedido se revierte, no queda movimiento.
            inventario_registrar_venta($pdo, $linea['pid'], $linea['cantidad'], (int) $productos[$linea['pid']]['stock'], $usuarioId, $pedidoId);
        }

        // (8) Vaciar del carrito SOLO lo comprado.
        $borrar = $pdo->prepare(
            'DELETE FROM detalle_carrito WHERE carrito_id = ? AND producto_id IN ('
            . implode(',', array_fill(0, count($compra), '?')) . ')'
        );
        $borrar->execute(array_merge([$carritoId], array_map(static fn(array $l): int => $l['pid'], $compra)));
        carrito_tocar($pdo, $carritoId);

        $pdo->commit();
    } catch (Throwable $fallo) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $fallo;
    }

    $pedido = pedido_buscar($pdo, $usuarioId, 'numero_pedido', $numero);
    if ($pedido === null) {
        throw new RuntimeException('El pedido se registró pero no se pudo leer.');
    }
    return ['pedido' => $pedido, 'repetido' => false];
}

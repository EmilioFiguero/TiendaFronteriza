<?php
declare(strict_types=1);

/**
 * POST api/carrito_sincronizar.php   (FUNCIÓN PROTEGIDA: sesión + CSRF)
 * Cuerpo JSON:
 *   {
 *     "usuario_esperado": 12,           // cuenta a la que el navegador cree que pertenece el carrito
 *     "base":    { "p1": 2, "p7": 1 },      // lo último que ESTE navegador vio en el servidor
 *     "cambios": [ { "codigo": "p1", "accion": "establecer", "cantidad": 3 },
 *                  { "codigo": "p7", "accion": "eliminar" } ]
 *   }
 *
 * Cada cambio es absoluto (deja el producto en N unidades o lo quita), por eso se puede
 * reenviar sin duplicar nada. Detección de conflictos entre dispositivos, por producto:
 *   - si el servidor ya tiene el valor pedido            -> "aplicado" (ya estaba)
 *   - si el servidor cambió desde "base" (otro equipo)   -> "conflicto": gana el servidor
 *   - en otro caso se aplica, validando producto activo y stock en MariaDB.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/carrito.php';

solo_metodo('POST');
verificar_origen();

try {
    iniciar_sesion_segura();
    exigir_csrf();
    $datos = leer_json();

    // Primero la identidad: sin sesión válida siempre es 401, sea cual sea el cuerpo.
    $pdo = obtener_conexion();
    $usuario = carrito_exigir_usuario($pdo);
    carrito_verificar_usuario_esperado($datos, $usuario);
    carrito_limitar_escrituras($usuario['id']);

    // ---- Validación de la entrada (antes de tocar la BD) ----
    $baseEntrada = $datos['base'] ?? [];
    $cambiosEntrada = $datos['cambios'] ?? [];
    if (!is_array($baseEntrada) || !is_array($cambiosEntrada)
        || ($baseEntrada !== [] && array_is_list($baseEntrada))   // "base" es un objeto {codigo: cantidad}
        || !array_is_list($cambiosEntrada)
        || count($baseEntrada) > CARRITO_MAX_LINEAS || count($cambiosEntrada) > CARRITO_MAX_CAMBIOS) {
        responder_error('validacion', 'Datos del carrito no válidos.', 422);
    }

    $base = [];
    foreach ($baseEntrada as $codigo => $cantidad) {
        $codigo = carrito_codigo((string) $codigo);
        $cantidad = carrito_entero($cantidad, 0, 65535);
        if ($codigo === null || $cantidad === null) {
            responder_error('validacion', 'Datos del carrito no válidos.', 422);
        }
        $base[$codigo] = $cantidad;
    }

    $cambios = [];   // el último cambio de cada producto es el que cuenta
    foreach ($cambiosEntrada as $cambio) {
        if (!is_array($cambio)) {
            responder_error('validacion', 'Datos del carrito no válidos.', 422);
        }
        $codigo = carrito_codigo($cambio['codigo'] ?? null);
        $accion = $cambio['accion'] ?? null;
        if ($codigo === null || ($accion !== 'establecer' && $accion !== 'eliminar')) {
            responder_error('validacion', 'Datos del carrito no válidos.', 422);
        }
        $objetivo = 0;
        if ($accion === 'establecer') {
            $objetivo = carrito_entero($cambio['cantidad'] ?? null, 1, CARRITO_MAX_CANTIDAD);
            if ($objetivo === null) {
                responder_error('validacion', 'La cantidad debe ser un número entero entre 1 y ' . CARRITO_MAX_CANTIDAD . '.', 422);
            }
        }
        $cambios[$codigo] = $objetivo;
    }

    // ---- Transacción: carrito bloqueado mientras se aplican los cambios ----
    $resultados = [];
    $pdo->beginTransaction();
    try {
        $carritoId = carrito_id_usuario($pdo, $usuario['id'], true);
        carrito_bloquear($pdo, $carritoId);
        $lineas = carrito_lineas($pdo, $carritoId);
        $productos = carrito_productos_por_codigo($pdo, array_keys($cambios));
        $huboCambios = false;

        foreach ($cambios as $codigo => $objetivo) {
            $actual = isset($lineas[$codigo]) ? $lineas[$codigo]['q'] : 0;
            $antes  = isset($base[$codigo]) ? $base[$codigo] : 0;
            $producto = isset($productos[$codigo]) ? $productos[$codigo] : null;

            if ($producto === null) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'producto_no_encontrado', 'cantidad' => $actual];
                continue;
            }
            if ($actual === $objetivo) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'aplicado', 'cantidad' => $actual];
                continue;
            }
            if ($actual !== $antes) {
                // Otro dispositivo cambió este producto: se conserva la versión del servidor.
                $resultados[] = ['codigo' => $codigo, 'estado' => 'conflicto', 'cantidad' => $actual, 'cantidad_pedida' => $objetivo];
                continue;
            }
            if ($objetivo === 0) {
                carrito_borrar_linea($pdo, $carritoId, $producto['pid']);
                unset($lineas[$codigo]);
                $huboCambios = true;
                $resultados[] = ['codigo' => $codigo, 'estado' => 'aplicado', 'cantidad' => 0];
                continue;
            }
            if (!$producto['activo']) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'producto_no_disponible', 'cantidad' => $actual];
                continue;
            }
            if ($producto['stock'] <= 0) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'sin_existencias', 'cantidad' => $actual];
                continue;
            }
            if ($actual === 0 && count($lineas) >= CARRITO_MAX_LINEAS) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'carrito_lleno', 'cantidad' => 0];
                continue;
            }

            $final = min($objetivo, $producto['stock'], CARRITO_MAX_CANTIDAD);
            carrito_guardar_linea($pdo, $carritoId, $producto['pid'], $final);
            $lineas[$codigo] = ['pid' => $producto['pid'], 'q' => $final];
            $huboCambios = true;
            $resultados[] = [
                'codigo'   => $codigo,
                'estado'   => $final < $objetivo ? 'ajustado' : 'aplicado',
                'cantidad' => $final,
            ];
        }

        if ($huboCambios) {
            carrito_tocar($pdo, $carritoId);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    responder_json([
        'ok'         => true,
        'usuario'    => ['id' => $usuario['id']],
        'resultados' => $resultados,
        'carrito'    => carrito_leer($pdo, $carritoId),
    ]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

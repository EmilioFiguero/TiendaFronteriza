<?php
declare(strict_types=1);

/**
 * POST api/carrito_fusionar.php   (FUNCIÓN PROTEGIDA: sesión + CSRF)
 * Cuerpo JSON: { "usuario_esperado": 12, "items": [ { "codigo": "p1", "cantidad": 2 }, ... ] }
 *
 * Fusiona el carrito de VISITANTE (guardado en el navegador) con el carrito de la cuenta:
 *   cantidad final = la MAYOR entre la local y la guardada, sin pasar del stock disponible
 *   ni de 99 unidades. Nunca duplica líneas y repetir la solicitud no cambia nada.
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

    $entrada = $datos['items'] ?? [];
    if (!is_array($entrada) || count($entrada) > CARRITO_MAX_LINEAS) {
        responder_error('validacion', 'Datos del carrito no válidos.', 422);
    }

    $locales = [];   // codigo => cantidad local (si se repite un código, se toma la mayor)
    foreach ($entrada as $item) {
        if (!is_array($item)) {
            responder_error('validacion', 'Datos del carrito no válidos.', 422);
        }
        $codigo = carrito_codigo($item['codigo'] ?? null);
        $cantidad = carrito_entero($item['cantidad'] ?? null, 1, 65535);
        if ($codigo === null || $cantidad === null) {
            responder_error('validacion', 'Datos del carrito no válidos.', 422);
        }
        $locales[$codigo] = max($locales[$codigo] ?? 0, $cantidad);
    }

    $resultados = [];
    $pdo->beginTransaction();
    try {
        $carritoId = carrito_id_usuario($pdo, $usuario['id'], true);
        carrito_bloquear($pdo, $carritoId);
        $lineas = carrito_lineas($pdo, $carritoId);
        $productos = carrito_productos_por_codigo($pdo, array_keys($locales));
        $huboCambios = false;

        foreach ($locales as $codigo => $local) {
            $actual = isset($lineas[$codigo]) ? $lineas[$codigo]['q'] : 0;
            $producto = isset($productos[$codigo]) ? $productos[$codigo] : null;

            if ($producto === null || !$producto['activo']) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'producto_no_disponible', 'cantidad' => $actual];
                continue;
            }
            if ($producto['stock'] <= 0) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'sin_existencias', 'cantidad' => $actual];
                continue;
            }

            $objetivo = min(max($actual, $local), $producto['stock'], CARRITO_MAX_CANTIDAD);
            if ($objetivo === $actual) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'sin_cambios', 'cantidad' => $actual];
                continue;
            }
            if ($actual === 0 && count($lineas) >= CARRITO_MAX_LINEAS) {
                $resultados[] = ['codigo' => $codigo, 'estado' => 'rechazado', 'motivo' => 'carrito_lleno', 'cantidad' => 0];
                continue;
            }

            carrito_guardar_linea($pdo, $carritoId, $producto['pid'], $objetivo);
            $lineas[$codigo] = ['pid' => $producto['pid'], 'q' => $objetivo];
            $huboCambios = true;
            $resultados[] = [
                'codigo'   => $codigo,
                'estado'   => $objetivo < min($local, CARRITO_MAX_CANTIDAD) ? 'ajustado' : 'aplicado',
                'cantidad' => $objetivo,
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

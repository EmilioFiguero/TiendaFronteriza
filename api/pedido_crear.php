<?php
declare(strict_types=1);

/**
 * POST api/pedido_crear.php   (FUNCIÓN PROTEGIDA: sesión + CSRF)
 * Registra la compra del carrito del usuario autenticado (pago y envío SIMULADOS).
 * Cuerpo JSON:
 *   { "usuario_esperado": 12, "clave": "<uuid>", "metodo_pago": "tarjeta|paypal|transferencia",
 *     "acepta_politicas": true,                      // Etapa 2: aceptación explícita (se valida aquí, no solo en el navegador)
 *     "total_mostrado": 1234.56,                      // solo para detectar cambios; nunca se usa para calcular
 *     "envio": { nombre, correo, telefono, calle, num_exterior, num_interior, colonia, ciudad, estado, codigo_postal } }
 * El carrito, los precios y las existencias salen de MariaDB, nunca del navegador.
 * Respuestas: 201 pedido creado · 200 la misma operación ya estaba registrada ("repetido": true)
 *             409 existencias / precios_cambiaron / carrito_vacio / clave_reutilizada / usuario_distinto
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/pedidos.php';

solo_metodo('POST');
verificar_origen();

try {
    iniciar_sesion_segura();
    exigir_csrf();
    $datos = leer_json();

    $pdo = obtener_conexion();
    $usuario = carrito_exigir_usuario($pdo);          // 401 sin sesión (y cierra la sesión PHP para no bloquear)
    carrito_verificar_usuario_esperado($datos, $usuario);
    pedido_limitar($usuario['id']);

    $entrada = pedido_validar_entrada($datos);        // 422 con errores por campo

    try {
        $resultado = pedido_registrar($pdo, $usuario['id'], $entrada);
    } catch (PedidoRechazo $r) {
        responder_error($r->codigoApi, $r->getMessage(), $r->http, null, $r->extra);
    }

    responder_json(
        ['ok' => true, 'repetido' => $resultado['repetido'], 'pedido' => $resultado['pedido']],
        $resultado['repetido'] ? 200 : 201
    );
} catch (Throwable $e) {
    manejar_fallo($e);
}

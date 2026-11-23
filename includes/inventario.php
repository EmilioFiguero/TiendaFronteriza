<?php
declare(strict_types=1);

/**
 * Movimientos de inventario (Fase 3.6.2). Archivo mínimo y sin dependencias del panel:
 * lo usa includes/pedidos.php para registrar la salida por venta DENTRO de la misma transacción
 * que descuenta las existencias, y lo usa el panel para los ajustes manuales.
 *
 * Regla: existencias actuales de un producto = suma de sus movimientos (la migración B crea un
 * movimiento 'inicial' por cada producto que ya tenía existencias).
 */

const INV_TIPOS = ['inicial', 'venta', 'entrada', 'salida', 'ajuste', 'cancelacion'];

/**
 * Inserta un movimiento. Debe llamarse dentro de una transacción, con la fila del producto bloqueada
 * (SELECT ... FOR UPDATE) y después de actualizar productos.stock.
 * Los CHECK de la tabla impiden existencias negativas y exigen stock_nuevo = stock_anterior + cantidad.
 */
function inventario_registrar(
    PDO $pdo,
    int $productoId,
    string $tipo,
    int $cantidad,
    int $stockAnterior,
    int $stockNuevo,
    ?string $motivo,
    ?int $usuarioId,
    ?int $pedidoId = null
): void {
    $insertar = $pdo->prepare(
        'INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, pedido_id, usuario_id)
         VALUES (:producto, :tipo, :cantidad, :anterior, :nuevo, :motivo, :pedido, :usuario)'
    );
    $insertar->execute([
        ':producto' => $productoId,
        ':tipo'     => $tipo,
        ':cantidad' => $cantidad,
        ':anterior' => $stockAnterior,
        ':nuevo'    => $stockNuevo,
        ':motivo'   => $motivo === null || $motivo === '' ? null : mb_substr($motivo, 0, 200),
        ':pedido'   => $pedidoId,
        ':usuario'  => $usuarioId,
    ]);
}

/**
 * Salida por venta. Lleva pedido_id: el índice único (pedido_id, producto_id, tipo) impide que el mismo
 * pedido descuente dos veces el mismo producto, aunque se repita la solicitud.
 */
function inventario_registrar_venta(PDO $pdo, int $productoId, int $cantidad, int $stockAnterior, int $clienteId, int $pedidoId): void
{
    inventario_registrar($pdo, $productoId, 'venta', -$cantidad, $stockAnterior, $stockAnterior - $cantidad, null, $clienteId, $pedidoId);
}

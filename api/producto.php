<?php
declare(strict_types=1);

/**
 * GET api/producto.php?codigo=p1   (público, solo lectura)
 * Detalle de un producto activo, con todas sus imágenes.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/catalogo.php';

solo_metodo('GET', 'HEAD');

try {
    $codigo = catalogo_param('codigo');
    if ($codigo === null || $codigo === '' || !catalogo_codigo_valido($codigo)) {
        responder_error('parametros_invalidos', 'Indica un código de producto válido (por ejemplo p1).', 400);
    }

    $pdo = obtener_conexion();

    $consulta = $pdo->prepare(catalogo_select_base() . ' WHERE p.activo = 1 AND p.codigo = ?');
    $consulta->execute([$codigo]);
    $fila = $consulta->fetch();

    if ($fila === false) {
        responder_error('producto_no_encontrado', 'El producto no existe o ya no está disponible.', 404);
    }

    $producto = catalogo_formatear($fila);

    // Galería completa: la imagen principal es la de orden más bajo.
    $imagenes = $pdo->prepare('SELECT ruta FROM imagenes_productos WHERE producto_id = ? ORDER BY orden ASC');
    $imagenes->execute([(int) $fila['pid']]);
    $galeria = [];
    foreach ($imagenes->fetchAll() as $img) {
        $ruta = catalogo_imagen((string) $img['ruta']);
        if (!in_array($ruta, $galeria, true)) {
            $galeria[] = $ruta;
        }
    }
    $producto['imagenes'] = $galeria !== [] ? $galeria : [$producto['imagen']];

    responder_json(['ok' => true, 'producto' => $producto]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

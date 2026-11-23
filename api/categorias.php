<?php
declare(strict_types=1);

/**
 * GET api/categorias.php   (público, solo lectura)
 * Categorías en el orden de la tienda, con la cantidad de productos activos de cada una.
 * La categoría virtual "ofertas" cuenta los productos marcados como oferta.
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/catalogo.php';

solo_metodo('GET', 'HEAD');

try {
    $pdo = obtener_conexion();

    $consulta = $pdo->prepare(
        'SELECT c.slug, c.nombre, c.descripcion, c.imagen, c.es_virtual,
                (SELECT COUNT(*) FROM productos p
                  WHERE p.activo = 1
                    AND ((c.es_virtual = 0 AND p.categoria_id = c.id) OR (c.es_virtual = 1 AND p.en_oferta = 1))) AS total
         FROM categorias c
         ORDER BY c.orden ASC, c.id ASC'
    );
    $consulta->execute();

    $categorias = [];
    foreach ($consulta->fetchAll() as $fila) {
        $categorias[] = [
            'slug'            => (string) $fila['slug'],
            'nombre'          => (string) $fila['nombre'],
            'descripcion'     => (string) $fila['descripcion'],
            'imagen'          => catalogo_imagen($fila['imagen'] !== null ? (string) $fila['imagen'] : null),
            'es_virtual'      => (int) $fila['es_virtual'] === 1,
            'total_productos' => (int) $fila['total'],
        ];
    }

    responder_json(['ok' => true, 'categorias' => $categorias]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

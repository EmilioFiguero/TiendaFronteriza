<?php
declare(strict_types=1);

/**
 * GET api/productos.php   (público, solo lectura)
 *
 * Parámetros opcionales:
 *   q               texto a buscar (nombre, marca, categoría o descripción; hasta 5 palabras)
 *   categoria       slug de categoría (chamarras, mochilas...). "ofertas" = productos en oferta
 *   marca           nombre exacto de la marca
 *   precio_min, precio_max   rango de precio
 *   disponibilidad  todos | disponibles | agotados
 *   ofertas=1, destacados=1
 *   orden           relevancia | precio_asc | precio_desc | nombre_asc | nombre_desc | recientes
 *   pagina, por_pagina       paginación (por_pagina: 1-48, por defecto 12)
 *   codigos         lista separada por comas (p1,p2,...) hasta 50
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/catalogo.php';

solo_metodo('GET', 'HEAD');

try {
    $filtros = catalogo_leer_filtros();
    $pdo = obtener_conexion();

    [$donde, $params] = catalogo_construir_where($pdo, $filtros);
    $desde = ' FROM productos p JOIN categorias c ON c.id = p.categoria_id JOIN marcas m ON m.id = p.marca_id WHERE ' . $donde;

    // 1) Total de resultados (para la paginación).
    $conteo = $pdo->prepare('SELECT COUNT(*)' . $desde);
    $conteo->execute($params);
    $total = (int) $conteo->fetchColumn();

    $porPagina = $filtros['por_pagina'];
    $paginas   = max(1, (int) ceil($total / $porPagina));
    $pagina    = $filtros['pagina'];
    $offset    = ($pagina - 1) * $porPagina;

    // 2) Página solicitada. El ORDER BY sale de una lista blanca; LIMIT/OFFSET van como enteros enlazados.
    $orden = catalogo_ordenes()[$filtros['orden']];
    $consulta = $pdo->prepare(
        catalogo_select_base() . ' WHERE ' . $donde . ' ORDER BY ' . $orden . ' LIMIT ? OFFSET ?'
    );
    $i = 1;
    foreach ($params as $valor) {
        $consulta->bindValue($i++, $valor, PDO::PARAM_STR);
    }
    $consulta->bindValue($i++, $porPagina, PDO::PARAM_INT);
    $consulta->bindValue($i, $offset, PDO::PARAM_INT);
    $consulta->execute();

    $productos = [];
    foreach ($consulta->fetchAll() as $fila) {
        $productos[] = catalogo_formatear($fila);
    }

    responder_json([
        'ok'         => true,
        'productos'  => $productos,
        'paginacion' => [
            'pagina'     => $pagina,
            'por_pagina' => $porPagina,
            'total'      => $total,
            'paginas'    => $paginas,
        ],
        'filtros' => [
            'q'              => $filtros['q'],
            'categoria'      => $filtros['categoria'],
            'marca'          => $filtros['marca'],
            'precio_min'     => $filtros['precio_min'] !== null ? (float) $filtros['precio_min'] : null,
            'precio_max'     => $filtros['precio_max'] !== null ? (float) $filtros['precio_max'] : null,
            'disponibilidad' => $filtros['disponibilidad'],
            'orden'          => $filtros['orden'],
        ],
    ]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

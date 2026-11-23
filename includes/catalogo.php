<?php
declare(strict_types=1);

/**
 * Catálogo de productos: validación de parámetros, consultas preparadas y formato JSON.
 * Solo LEE de la base de datos (SELECT). Nunca modifica nada.
 */

const CATALOGO_IMAGEN_PENDIENTE   = 'assets/images/producto-pendiente.svg';
const CATALOGO_POR_PAGINA_DEFECTO = 12;
const CATALOGO_POR_PAGINA_MAX     = 48;
const CATALOGO_MAX_CODIGOS        = 50;

/** Ordenamientos permitidos (lista blanca: el valor del navegador NUNCA se inserta en el SQL). */
function catalogo_ordenes(): array
{
    return [
        'relevancia'   => 'p.id ASC',                       // orden original del catálogo
        'precio_asc'   => 'p.precio ASC, p.id ASC',
        'precio_desc'  => 'p.precio DESC, p.id ASC',
        'nombre_asc'   => 'p.nombre ASC, p.id ASC',
        'nombre_desc'  => 'p.nombre DESC, p.id ASC',
        'recientes'    => 'p.id DESC',
    ];
}

function catalogo_codigo_valido(string $codigo): bool
{
    return preg_match('/^[A-Za-z0-9_-]{1,20}$/', $codigo) === 1;
}

/**
 * Devuelve una ruta de imagen segura. Solo se aceptan rutas relativas dentro de assets/
 * que existan en disco; si no, se usa la imagen "Foto próximamente".
 */
function catalogo_imagen(?string $ruta): string
{
    if ($ruta === null || $ruta === ''
        || preg_match('#^assets/[A-Za-z0-9_./-]+$#', $ruta) !== 1
        || strpos($ruta, '..') !== false
        || !is_file(RAIZ_PROYECTO . '/' . $ruta)) {
        return CATALOGO_IMAGEN_PENDIENTE;
    }
    return $ruta;
}

/** Texto de un parámetro GET (null si no viene). */
function catalogo_param(string $clave): ?string
{
    if (!isset($_GET[$clave]) || !is_string($_GET[$clave])) {
        return null;
    }
    return trim($_GET[$clave]);
}

/**
 * Lee y valida los filtros de la URL. Si algo no es válido, responde 422 con el detalle por parámetro.
 */
function catalogo_leer_filtros(): array
{
    $errores = [];

    // Parámetros repetidos o en forma de arreglo (?q[]=a) no son válidos.
    foreach ($_GET as $clave => $valor) {
        if (!is_string($valor)) {
            $errores[(string) $clave] = 'Valor no válido.';
        }
    }

    $filtros = [
        'q' => '', 'palabras' => [], 'categoria' => null, 'marca' => null,
        'precio_min' => null, 'precio_max' => null, 'disponibilidad' => 'todos',
        'ofertas' => false, 'destacados' => false, 'orden' => 'relevancia',
        'pagina' => 1, 'por_pagina' => CATALOGO_POR_PAGINA_DEFECTO, 'codigos' => [],
    ];

    // --- Búsqueda de texto ---
    $q = catalogo_param('q');
    if ($q !== null && $q !== '') {
        $q = trim((string) preg_replace('/\s+/u', ' ', $q));
        if (preg_match('//u', $q) !== 1) {
            $errores['q'] = 'La búsqueda contiene caracteres no válidos.';
        } elseif (largo_texto($q) > 80) {
            $errores['q'] = 'La búsqueda no puede superar 80 caracteres.';
        } else {
            $filtros['q'] = $q;
            $palabras = array_values(array_filter(explode(' ', $q), static function ($p) { return $p !== ''; }));
            $filtros['palabras'] = array_slice($palabras, 0, 5);   // máximo 5 palabras
        }
    }

    // --- Categoría (slug) y marca ---
    $categoria = catalogo_param('categoria');
    if ($categoria !== null && $categoria !== '' && $categoria !== 'all') {
        if (preg_match('/^[a-z0-9-]{1,50}$/', $categoria) === 1) {
            $filtros['categoria'] = $categoria;
        } else {
            $errores['categoria'] = 'Categoría no válida.';
        }
    }
    $marca = catalogo_param('marca');
    if ($marca !== null && $marca !== '') {
        if (preg_match('//u', $marca) === 1 && largo_texto($marca) <= 60) {
            $filtros['marca'] = $marca;
        } else {
            $errores['marca'] = 'Marca no válida.';
        }
    }

    // --- Precio ---
    foreach (['precio_min', 'precio_max'] as $clave) {
        $valor = catalogo_param($clave);
        if ($valor !== null && $valor !== '') {
            if (preg_match('/^\d{1,8}(\.\d{1,2})?$/', $valor) === 1) {
                $filtros[$clave] = $valor;
            } else {
                $errores[$clave] = 'Escribe un precio válido (número positivo).';
            }
        }
    }
    if ($filtros['precio_min'] !== null && $filtros['precio_max'] !== null
        && (float) $filtros['precio_min'] > (float) $filtros['precio_max']) {
        $errores['precio_min'] = 'El precio mínimo no puede ser mayor al máximo.';
    }

    // --- Disponibilidad, ofertas, destacados ---
    $disp = catalogo_param('disponibilidad');
    if ($disp !== null && $disp !== '') {
        if (in_array($disp, ['todos', 'disponibles', 'agotados'], true)) {
            $filtros['disponibilidad'] = $disp;
        } else {
            $errores['disponibilidad'] = 'Usa: todos, disponibles o agotados.';
        }
    }
    $filtros['ofertas']    = catalogo_param('ofertas') === '1';
    $filtros['destacados'] = catalogo_param('destacados') === '1';

    // --- Orden ---
    $orden = catalogo_param('orden');
    if ($orden !== null && $orden !== '') {
        if (array_key_exists($orden, catalogo_ordenes())) {
            $filtros['orden'] = $orden;
        } else {
            $errores['orden'] = 'Orden no válido. Opciones: ' . implode(', ', array_keys(catalogo_ordenes())) . '.';
        }
    }

    // --- Paginación ---
    $pagina = catalogo_param('pagina');
    if ($pagina !== null && $pagina !== '') {
        if (preg_match('/^\d{1,6}$/', $pagina) === 1 && (int) $pagina >= 1) {
            $filtros['pagina'] = (int) $pagina;
        } else {
            $errores['pagina'] = 'La página debe ser un número entero mayor a 0.';
        }
    }
    $porPagina = catalogo_param('por_pagina');
    if ($porPagina !== null && $porPagina !== '') {
        if (preg_match('/^\d{1,3}$/', $porPagina) === 1 && (int) $porPagina >= 1 && (int) $porPagina <= CATALOGO_POR_PAGINA_MAX) {
            $filtros['por_pagina'] = (int) $porPagina;
        } else {
            $errores['por_pagina'] = 'por_pagina debe estar entre 1 y ' . CATALOGO_POR_PAGINA_MAX . '.';
        }
    }

    // --- Lista de códigos (para recuperar productos del carrito o favoritos) ---
    $codigos = catalogo_param('codigos');
    if ($codigos !== null && $codigos !== '') {
        $lista = array_values(array_unique(explode(',', $codigos)));
        if (count($lista) > CATALOGO_MAX_CODIGOS) {
            $errores['codigos'] = 'Máximo ' . CATALOGO_MAX_CODIGOS . ' códigos por solicitud.';
        } else {
            foreach ($lista as $codigo) {
                if (!catalogo_codigo_valido($codigo)) {
                    $errores['codigos'] = 'Alguno de los códigos no es válido.';
                    break;
                }
            }
            if (!isset($errores['codigos'])) {
                $filtros['codigos'] = $lista;
            }
        }
    }

    if ($errores !== []) {
        responder_error('parametros_invalidos', 'Revisa los parámetros de la solicitud.', 422, null, ['errores' => $errores]);
    }
    return $filtros;
}

/** Escapa % _ y ! para usarlos de forma literal dentro de un LIKE ... ESCAPE '!'. */
function catalogo_like(string $texto): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $texto) . '%';
}

/**
 * Construye el WHERE con marcadores "?" (consultas preparadas).
 * @return array{0:string,1:array} [cláusula WHERE, parámetros]
 */
function catalogo_construir_where(PDO $pdo, array $f): array
{
    $donde  = ['p.activo = 1'];
    $params = [];

    foreach ($f['palabras'] as $palabra) {
        $patron  = catalogo_like($palabra);
        $donde[] = "(p.nombre LIKE ? ESCAPE '!' OR m.nombre LIKE ? ESCAPE '!' OR c.nombre LIKE ? ESCAPE '!' OR p.descripcion LIKE ? ESCAPE '!')";
        array_push($params, $patron, $patron, $patron, $patron);
    }

    if ($f['categoria'] !== null) {
        // Una categoría "virtual" (Ofertas) no agrupa productos: se resuelve con la bandera en_oferta.
        $consulta = $pdo->prepare('SELECT es_virtual FROM categorias WHERE slug = ?');
        $consulta->execute([$f['categoria']]);
        $fila = $consulta->fetch();
        if ($fila !== false && (int) $fila['es_virtual'] === 1) {
            $donde[] = 'p.en_oferta = 1';
        } else {
            $donde[]  = 'c.slug = ?';
            $params[] = $f['categoria'];
        }
    }
    if ($f['marca'] !== null) {
        $donde[]  = 'm.nombre = ?';
        $params[] = $f['marca'];
    }
    if ($f['precio_min'] !== null) {
        $donde[]  = 'p.precio >= ?';
        $params[] = $f['precio_min'];
    }
    if ($f['precio_max'] !== null) {
        $donde[]  = 'p.precio <= ?';
        $params[] = $f['precio_max'];
    }
    if ($f['disponibilidad'] === 'disponibles') {
        $donde[] = 'p.stock > 0';
    } elseif ($f['disponibilidad'] === 'agotados') {
        $donde[] = 'p.stock = 0';
    }
    if ($f['ofertas']) {
        $donde[] = 'p.en_oferta = 1';
    }
    if ($f['destacados']) {
        $donde[] = 'p.es_destacado = 1';
    }
    if ($f['codigos'] !== []) {
        $donde[] = 'p.codigo IN (' . implode(',', array_fill(0, count($f['codigos']), '?')) . ')';
        foreach ($f['codigos'] as $codigo) {
            $params[] = $codigo;
        }
    }

    return [implode(' AND ', $donde), $params];
}

/** Columnas y tablas comunes de las consultas de producto. */
function catalogo_select_base(): string
{
    return 'SELECT p.id AS pid, p.codigo, p.nombre, p.descripcion, p.precio, p.precio_anterior, p.stock,
                   p.es_destacado, p.en_oferta, p.es_demo,
                   c.slug AS categoria_slug, c.nombre AS categoria_nombre, m.nombre AS marca,
                   (SELECT i.ruta FROM imagenes_productos i WHERE i.producto_id = p.id ORDER BY i.orden ASC LIMIT 1) AS imagen
            FROM productos p
            JOIN categorias c ON c.id = p.categoria_id
            JOIN marcas m ON m.id = p.marca_id';
}

/** Convierte una fila de la BD al formato público de la API. */
function catalogo_formatear(array $fila): array
{
    $precio   = (float) $fila['precio'];
    $anterior = ($fila['precio_anterior'] !== null) ? (float) $fila['precio_anterior'] : null;
    $descuento = 0;
    if ($anterior !== null && $anterior > $precio && $anterior > 0) {
        $descuento = (int) round((1 - $precio / $anterior) * 100);
    }
    $stock = (int) $fila['stock'];

    return [
        'codigo'          => (string) $fila['codigo'],
        'nombre'          => (string) $fila['nombre'],
        'marca'           => (string) $fila['marca'],
        'categoria'       => ['slug' => (string) $fila['categoria_slug'], 'nombre' => (string) $fila['categoria_nombre']],
        'descripcion'     => (string) $fila['descripcion'],
        'precio'          => $precio,
        'precio_anterior' => $anterior,
        'descuento'       => $descuento,
        'stock'           => $stock,
        'disponible'      => $stock > 0,
        'es_destacado'    => (int) $fila['es_destacado'] === 1,
        'en_oferta'       => (int) $fila['en_oferta'] === 1,
        'es_demo'         => (int) $fila['es_demo'] === 1,
        'imagen'          => catalogo_imagen($fila['imagen'] !== null ? (string) $fila['imagen'] : null),
    ];
}

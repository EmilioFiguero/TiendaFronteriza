<?php
declare(strict_types=1);

/**
 * Administración de productos e inventario (Fase 3.6.2).
 * Todas las escrituras son transacciones con la fila del producto bloqueada (FOR UPDATE), consultas
 * preparadas y registro en auditoria_admin dentro de la misma transacción.
 *
 * Reglas de negocio:
 *  - NUNCA se borra un producto (hay pedidos que lo referencian): solo se desactiva.
 *  - Las existencias NO se editan en el formulario del producto: solo cambian por ajustes de inventario
 *    (con motivo y movimiento) o por ventas. Al crear un producto, las existencias iniciales generan un movimiento.
 *  - Cambiar el precio NO altera pedidos anteriores (guardan su propio precio_unitario).
 *  - Las imágenes originales de la tienda no se pueden quitar desde el panel; solo las subidas desde él.
 */

require_once __DIR__ . '/admin.php';
require_once __DIR__ . '/catalogo.php';
require_once __DIR__ . '/inventario.php';

const PROD_STOCK_MAX            = 100000;
const PROD_IMG_DIR              = 'assets/images/products/uploads';
const PROD_IMG_MAX_BYTES        = 2097152;   // 2 MB
const PROD_IMG_MAX_POR_PRODUCTO = 8;
const PROD_IMG_MIN_LADO         = 100;
const PROD_IMG_MAX_LADO         = 6000;
const PROD_IMG_MAX_PIXELES      = 12000000;   // evita agotar la memoria de PHP al decodificar

/* ===================== Utilidades de validación ===================== */

/** Texto limpio: sin caracteres de control (en una sola línea salvo $multilinea). null si no es texto. */
function prod_texto($valor, bool $multilinea = false): ?string
{
    if (!is_string($valor) || preg_match('//u', $valor) !== 1) {
        return null;
    }
    $valor = str_replace("\r\n", "\n", $valor);
    $valor = (string) preg_replace($multilinea ? '/[^\P{C}\n\t]/u' : '/\p{C}/u', $multilinea ? '' : ' ', $valor);
    $valor = $multilinea ? trim($valor) : trim((string) preg_replace('/\s+/u', ' ', $valor));
    return $valor;
}

/** Precio como "700.00" (máx. 999,999.99, mayor que 0) o null. Acepta entero, decimal con ≤2 decimales o texto. */
function prod_precio($valor): ?string
{
    if (is_int($valor)) {
        $s = (string) $valor;
    } elseif (is_float($valor)) {
        $r = round($valor, 2);
        if (abs($valor - $r) > 1e-9) {
            return null;
        }
        $s = number_format($r, 2, '.', '');
    } elseif (is_string($valor)) {
        $s = trim($valor);
    } else {
        return null;
    }
    if (preg_match('/^\d{1,6}(\.\d{1,2})?$/', $s) !== 1) {
        return null;
    }
    $c = pedido_centavos($s);
    return ($c > 0 && $c <= 99999999) ? pedido_decimal($c) : null;
}

function prod_estado_stock(int $stock, int $umbral): string
{
    return $stock <= 0 ? 'agotado' : ($stock <= $umbral ? 'bajo' : 'ok');
}

/* ===================== Catálogos auxiliares ===================== */

function prod_catalogos(PDO $pdo): array
{
    $cat = $pdo->query('SELECT id, slug, nombre FROM categorias WHERE es_virtual = 0 ORDER BY orden, id')->fetchAll();
    $mar = $pdo->query('SELECT id, nombre FROM marcas ORDER BY nombre')->fetchAll();
    return [
        'categorias' => array_map(static fn(array $c): array => ['id' => (int) $c['id'], 'slug' => (string) $c['slug'], 'nombre' => (string) $c['nombre']], $cat),
        'marcas'     => array_map(static fn(array $m): array => ['id' => (int) $m['id'], 'nombre' => (string) $m['nombre']], $mar),
    ];
}

/* ===================== Consultas ===================== */

function prod_formatear(array $f, int $umbral): array
{
    $stock = (int) $f['stock'];
    return [
        'id'            => (int) $f['id'],
        'codigo'        => (string) $f['codigo'],
        'nombre'        => (string) $f['nombre'],
        'categoria'     => ['id' => (int) $f['categoria_id'], 'nombre' => (string) $f['categoria_nombre']],
        'marca'         => ['id' => (int) $f['marca_id'], 'nombre' => (string) $f['marca_nombre']],
        'precio'        => pedido_pesos(pedido_centavos($f['precio'])),
        'stock'         => $stock,
        'estado_stock'  => prod_estado_stock($stock, $umbral),
        'activo'        => (int) $f['activo'] === 1,
        'es_destacado'  => (int) $f['es_destacado'] === 1,
        'en_oferta'     => (int) $f['en_oferta'] === 1,
        'tiene_pedidos' => (int) $f['tiene_pedidos'] === 1,
        'imagen'        => catalogo_imagen($f['imagen'] !== null ? (string) $f['imagen'] : null),
    ];
}

const PROD_SELECT = 'SELECT p.id, p.codigo, p.nombre, p.categoria_id, p.marca_id, p.precio, p.stock, p.activo, p.es_destacado, p.en_oferta,
        c.nombre AS categoria_nombre, m.nombre AS marca_nombre,
        EXISTS (SELECT 1 FROM detalle_pedidos d WHERE d.producto_id = p.id) AS tiene_pedidos,
        (SELECT i.ruta FROM imagenes_productos i WHERE i.producto_id = p.id ORDER BY i.orden ASC, i.id ASC LIMIT 1) AS imagen
   FROM productos p JOIN categorias c ON c.id = p.categoria_id JOIN marcas m ON m.id = p.marca_id';

/** Lista paginada (la usan Productos e Inventario). Orden por lista blanca. */
function productos_listar(PDO $pdo, string $q, string $estado, ?int $categoria, ?int $marca, string $stock, string $orden, int $pagina): array
{
    $umbral = admin_umbral_stock($pdo);
    $donde = [];
    $params = [];
    if ($q !== '') {
        $donde[] = "(p.nombre LIKE :q1 ESCAPE '\\\\' OR p.codigo LIKE :q2 ESCAPE '\\\\')";
        $params[':q1'] = admin_like($q);
        $params[':q2'] = admin_like($q);
    }
    if ($estado === 'activo') {
        $donde[] = 'p.activo = 1';
    } elseif ($estado === 'inactivo') {
        $donde[] = 'p.activo = 0';
    }
    if ($categoria !== null) {
        $donde[] = 'p.categoria_id = :cat';
        $params[':cat'] = $categoria;
    }
    if ($marca !== null) {
        $donde[] = 'p.marca_id = :marca';
        $params[':marca'] = $marca;
    }
    if ($stock === 'agotado') {
        $donde[] = 'p.stock = 0';
    } elseif ($stock === 'bajo') {
        $donde[] = 'p.stock BETWEEN 1 AND :umb';
        $params[':umb'] = $umbral;
    } elseif ($stock === 'ok') {
        $donde[] = 'p.stock > :umb';
        $params[':umb'] = $umbral;
    }
    $sqlDonde = $donde === [] ? '' : ' WHERE ' . implode(' AND ', $donde);
    $ordenes = ['id' => 'p.id ASC', 'stock' => 'p.stock ASC, p.id ASC', 'nombre' => 'p.nombre ASC, p.id ASC', 'reciente' => 'p.id DESC'];
    $sqlOrden = $ordenes[$orden] ?? $ordenes['id'];

    $contar = $pdo->prepare('SELECT COUNT(*) FROM productos p' . $sqlDonde);
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare(PROD_SELECT . $sqlDonde . ' ORDER BY ' . $sqlOrden . ' LIMIT :lim OFFSET :off');
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    return [
        'productos' => array_map(static fn(array $f): array => prod_formatear($f, $umbral), $lista->fetchAll()),
        'pagina' => $pagina, 'paginas' => $paginas, 'total' => $total, 'umbral_stock_bajo' => $umbral,
    ];
}

/** Un producto completo (con descripción e imágenes). null si no existe. */
function producto_detalle(PDO $pdo, int $id): ?array
{
    $umbral = admin_umbral_stock($pdo);
    $s = $pdo->prepare(PROD_SELECT . ' WHERE p.id = :id');
    $s->execute([':id' => $id]);
    $f = $s->fetch();
    if ($f === false) {
        return null;
    }
    $d = $pdo->prepare('SELECT descripcion, UNIX_TIMESTAMP(creado_en) AS ts FROM productos WHERE id = :id');
    $d->execute([':id' => $id]);
    $extra = $d->fetch();

    $im = $pdo->prepare('SELECT id, ruta, orden FROM imagenes_productos WHERE producto_id = :id ORDER BY orden ASC, id ASC');
    $im->execute([':id' => $id]);
    $imagenes = [];
    foreach ($im->fetchAll() as $i) {
        $imagenes[] = [
            'id'       => (int) $i['id'],
            'url'      => catalogo_imagen((string) $i['ruta']),
            'orden'    => (int) $i['orden'],
            'quitable' => strpos((string) $i['ruta'], PROD_IMG_DIR . '/') === 0,
        ];
    }
    return prod_formatear($f, $umbral) + [
        'descripcion' => (string) $extra['descripcion'],
        'creado_en_ms' => ((int) $extra['ts']) * 1000,
        'imagenes' => $imagenes,
    ];
}

/* ===================== Validación de formularios ===================== */

/**
 * @return array{0:array,1:array} [datos limpios, errores por campo]
 */
function producto_validar(PDO $pdo, array $d, bool $crear): array
{
    $err = [];
    $out = [];
    $cat = prod_catalogos($pdo);

    $nombre = prod_texto($d['nombre'] ?? null);
    if ($nombre === null || largo_texto($nombre) < 3 || largo_texto($nombre) > 150) {
        $err['nombre'] = 'El nombre debe tener entre 3 y 150 caracteres.';
    } else {
        $out['nombre'] = $nombre;
    }

    $desc = prod_texto($d['descripcion'] ?? null, true);
    if ($desc === null || largo_texto($desc) < 10 || largo_texto($desc) > 2000) {
        $err['descripcion'] = 'La descripción debe tener entre 10 y 2000 caracteres.';
    } else {
        $out['descripcion'] = $desc;
    }

    $precio = prod_precio($d['precio'] ?? null);
    if ($precio === null) {
        $err['precio'] = 'Escribe un precio mayor que 0 y menor o igual a 999,999.99 (máximo 2 decimales).';
    } else {
        $out['precio'] = $precio;
    }

    $catId = admin_entero($d['categoria_id'] ?? null);
    if ($catId === null || !in_array($catId, array_column($cat['categorias'], 'id'), true)) {
        $err['categoria_id'] = 'Elige una categoría válida.';
    } else {
        $out['categoria_id'] = $catId;
    }
    $marId = admin_entero($d['marca_id'] ?? null);
    if ($marId === null || !in_array($marId, array_column($cat['marcas'], 'id'), true)) {
        $err['marca_id'] = 'Elige una marca válida.';
    } else {
        $out['marca_id'] = $marId;
    }

    foreach (['es_destacado', 'en_oferta'] as $bandera) {
        if (array_key_exists($bandera, $d) && !is_bool($d[$bandera])) {
            $err[$bandera] = 'Debe ser verdadero o falso.';
        } else {
            $out[$bandera] = (bool) ($d[$bandera] ?? false);
        }
    }

    if ($crear) {
        if (isset($d['codigo']) && $d['codigo'] !== '') {
            if (!is_string($d['codigo']) || preg_match('/^[A-Za-z0-9_-]{2,20}$/', $d['codigo']) !== 1) {
                $err['codigo'] = 'El código (SKU) debe tener 2 a 20 letras, números, guion o guion bajo.';
            } else {
                $out['codigo'] = $d['codigo'];
            }
        } else {
            $out['codigo'] = null;
        }
        if (array_key_exists('stock', $d) && $d['stock'] !== '' && $d['stock'] !== null) {
            $s = admin_entero($d['stock'], 0, PROD_STOCK_MAX);
            if ($s === null) {
                $err['stock'] = 'Las existencias iniciales deben ser un entero entre 0 y ' . PROD_STOCK_MAX . '.';
            } else {
                $out['stock'] = $s;
            }
        } else {
            $out['stock'] = 0;
        }
        if (array_key_exists('activo', $d) && !is_bool($d['activo'])) {
            $err['activo'] = 'Debe ser verdadero o falso.';
        } else {
            $out['activo'] = (bool) ($d['activo'] ?? true);
        }
    }
    return [$out, $err];
}

function producto_errores_422(array $errores): void
{
    responder_error('validacion', 'Revisa los datos del formulario.', 422, null, ['errores' => $errores]);
}

/* ===================== Escrituras: productos ===================== */

/** @return array{id:int,codigo:string} */
function producto_crear(PDO $pdo, array $admin, array $d): array
{
    $auto = $d['codigo'] === null;
    $pdo->beginTransaction();
    try {
        if (!$auto) {
            $e = $pdo->prepare('SELECT 1 FROM productos WHERE codigo = :c');
            $e->execute([':c' => $d['codigo']]);
            if ($e->fetchColumn() !== false) {
                $pdo->rollBack();
                producto_errores_422(['codigo' => 'Ya existe un producto con ese código (SKU).']);
            }
        }
        $insertar = $pdo->prepare(
            'INSERT INTO productos (codigo, categoria_id, marca_id, nombre, descripcion, precio, stock, es_destacado, en_oferta, es_demo, activo)
             VALUES (:codigo, :cat, :marca, :nombre, :desc, :precio, :stock, :dest, :oferta, 0, :activo)'
        );
        $id = 0;
        $codigo = '';
        for ($i = 0; $i < 6 && $id === 0; $i++) {
            if ($auto) {
                $n = (int) $pdo->query("SELECT COALESCE(MAX(CAST(SUBSTRING(codigo, 2) AS UNSIGNED)), 0) FROM productos WHERE codigo REGEXP '^p[0-9]+$'")->fetchColumn();
                $codigo = 'p' . ($n + 1 + $i);
            } else {
                $codigo = $d['codigo'];
            }
            try {
                $insertar->execute([
                    ':codigo' => $codigo, ':cat' => $d['categoria_id'], ':marca' => $d['marca_id'], ':nombre' => $d['nombre'],
                    ':desc' => $d['descripcion'], ':precio' => $d['precio'], ':stock' => $d['stock'],
                    ':dest' => $d['es_destacado'] ? 1 : 0, ':oferta' => $d['en_oferta'] ? 1 : 0, ':activo' => $d['activo'] ? 1 : 0,
                ]);
                $id = (int) $pdo->lastInsertId();
            } catch (PDOException $ex) {
                if (errno_de_pdo($ex) !== 1062 || !$auto) {
                    if (errno_de_pdo($ex) === 1062) {
                        $pdo->rollBack();
                        producto_errores_422(['codigo' => 'Ya existe un producto con ese código (SKU).']);
                    }
                    throw $ex;
                }
            }
        }
        if ($id === 0) {
            throw new RuntimeException('No se pudo generar un código de producto único.');
        }
        if ($d['stock'] > 0) {
            inventario_registrar($pdo, $id, 'inicial', $d['stock'], 0, $d['stock'], 'Existencias iniciales al crear el producto', $admin['id']);
        }
        admin_auditar($pdo, $admin['id'], 'producto_creado', 'producto', $id,
            sprintf('codigo=%s | nombre=%s | precio=%s | stock=%d | %s', $codigo, mb_substr($d['nombre'], 0, 80), $d['precio'], $d['stock'], $d['activo'] ? 'activo' : 'inactivo'));
        $pdo->commit();
        return ['id' => $id, 'codigo' => $codigo];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** @return array{cambiado:bool,campos:string[]} */
function producto_actualizar(PDO $pdo, array $admin, int $id, array $d): array
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT codigo, nombre, descripcion, precio, categoria_id, marca_id, es_destacado, en_oferta FROM productos WHERE id = :id FOR UPDATE');
        $s->execute([':id' => $id]);
        $a = $s->fetch();
        if ($a === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese producto.', 404);
        }
        $campos = [];
        $nota = [];
        if ($a['nombre'] !== $d['nombre']) { $campos[] = 'nombre'; }
        if ($a['descripcion'] !== $d['descripcion']) { $campos[] = 'descripcion'; }
        if (pedido_centavos($a['precio']) !== pedido_centavos($d['precio'])) {
            $campos[] = 'precio';
            $nota[] = 'precio ' . pedido_decimal(pedido_centavos($a['precio'])) . ' -> ' . $d['precio'];
        }
        if ((int) $a['categoria_id'] !== $d['categoria_id']) { $campos[] = 'categoria'; }
        if ((int) $a['marca_id'] !== $d['marca_id']) { $campos[] = 'marca'; }
        if (((int) $a['es_destacado'] === 1) !== $d['es_destacado']) { $campos[] = 'es_destacado'; }
        if (((int) $a['en_oferta'] === 1) !== $d['en_oferta']) { $campos[] = 'en_oferta'; }
        if ($campos === []) {
            $pdo->rollBack();
            return ['cambiado' => false, 'campos' => []];
        }
        $u = $pdo->prepare(
            'UPDATE productos SET nombre = :nombre, descripcion = :desc, precio = :precio, categoria_id = :cat, marca_id = :marca,
                    es_destacado = :dest, en_oferta = :oferta WHERE id = :id'
        );
        $u->execute([
            ':nombre' => $d['nombre'], ':desc' => $d['descripcion'], ':precio' => $d['precio'], ':cat' => $d['categoria_id'],
            ':marca' => $d['marca_id'], ':dest' => $d['es_destacado'] ? 1 : 0, ':oferta' => $d['en_oferta'] ? 1 : 0, ':id' => $id,
        ]);
        admin_auditar($pdo, $admin['id'], 'producto_editado', 'producto', $id,
            'codigo=' . $a['codigo'] . ' | campos=' . implode(',', $campos) . ($nota === [] ? '' : ' | ' . implode(' ; ', $nota)));
        $pdo->commit();
        return ['cambiado' => true, 'campos' => $campos];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** @return array{cambiado:bool,activo:bool} */
function producto_cambiar_estado(PDO $pdo, array $admin, int $id, bool $activo): array
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT codigo, activo FROM productos WHERE id = :id FOR UPDATE');
        $s->execute([':id' => $id]);
        $a = $s->fetch();
        if ($a === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese producto.', 404);
        }
        if (((int) $a['activo'] === 1) === $activo) {
            $pdo->rollBack();
            return ['cambiado' => false, 'activo' => $activo];
        }
        $pdo->prepare('UPDATE productos SET activo = :a WHERE id = :id')->execute([':a' => $activo ? 1 : 0, ':id' => $id]);
        admin_auditar($pdo, $admin['id'], $activo ? 'producto_activado' : 'producto_desactivado', 'producto', $id, 'codigo=' . $a['codigo']);
        $pdo->commit();
        return ['cambiado' => true, 'activo' => $activo];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/* ===================== Imágenes ===================== */

/** Valida el archivo subido por su CONTENIDO real (no por su nombre ni por el tipo que declara el navegador). */
function producto_validar_archivo(array $a): array
{
    $codigo = $a['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($codigo === UPLOAD_ERR_INI_SIZE || $codigo === UPLOAD_ERR_FORM_SIZE) {
        responder_error('imagen_grande', 'La imagen supera el tamaño máximo (2 MB).', 413);
    }
    if ($codigo !== UPLOAD_ERR_OK || !is_string($a['tmp_name'] ?? null) || !is_uploaded_file($a['tmp_name'])) {
        responder_error('validacion', 'Selecciona una imagen JPG, PNG o WebP.', 422);
    }
    $tmp = $a['tmp_name'];
    $tam = filesize($tmp);
    if ($tam === false || $tam <= 0) {
        responder_error('validacion', 'El archivo está vacío.', 422);
    }
    if ($tam > PROD_IMG_MAX_BYTES) {
        responder_error('imagen_grande', 'La imagen supera el tamaño máximo (2 MB).', 413);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    $tipos = ['image/jpeg' => ['jpg', IMAGETYPE_JPEG], 'image/png' => ['png', IMAGETYPE_PNG], 'image/webp' => ['webp', IMAGETYPE_WEBP]];
    if (!is_string($mime) || !isset($tipos[$mime])) {
        responder_error('imagen_tipo', 'Solo se aceptan imágenes JPG, PNG o WebP.', 422);
    }
    $info = @getimagesize($tmp);
    if ($info === false || $info[2] !== $tipos[$mime][1]) {
        responder_error('imagen_tipo', 'El archivo no es una imagen válida.', 422);
    }
    if ($info[0] < PROD_IMG_MIN_LADO || $info[1] < PROD_IMG_MIN_LADO || $info[0] > PROD_IMG_MAX_LADO || $info[1] > PROD_IMG_MAX_LADO) {
        responder_error('imagen_dimensiones', 'La imagen debe medir entre ' . PROD_IMG_MIN_LADO . ' y ' . PROD_IMG_MAX_LADO . ' píxeles por lado.', 422);
    }
    if ($info[0] * $info[1] > PROD_IMG_MAX_PIXELES) {
        responder_error('imagen_dimensiones', 'La imagen tiene demasiados píxeles (máximo 12 megapíxeles).', 422);
    }
    // Si PHP tiene la extensión GD (viene activada en XAMPP), se comprueba además que la imagen se pueda DECODIFICAR
    // completa: rechaza archivos truncados o con solo la cabecera de una imagen.
    if (function_exists('imagecreatefromstring')) {
        $bytes = file_get_contents($tmp);
        $gd = $bytes === false ? false : @imagecreatefromstring($bytes);
        if ($gd === false) {
            responder_error('imagen_tipo', 'El archivo no es una imagen válida o está dañado.', 422);
        }
        unset($gd);
    }
    // Defensa extra contra archivos "políglota" (imagen válida con código PHP incrustado).
    $contenido = file_get_contents($tmp);
    if ($contenido === false || stripos($contenido, '<?php') !== false || strpos($contenido, '<?=') !== false) {
        responder_error('imagen_tipo', 'El archivo no es una imagen válida.', 422);
    }
    return ['tmp' => $tmp, 'ext' => $tipos[$mime][0]];
}

function producto_dir_imagenes(): string
{
    $dir = RAIZ_PROYECTO . '/' . PROD_IMG_DIR;
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('No se pudo crear la carpeta de imágenes.');
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {   // por si la carpeta se creó sin el archivo del ZIP
        @file_put_contents($ht, "Options -ExecCGI -Indexes\n<FilesMatch \"(?i)\\.(php[0-9]?|phtml|phar|pl|py|cgi|sh|exe|html?|js)$\">\n  Require all denied\n</FilesMatch>\n");
    }
    return $dir;
}

/** La imagen subida pasa a ser la PRINCIPAL (orden 0); las anteriores se conservan como galería. */
function producto_subir_imagen(PDO $pdo, array $admin, int $id, array $archivo): array
{
    $v = producto_validar_archivo($archivo);
    $dir = producto_dir_imagenes();
    $nombre = bin2hex(random_bytes(16)) . '.' . $v['ext'];
    $destino = $dir . '/' . $nombre;
    $movido = false;

    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT codigo FROM productos WHERE id = :id FOR UPDATE');
        $s->execute([':id' => $id]);
        $codigo = $s->fetchColumn();
        if ($codigo === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese producto.', 404);
        }
        $n = $pdo->prepare('SELECT COUNT(*) FROM imagenes_productos WHERE producto_id = :id');
        $n->execute([':id' => $id]);
        if ((int) $n->fetchColumn() >= PROD_IMG_MAX_POR_PRODUCTO) {
            $pdo->rollBack();
            responder_error('limite_imagenes', 'Un producto puede tener hasta ' . PROD_IMG_MAX_POR_PRODUCTO . ' imágenes.', 409);
        }
        if (!move_uploaded_file($v['tmp'], $destino)) {
            throw new RuntimeException('No se pudo guardar la imagen.');
        }
        $movido = true;
        @chmod($destino, 0644);
        // Hay un índice único (producto_id, orden): se desplaza de la última a la primera para no chocar consigo mismo.
        $pdo->prepare('UPDATE imagenes_productos SET orden = orden + 1 WHERE producto_id = :id ORDER BY orden DESC')->execute([':id' => $id]);
        $ruta = PROD_IMG_DIR . '/' . $nombre;
        $pdo->prepare('INSERT INTO imagenes_productos (producto_id, ruta, orden) VALUES (:p, :r, 0)')->execute([':p' => $id, ':r' => $ruta]);
        $imgId = (int) $pdo->lastInsertId();
        admin_auditar($pdo, $admin['id'], 'producto_imagen_agregada', 'producto', $id, 'codigo=' . $codigo . ' | imagen=' . $nombre);
        $pdo->commit();
        return ['imagen_id' => $imgId, 'url' => $ruta];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($movido && is_file($destino)) {
            @unlink($destino);
        }
        throw $e;
    }
}

/** Solo se pueden quitar imágenes subidas desde el panel (las originales de la tienda no se tocan). */
function producto_quitar_imagen(PDO $pdo, array $admin, int $imagenId): void
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT i.id, i.producto_id, i.ruta, p.codigo FROM imagenes_productos i JOIN productos p ON p.id = i.producto_id WHERE i.id = :id FOR UPDATE');
        $s->execute([':id' => $imagenId]);
        $i = $s->fetch();
        if ($i === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos esa imagen.', 404);
        }
        $ruta = (string) $i['ruta'];
        if (strpos($ruta, PROD_IMG_DIR . '/') !== 0 || preg_match('#^[A-Za-z0-9_./-]+$#', $ruta) !== 1 || strpos($ruta, '..') !== false) {
            $pdo->rollBack();
            responder_error('no_permitido', 'Las imágenes originales de la tienda no se pueden quitar desde el panel.', 409);
        }
        $pdo->prepare('DELETE FROM imagenes_productos WHERE id = :id')->execute([':id' => $imagenId]);
        admin_auditar($pdo, $admin['id'], 'producto_imagen_quitada', 'producto', (int) $i['producto_id'], 'codigo=' . $i['codigo'] . ' | imagen=' . basename($ruta));
        $pdo->commit();
        $archivo = RAIZ_PROYECTO . '/' . $ruta;
        if (is_file($archivo)) {
            @unlink($archivo);
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/* ===================== Inventario ===================== */

/**
 * Ajuste manual. tipo: entrada (+cantidad), salida (-cantidad) o ajuste (fijar existencias = cantidad).
 * "esperado" son las existencias que el administrador vio en pantalla: si ya cambiaron (otra venta, otro
 * ajuste o una solicitud repetida) se rechaza con 409 en vez de aplicar el cambio dos veces.
 */
function inventario_ajustar(PDO $pdo, array $admin, int $productoId, string $tipo, int $cantidad, int $esperado, string $motivo): array
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare('SELECT id, codigo, nombre, stock FROM productos WHERE id = :id FOR UPDATE');
        $s->execute([':id' => $productoId]);
        $p = $s->fetch();
        if ($p === false) {
            $pdo->rollBack();
            responder_error('no_encontrado', 'No encontramos ese producto.', 404);
        }
        $actual = (int) $p['stock'];
        if ($actual !== $esperado) {
            $pdo->rollBack();
            responder_error('existencias_cambiaron', 'Las existencias cambiaron mientras revisabas (ahora son ' . $actual . '). Revisa y vuelve a intentar.', 409, null, ['actual' => $actual]);
        }
        if ($tipo === 'entrada') {
            $nuevo = $actual + $cantidad;
        } elseif ($tipo === 'salida') {
            if ($cantidad > $actual) {
                $pdo->rollBack();
                responder_error('existencias_insuficientes', 'No se puede sacar ' . $cantidad . ' unidades: solo hay ' . $actual . '. Las existencias no pueden quedar negativas.', 409, null, ['actual' => $actual]);
            }
            $nuevo = $actual - $cantidad;
        } else {
            $nuevo = $cantidad;
        }
        if ($nuevo > PROD_STOCK_MAX) {
            $pdo->rollBack();
            responder_error('validacion', 'Las existencias no pueden superar ' . PROD_STOCK_MAX . ' unidades.', 422);
        }
        $delta = $nuevo - $actual;
        if ($delta === 0) {
            $pdo->rollBack();
            return ['cambiado' => false, 'stock' => $actual, 'movimiento_id' => null];
        }
        $u = $pdo->prepare('UPDATE productos SET stock = :n WHERE id = :id AND stock = :a');
        $u->execute([':n' => $nuevo, ':id' => $productoId, ':a' => $actual]);
        if ($u->rowCount() !== 1) {
            throw new RuntimeException('No se pudo actualizar las existencias.');
        }
        inventario_registrar($pdo, $productoId, $tipo, $delta, $actual, $nuevo, $motivo, $admin['id']);
        $movId = (int) $pdo->lastInsertId();
        admin_auditar($pdo, $admin['id'], 'inventario_' . $tipo, 'producto', $productoId,
            sprintf('codigo=%s | %d -> %d (%+d) | motivo=%s', $p['codigo'], $actual, $nuevo, $delta, $motivo));
        $pdo->commit();
        return ['cambiado' => true, 'stock' => $nuevo, 'movimiento_id' => $movId];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function movimientos_listar(PDO $pdo, ?int $productoId, string $tipo, int $pagina): array
{
    $donde = [];
    $params = [];
    if ($productoId !== null) {
        $donde[] = 'm.producto_id = :p';
        $params[':p'] = $productoId;
    }
    if ($tipo !== '') {
        $donde[] = 'm.tipo = :t';
        $params[':t'] = $tipo;
    }
    $sqlDonde = $donde === [] ? '' : ' WHERE ' . implode(' AND ', $donde);

    $contar = $pdo->prepare('SELECT COUNT(*) FROM movimientos_inventario m' . $sqlDonde);
    $contar->execute($params);
    $total = (int) $contar->fetchColumn();
    $paginas = max(1, (int) ceil($total / ADMIN_POR_PAGINA));
    $pagina = min(max(1, $pagina), $paginas);

    $lista = $pdo->prepare(
        'SELECT m.id, m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo, m.motivo, UNIX_TIMESTAMP(m.creado_en) AS ts,
                p.codigo, p.nombre AS producto, u.nombre AS responsable, pe.numero_pedido
           FROM movimientos_inventario m
           JOIN productos p ON p.id = m.producto_id
           LEFT JOIN usuarios u ON u.id = m.usuario_id
           LEFT JOIN pedidos pe ON pe.id = m.pedido_id'
        . $sqlDonde . ' ORDER BY m.id DESC LIMIT :lim OFFSET :off'
    );
    foreach ($params as $k => $v) {
        $lista->bindValue($k, $v);
    }
    $lista->bindValue(':lim', ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->bindValue(':off', ($pagina - 1) * ADMIN_POR_PAGINA, PDO::PARAM_INT);
    $lista->execute();

    $filas = [];
    foreach ($lista->fetchAll() as $f) {
        $filas[] = [
            'id' => (int) $f['id'], 'tipo' => (string) $f['tipo'], 'cantidad' => (int) $f['cantidad'],
            'stock_anterior' => (int) $f['stock_anterior'], 'stock_nuevo' => (int) $f['stock_nuevo'],
            'motivo' => $f['motivo'] !== null ? (string) $f['motivo'] : null,
            'codigo' => (string) $f['codigo'], 'producto' => (string) $f['producto'],
            'responsable' => $f['responsable'] !== null ? (string) $f['responsable'] : 'Sistema',
            'numero_pedido' => $f['numero_pedido'] !== null ? (string) $f['numero_pedido'] : null,
            'creado_en_ms' => ((int) $f['ts']) * 1000,
        ];
    }
    return ['movimientos' => $filas, 'pagina' => $pagina, 'paginas' => $paginas, 'total' => $total];
}

/* ===================== Configuración ===================== */

function configuracion_guardar_umbral(PDO $pdo, array $admin, int $nuevo): array
{
    $pdo->beginTransaction();
    try {
        $s = $pdo->prepare("SELECT valor FROM configuracion_tienda WHERE clave = 'umbral_stock_bajo' FOR UPDATE");
        $s->execute();
        $v = $s->fetchColumn();
        $anterior = ($v !== false && admin_entero((string) $v, 1, 100) !== null) ? (int) $v : ADMIN_STOCK_BAJO;
        if ($v !== false && $anterior === $nuevo && (string) $v === (string) $nuevo) {
            $pdo->rollBack();
            return ['cambiado' => false, 'umbral' => $nuevo];
        }
        $pdo->prepare(
            "INSERT INTO configuracion_tienda (clave, valor, actualizado_por) VALUES ('umbral_stock_bajo', :v, :u)
             ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_por = VALUES(actualizado_por)"
        )->execute([':v' => (string) $nuevo, ':u' => $admin['id']]);
        admin_auditar($pdo, $admin['id'], 'configuracion_editada', 'configuracion', 'umbral_stock_bajo', $anterior . ' -> ' . $nuevo);
        $pdo->commit();
        return ['cambiado' => true, 'umbral' => $nuevo];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

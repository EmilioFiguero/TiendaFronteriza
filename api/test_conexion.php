<?php
declare(strict_types=1);

/**
 * ============================================================
 *  SOLO PARA DESARROLLO — BORRAR ANTES DE ENTREGAR EL PROYECTO
 * ============================================================
 * Comprueba: PHP funciona, hay conexión con MariaDB, la base
 * tienda_fronteriza es accesible y se pueden contar los productos.
 * Es de solo lectura (únicamente SELECT).
 */
require_once __DIR__ . '/../includes/bootstrap.php';

// 1) Solo desde el mismo equipo (evita exponerlo en la red local).
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
if (!in_array($ip, ['127.0.0.1', '::1'], true)) {
    responder_error('acceso_denegado', 'Este endpoint solo está disponible desde el mismo equipo.', 403);
}

// 2) Solo lectura: únicamente GET (o HEAD).
$metodo = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if (!in_array($metodo, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    responder_error('metodo_no_permitido', 'Usa el método GET.', 405);
}

try {
    $pdo = obtener_conexion();

    // Servidor, base activa y codificación de la conexión.
    $consulta = $pdo->prepare(
        'SELECT VERSION() AS servidor, DATABASE() AS base_de_datos, @@character_set_connection AS codificacion'
    );
    $consulta->execute();
    $info = $consulta->fetch();

    // Cuántas tablas tiene la base (se esperan 11). Parámetro enlazado, no concatenado.
    $consulta = $pdo->prepare(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = :bd AND table_type = 'BASE TABLE'"
    );
    $consulta->execute([':bd' => (string) $info['base_de_datos']]);
    $tablas = (int) $consulta->fetchColumn();

    // Cuántos productos hay registrados (se esperan 6).
    $consulta = $pdo->prepare('SELECT COUNT(*) FROM productos');
    $consulta->execute();
    $productos = (int) $consulta->fetchColumn();

    responder_json([
        'ok'      => true,
        'mensaje' => 'Conexión correcta con la base de datos.',
        'php'     => ['version' => PHP_VERSION],
        'base_de_datos' => [
            'nombre'                => $info['base_de_datos'],
            'servidor'              => $info['servidor'],
            'codificacion'          => $info['codificacion'],
            'tablas'                => $tablas,
            'productos_registrados' => $productos,
        ],
        'aviso'   => 'Endpoint de prueba: elimina api/test_conexion.php antes de entregar el proyecto.',
    ]);
} catch (ConfiguracionException $e) {
    $ref = generar_referencia();
    registrar_log($ref, 'config_incompleta', $e->getMessage());
    responder_error('config_incompleta', 'El servidor no está configurado correctamente. Revisa logs/backend.log con la referencia.', 500, $ref);
} catch (ConexionException $e) {
    $ref = generar_referencia();
    registrar_log($ref, 'conexion_fallida', sprintf('errno=%d pista="%s"', $e->errno, pista_error_mysql($e->errno)));
    responder_error('conexion_fallida', 'No se pudo conectar con la base de datos. Revisa logs/backend.log con la referencia.', 503, $ref);
} catch (PDOException $e) {
    $errno = errno_de_pdo($e);
    $ref = generar_referencia();
    registrar_log($ref, 'consulta_fallida', sprintf('errno=%d pista="%s"', $errno, pista_error_mysql($errno)));
    responder_error('consulta_fallida', 'La conexión funciona, pero no se pudo consultar la base de datos. Revisa logs/backend.log con la referencia.', 500, $ref);
}

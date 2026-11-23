<?php
declare(strict_types=1);

/**
 * Conexión a MariaDB/MySQL con PDO.
 *
 * Seguridad:
 *  - Las credenciales viven en config/config.php (carpeta bloqueada al navegador).
 *  - Consultas preparadas reales (ATTR_EMULATE_PREPARES = false).
 *  - Si algo falla se lanza una excepción SIN datos sensibles: nunca se
 *    reenvía el mensaje original de PDO (podría incluir usuario o servidor).
 */

/** Problema de configuración (config.php incompleto o falta una extensión de PHP). */
class ConfiguracionException extends RuntimeException
{
}

/** No se pudo abrir la conexión. Solo guarda el número de error de MySQL/MariaDB. */
class ConexionException extends RuntimeException
{
    /** @var int */
    public $errno;

    public function __construct(int $errno)
    {
        parent::__construct('No se pudo conectar con la base de datos.');
        $this->errno = $errno;
    }
}

/** Lee config/config.php una sola vez. */
function cargar_configuracion(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $ruta = __DIR__ . '/config.php';
    if (!is_file($ruta)) {
        throw new ConfiguracionException('No existe config/config.php (copia config.example.php).');
    }

    $datos = require $ruta;
    if (!is_array($datos)) {
        throw new ConfiguracionException('config/config.php debe devolver un arreglo.');
    }

    $config = $datos;
    return $config;
}

/** Valida y devuelve la sección "db" de la configuración. */
function configuracion_bd(): array
{
    $config = cargar_configuracion();
    $bd = (isset($config['db']) && is_array($config['db'])) ? $config['db'] : [];

    $host = isset($bd['host']) ? $bd['host'] : '';
    if (!is_string($host) || !preg_match('/^[A-Za-z0-9.\-]{1,100}$/', $host)) {
        throw new ConfiguracionException('db.host no es válido.');
    }

    $puerto = isset($bd['port']) ? $bd['port'] : 0;
    if (is_string($puerto) && ctype_digit($puerto)) {
        $puerto = (int) $puerto;
    }
    if (!is_int($puerto) || $puerto < 1 || $puerto > 65535) {
        throw new ConfiguracionException('db.port debe ser un número entre 1 y 65535.');
    }

    $nombre = isset($bd['name']) ? $bd['name'] : '';
    if (!is_string($nombre) || !preg_match('/^[A-Za-z0-9_]{1,64}$/', $nombre)) {
        throw new ConfiguracionException('db.name no es válido.');
    }

    $usuario = isset($bd['user']) ? $bd['user'] : '';
    if (!is_string($usuario) || $usuario === '') {
        throw new ConfiguracionException('db.user está vacío.');
    }

    // null = "no configurada". La cadena vacía '' sí es válida (usuario sin contraseña).
    if (!isset($bd['password']) || !is_string($bd['password'])) {
        throw new ConfiguracionException('db.password sin configurar (usa \'\' si no tiene contraseña).');
    }

    return [
        'host'     => $host,
        'port'     => $puerto,
        'name'     => $nombre,
        'user'     => $usuario,
        'password' => $bd['password'],
    ];
}

/** Extrae el número de error de MySQL/MariaDB de una PDOException. */
function errno_de_pdo(PDOException $e): int
{
    if (isset($e->errorInfo[1]) && is_numeric($e->errorInfo[1])) {
        return (int) $e->errorInfo[1];
    }
    if (is_numeric($e->getCode())) {
        return (int) $e->getCode();
    }
    if (preg_match('/\[(\d{3,5})\]/', $e->getMessage(), $m)) {
        return (int) $m[1];
    }
    return 0;
}

/**
 * Devuelve la conexión PDO (se crea una sola vez por solicitud).
 *
 * @throws ConfiguracionException si config.php o PHP están mal configurados
 * @throws ConexionException      si MariaDB rechaza o no responde la conexión
 */
function obtener_conexion(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!extension_loaded('pdo_mysql')) {
        throw new ConfiguracionException('Falta la extensión pdo_mysql de PHP (actívala en php.ini).');
    }

    $bd = configuracion_bd();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $bd['host'], $bd['port'], $bd['name']);

    try {
        $conexion = new PDO($dsn, $bd['user'], $bd['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // errores como excepciones
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,                    // consultas preparadas reales
            PDO::ATTR_TIMEOUT            => 5,                        // no dejar la página colgada
        ]);
        // Misma collation que usa tienda_fronteriza.sql.
        $conexion->exec('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
    } catch (PDOException $e) {
        // Se descarta a propósito el mensaje original (puede contener usuario/servidor).
        throw new ConexionException(errno_de_pdo($e));
    }

    $pdo = $conexion;
    return $pdo;
}

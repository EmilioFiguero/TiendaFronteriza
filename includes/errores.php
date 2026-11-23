<?php
declare(strict_types=1);

/** Código corto (ej. "A1B2C3") que une lo que ve el visitante con el log privado. */
function generar_referencia(): string
{
    try {
        return strtoupper(bin2hex(random_bytes(3)));
    } catch (Exception $e) {
        return strtoupper(dechex(mt_rand(0x100000, 0xFFFFFF)));
    }
}

/**
 * Agrega una línea a logs/backend.log (carpeta bloqueada al navegador).
 * Nunca escribir contraseñas ni datos personales aquí.
 */
function registrar_log(string $referencia, string $codigo, string $detalle = ''): void
{
    $linea = sprintf("[%s] ref=%s codigo=%s %s\n", date('Y-m-d H:i:s'), $referencia, $codigo, $detalle);
    $carpeta = dirname(__DIR__) . '/logs';

    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    $escrito = is_dir($carpeta)
        && @file_put_contents($carpeta . '/backend.log', $linea, FILE_APPEND | LOCK_EX) !== false;

    if (!$escrito) {
        error_log(trim($linea));   // plan B: el log de PHP/Apache
    }
}

/** Traduce un número de error de MariaDB a una pista en español (solo para el log). */
function pista_error_mysql(int $errno): string
{
    switch ($errno) {
        case 1045:
            return 'Usuario o contraseña incorrectos: revisa db.user y db.password en config/config.php.';
        case 1044:
        case 1142:
            return 'Sin permisos sobre la base de datos, o la base no existe: revisa db.name y los permisos (GRANT) del usuario.';
        case 1049:
            return 'La base de datos no existe: revisa db.name o importa tienda_fronteriza.sql.';
        case 1146:
            return 'Falta una tabla: importa tienda_fronteriza.sql en esa base de datos.';
        case 2002:
        case 2003:
            return 'No se llegó al servidor: MySQL apagado en XAMPP, o db.host / db.port incorrectos.';
        case 2006:
        case 2013:
            return 'El servidor cerró la conexión: reinicia MySQL en XAMPP.';
        default:
            return 'Error de base de datos sin pista específica (busca el número en la documentación de MariaDB).';
    }
}

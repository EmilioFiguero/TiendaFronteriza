<?php
declare(strict_types=1);

/**
 * Carga común de los endpoints de la API:
 *     require_once __DIR__ . '/../includes/api.php';
 */
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/entrada.php';
require_once __DIR__ . '/sesion.php';
require_once __DIR__ . '/limitador.php';

/** 429 con Retry-After. */
function responder_limite(int $segundos): void
{
    header('Retry-After: ' . $segundos);
    $minutos = (int) ceil($segundos / 60);
    responder_error(
        'demasiados_intentos',
        'Demasiados intentos. Inténtalo de nuevo en ' . $minutos . ' minuto' . ($minutos === 1 ? '' : 's') . '.',
        429,
        null,
        ['espera_segundos' => $segundos]
    );
}

/**
 * Convierte cualquier fallo interno en una respuesta JSON genérica.
 * El detalle (sin contraseñas) queda en logs/backend.log con la misma referencia.
 */
function manejar_fallo(Throwable $e): void
{
    $ref = generar_referencia();

    if ($e instanceof ConfiguracionException) {
        registrar_log($ref, 'config_incompleta', $e->getMessage());
        responder_error('config_incompleta', 'El servidor no está configurado correctamente.', 500, $ref);
    }
    if ($e instanceof ConexionException) {
        registrar_log($ref, 'conexion_fallida', sprintf('errno=%d pista="%s"', $e->errno, pista_error_mysql($e->errno)));
        responder_error('servicio_no_disponible', 'No se pudo conectar con la base de datos. Inténtalo más tarde.', 503, $ref);
    }
    if ($e instanceof PDOException) {
        $errno = errno_de_pdo($e);
        registrar_log($ref, 'error_bd', sprintf('errno=%d pista="%s"', $errno, pista_error_mysql($errno)));
        responder_error('error_interno', 'Ocurrió un error inesperado en el servidor.', 500, $ref);
    }

    registrar_log($ref, 'error_interno', get_class($e) . ' en ' . basename($e->getFile()) . ':' . $e->getLine());
    responder_error('error_interno', 'Ocurrió un error inesperado en el servidor.', 500, $ref);
}

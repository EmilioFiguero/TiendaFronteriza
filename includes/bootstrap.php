<?php
declare(strict_types=1);

/**
 * Arranque común de la API. Todo archivo de api/ empieza con:
 *     require_once __DIR__ . '/../includes/bootstrap.php';
 *
 * Garantiza que ningún error de PHP llegue al visitante: los detalles
 * se guardan en logs/backend.log y el navegador solo recibe JSON genérico.
 */

// Nunca mostrar errores al visitante; solo registrarlos.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
ini_set('zend.exception_ignore_args', '1');   // las trazas no incluyen argumentos (contraseñas)
error_reporting(E_ALL);

define('RAIZ_PROYECTO', dirname(__DIR__));

require_once __DIR__ . '/respuesta.php';
require_once __DIR__ . '/errores.php';
require_once RAIZ_PROYECTO . '/config/database.php';

// Zona horaria para la hora del log (configurable en config.php).
try {
    $zona = cargar_configuracion()['app']['zona_horaria'] ?? '';
    if (is_string($zona) && $zona !== '') {
        date_default_timezone_set($zona);
    }
} catch (Throwable $e) {
    // Si config.php falla, cada endpoint lo reportará con su propia respuesta.
}

// Cualquier excepción no atrapada -> JSON genérico + detalle al log.
set_exception_handler(function (Throwable $e) {
    $ref = generar_referencia();
    registrar_log($ref, 'excepcion_no_controlada', sprintf(
        '%s: %s (%s:%d)',
        get_class($e),
        $e->getMessage(),
        basename($e->getFile()),
        $e->getLine()
    ));
    responder_error('error_interno', 'Ocurrió un error inesperado en el servidor.', 500, $ref);
});

// Errores fatales de PHP -> JSON genérico (si aún se puede responder).
register_shutdown_function(function () {
    $error = error_get_last();
    $fatales = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if ($error !== null && in_array($error['type'], $fatales, true)) {
        $ref = generar_referencia();
        registrar_log($ref, 'error_fatal', sprintf(
            '%s (%s:%d)',
            $error['message'],
            basename($error['file']),
            $error['line']
        ));
        responder_error('error_interno', 'Ocurrió un error inesperado en el servidor.', 500, $ref);
    }
});

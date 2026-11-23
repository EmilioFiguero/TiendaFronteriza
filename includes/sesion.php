<?php
declare(strict_types=1);

/**
 * Sesiones PHP seguras y protección CSRF.
 *  - La cookie de sesión es HttpOnly (JavaScript no puede leerla), SameSite=Lax
 *    y Secure automáticamente cuando el sitio se sirve por HTTPS.
 *  - El identificador de sesión se regenera al iniciar sesión (anti "session fixation").
 *  - En el navegador NO se guarda ninguna contraseña, token ni identificador de sesión.
 */

const SESION_NOMBRE          = 'TFSESSID';
const SESION_INACTIVIDAD     = 7200;    // 2 h sin actividad -> se cierra
const SESION_DURACION_MAXIMA = 28800;   // 8 h desde el inicio -> se cierra

function es_https(): bool
{
    $https = isset($_SERVER['HTTPS']) ? strtolower((string) $_SERVER['HTTPS']) : '';
    if ($https !== '' && $https !== 'off') {
        return true;
    }
    return isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443';
}

/** La cookie solo se envía a la carpeta del proyecto (ej. /tienda-fronteriza/), no a otras apps de localhost. */
function ruta_cookie_sesion(): string
{
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string) $_SERVER['SCRIPT_NAME'] : '';
    $base = dirname(dirname($script));   // /tienda-fronteriza/api/login.php -> /tienda-fronteriza
    if ($base === '' || $base === '/' || $base === '\\' || $base === '.' || preg_match('#^/[A-Za-z0-9_\-./]*$#', $base) !== 1) {
        return '/';
    }
    return rtrim($base, '/') . '/';
}

/** Inicia la sesión con parámetros seguros. Se puede llamar varias veces. */
function iniciar_sesion_segura(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');     // rechaza identificadores de sesión inventados por un atacante
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', (string) SESION_INACTIVIDAD);
    session_cache_limiter('');                   // las cabeceras de caché las controla la API
    session_name(SESION_NOMBRE);
    session_set_cookie_params([
        'lifetime' => 0,                         // la cookie desaparece al cerrar el navegador
        'path'     => ruta_cookie_sesion(),
        'secure'   => es_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if (!session_start()) {
        throw new RuntimeException('No se pudo iniciar la sesión PHP.');
    }

    // Caducidad por inactividad y por duración máxima.
    if (isset($_SESSION['usuario_id'])) {
        $ahora  = time();
        $inicio = isset($_SESSION['inicio']) ? (int) $_SESSION['inicio'] : 0;
        $ultima = isset($_SESSION['ultima_actividad']) ? (int) $_SESSION['ultima_actividad'] : 0;
        if (($ahora - $ultima) > SESION_INACTIVIDAD || ($ahora - $inicio) > SESION_DURACION_MAXIMA) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
    }
}

/** Token CSRF de la sesión actual (se crea si no existe). */
function token_csrf(): string
{
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf']) || $_SESSION['csrf'] === '') {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/** Exige la cabecera X-CSRF-Token válida en solicitudes que modifican el estado. */
function exigir_csrf(): void
{
    $real     = isset($_SESSION['csrf']) && is_string($_SESSION['csrf']) ? $_SESSION['csrf'] : '';
    $enviado  = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? (string) $_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    if ($real === '' || $enviado === '' || !hash_equals($real, $enviado)) {
        responder_error('csrf_invalido', 'La verificación de seguridad expiró. Vuelve a intentarlo.', 403);
    }
}

/** Marca la sesión como autenticada: regenera el id y rota el token CSRF. */
function iniciar_sesion_usuario(int $usuarioId): void
{
    session_regenerate_id(true);
    $ahora = time();
    $_SESSION['usuario_id']       = $usuarioId;
    $_SESSION['inicio']           = $ahora;
    $_SESSION['ultima_actividad'] = $ahora;
    $_SESSION['csrf']             = bin2hex(random_bytes(32));
}

/** Destruye la sesión y borra su cookie del navegador. */
function cerrar_sesion_completa(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }
    $_SESSION = [];
    $p = session_get_cookie_params();
    if (!headers_sent()) {
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'] !== '' ? $p['samesite'] : 'Lax',
        ]);
    }
    session_destroy();
}

/**
 * Datos públicos del usuario autenticado, o null.
 * Consulta la BD en cada llamada: si la cuenta fue desactivada, la sesión se cierra.
 */
function usuario_autenticado(PDO $pdo): ?array
{
    if (session_status() !== PHP_SESSION_ACTIVE || !isset($_SESSION['usuario_id']) || !is_int($_SESSION['usuario_id'])) {
        return null;
    }

    $consulta = $pdo->prepare('SELECT id, nombre, correo, activo FROM usuarios WHERE id = :id');
    $consulta->execute([':id' => $_SESSION['usuario_id']]);
    $fila = $consulta->fetch();

    if ($fila === false || (int) $fila['activo'] !== 1) {
        cerrar_sesion_completa();
        return null;
    }

    $_SESSION['ultima_actividad'] = time();
    return [
        'id'     => (int) $fila['id'],
        'nombre' => (string) $fila['nombre'],
        'correo' => (string) $fila['correo'],
    ];
}

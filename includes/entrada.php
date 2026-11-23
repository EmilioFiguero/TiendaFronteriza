<?php
declare(strict_types=1);

/**
 * Lectura y validación de lo que envía el navegador.
 * Regla de oro: el servidor NUNCA confía en lo que llega; valida todo otra vez.
 */

const TAM_MAX_JSON = 10240;   // 10 KB: de sobra para un formulario

/** IP del cliente. Se usa REMOTE_ADDR (no se confía en cabeceras que el cliente puede falsificar). */
function ip_cliente(): string
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : '0.0.0.0';
}

/** Termina con 405 si el método HTTP no está permitido. */
function solo_metodo(string ...$permitidos): void
{
    $metodo = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
    if (!in_array($metodo, $permitidos, true)) {
        header('Allow: ' . implode(', ', $permitidos));
        responder_error('metodo_no_permitido', 'Método no permitido.', 405);
    }
}

/** Si el navegador envía "Origin", debe ser este mismo sitio (defensa extra contra CSRF). */
function verificar_origen(): void
{
    if (!isset($_SERVER['HTTP_ORIGIN'])) {
        return;
    }
    $origen = (string) $_SERVER['HTTP_ORIGIN'];
    $host   = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '';
    $partes = parse_url($origen);

    $hostOrigen = '';
    if (is_array($partes) && isset($partes['host'])) {
        $hostOrigen = $partes['host'] . (isset($partes['port']) ? ':' . $partes['port'] : '');
    }
    if ($hostOrigen === '' || strcasecmp($hostOrigen, $host) !== 0) {
        responder_error('origen_invalido', 'Solicitud no permitida desde este origen.', 403);
    }
}

/** Lee el cuerpo JSON de una solicitud POST. Responde 415/413/400 si no es válido. */
function leer_json(): array
{
    $tipo = isset($_SERVER['CONTENT_TYPE']) ? strtolower((string) $_SERVER['CONTENT_TYPE']) : '';
    if (strpos($tipo, 'application/json') !== 0) {
        responder_error('tipo_no_soportado', 'Se esperaba una solicitud application/json.', 415);
    }

    $cuerpo = file_get_contents('php://input', false, null, 0, TAM_MAX_JSON + 1);
    if ($cuerpo === false || strlen($cuerpo) > TAM_MAX_JSON) {
        responder_error('cuerpo_invalido', 'La solicitud es demasiado grande o no se pudo leer.', 413);
    }

    try {
        $datos = json_decode($cuerpo, true, 8, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        responder_error('cuerpo_invalido', 'El cuerpo de la solicitud no es un JSON válido.', 400);
    }
    if (!is_array($datos)) {
        responder_error('cuerpo_invalido', 'El cuerpo de la solicitud no es válido.', 400);
    }
    return $datos;
}

/** Devuelve un campo como texto; si falta o no es texto, devuelve ''. */
function texto_campo(array $datos, string $clave): string
{
    return (isset($datos[$clave]) && is_string($datos[$clave])) ? $datos[$clave] : '';
}

/** Longitud en caracteres (no en bytes). */
function largo_texto(string $texto): int
{
    $n = preg_match_all('/./us', $texto);
    return $n === false ? strlen($texto) : $n;
}

/* ------------------------- Normalización y validación ------------------------- */

function normalizar_nombre(string $nombre): string
{
    $nombre = trim($nombre);
    $limpio = preg_replace('/\s+/u', ' ', $nombre);
    return $limpio === null ? $nombre : $limpio;
}

/** Devuelve '' si es válido, o el mensaje de error. */
function error_nombre(string $nombre): string
{
    if ($nombre === '') {
        return 'El nombre es obligatorio.';
    }
    if (preg_match('//u', $nombre) !== 1) {
        return 'El nombre contiene caracteres no válidos.';
    }
    $largo = largo_texto($nombre);
    if ($largo < 2) {
        return 'El nombre debe tener al menos 2 caracteres.';
    }
    if ($largo > 100) {
        return 'El nombre no puede superar 100 caracteres.';
    }
    // Solo letras (con acentos), espacios, punto, apóstrofo y guion: bloquea < > & " y similares.
    if (preg_match('/^[\p{L}\p{M}][\p{L}\p{M} .\'’\-]*$/u', $nombre) !== 1) {
        return 'El nombre solo puede incluir letras, espacios, puntos, apóstrofos y guiones.';
    }
    return '';
}

function normalizar_correo(string $correo): string
{
    $correo = trim($correo);
    return function_exists('mb_strtolower') ? mb_strtolower($correo, 'UTF-8') : strtolower($correo);
}

function error_correo(string $correo): string
{
    if ($correo === '') {
        return 'El correo es obligatorio.';
    }
    if (strlen($correo) > 150 || filter_var($correo, FILTER_VALIDATE_EMAIL) === false) {
        return 'Escribe un correo con formato válido.';
    }
    return '';
}

/** Mínimo 8 caracteres, al menos una letra y un número (igual que el formulario). Máximo 72 bytes (límite de bcrypt). */
function error_password(#[\SensitiveParameter] string $password): string
{
    if ($password === '') {
        return 'La contraseña es obligatoria.';
    }
    if (strlen($password) > 72) {
        return 'La contraseña no puede superar 72 caracteres.';
    }
    if (strlen($password) < 8 || preg_match('/[A-Za-z]/', $password) !== 1 || preg_match('/\d/', $password) !== 1) {
        return 'Debe tener al menos 8 caracteres, con letras y números.';
    }
    return '';
}

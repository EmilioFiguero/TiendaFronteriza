<?php
declare(strict_types=1);

/**
 * Limitador de intentos SIN tocar la base de datos: guarda marcas de tiempo
 * en archivos dentro de storage/limites/ (carpeta bloqueada al navegador).
 * Los nombres de archivo son hashes: nunca aparece un correo ni una IP en claro.
 */

const LIM_VENTANA_LOGIN      = 900;   // 15 minutos
const LIM_INTENTOS_CUENTA_IP = 5;     // fallos por (correo + IP) en la ventana
const LIM_INTENTOS_IP        = 20;    // fallos por IP en la ventana
const LIM_VENTANA_REGISTRO   = 3600;  // 1 hora
const LIM_REGISTROS_IP       = 15;    // solicitudes de registro por IP en la ventana

function limitador_carpeta(): string
{
    $carpeta = dirname(__DIR__) . '/storage/limites';
    if (!is_dir($carpeta)) {
        @mkdir($carpeta, 0755, true);
    }
    return $carpeta;
}

/** Abre (y bloquea) el archivo de una clave. Devuelve false si no se puede escribir. */
function limitador_abrir(string $clave)
{
    $carpeta = limitador_carpeta();
    if (!is_dir($carpeta) || !is_writable($carpeta)) {
        return false;
    }
    $manejador = @fopen($carpeta . '/' . hash('sha256', $clave) . '.json', 'c+');
    if ($manejador === false) {
        return false;
    }
    flock($manejador, LOCK_EX);
    return $manejador;
}

/** Marcas de tiempo vigentes (dentro de la ventana). */
function limitador_leer($manejador, int $ventana): array
{
    rewind($manejador);
    $crudo = stream_get_contents($manejador);
    $datos = json_decode(($crudo === false || $crudo === '') ? '[]' : $crudo, true);
    if (!is_array($datos)) {
        return [];
    }
    $desde = time() - $ventana;
    $vigentes = [];
    foreach ($datos as $marca) {
        if (is_int($marca) && $marca > $desde) {
            $vigentes[] = $marca;
        }
    }
    return $vigentes;
}

function limitador_guardar($manejador, array $marcas): void
{
    ftruncate($manejador, 0);
    rewind($manejador);
    fwrite($manejador, json_encode(array_values($marcas)));
    fflush($manejador);
}

function limitador_cerrar($manejador): void
{
    flock($manejador, LOCK_UN);
    fclose($manejador);
}

/**
 * Segundos que faltan para poder reintentar. 0 = no está bloqueado.
 * Si el almacenamiento falla, no se bloquea (se prioriza que la tienda funcione).
 */
function limitador_bloqueado(string $clave, int $ventana, int $maximo): int
{
    $manejador = limitador_abrir($clave);
    if ($manejador === false) {
        return 0;
    }
    $marcas = limitador_leer($manejador, $ventana);
    limitador_cerrar($manejador);

    if (count($marcas) < $maximo) {
        return 0;
    }
    sort($marcas);
    // El bloqueo termina cuando la marca más antigua que cuenta sale de la ventana.
    $indice = count($marcas) - $maximo;
    return max(1, $marcas[$indice] + $ventana - time());
}

/** Anota un intento ahora mismo. */
function limitador_registrar(string $clave, int $ventana): void
{
    $manejador = limitador_abrir($clave);
    if ($manejador === false) {
        return;
    }
    $marcas = limitador_leer($manejador, $ventana);
    $marcas[] = time();
    limitador_guardar($manejador, $marcas);
    limitador_cerrar($manejador);

    // De vez en cuando se borran los archivos viejos.
    if (mt_rand(1, 50) === 1) {
        limitador_purgar();
    }
}

/** Borra el historial de una clave (por ejemplo tras un inicio de sesión correcto). */
function limitador_reiniciar(string $clave): void
{
    $ruta = limitador_carpeta() . '/' . hash('sha256', $clave) . '.json';
    if (is_file($ruta)) {
        @unlink($ruta);
    }
}

function limitador_purgar(): void
{
    $limite = time() - 7200;
    foreach (glob(limitador_carpeta() . '/*.json') ?: [] as $archivo) {
        if (@filemtime($archivo) < $limite) {
            @unlink($archivo);
        }
    }
}

<?php
declare(strict_types=1);

/** Envía los encabezados estándar de una respuesta JSON de la API. */
function enviar_encabezados_json(int $http): void
{
    if (headers_sent()) {
        return;
    }
    http_response_code($http);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
}

/** Responde con JSON y termina la ejecución. */
function responder_json(array $datos, int $http = 200): void
{
    enviar_encabezados_json($http);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

/**
 * Responde con un error en JSON, siempre con mensaje genérico y seguro.
 * "referencia" permite encontrar el detalle técnico en logs/backend.log.
 * "extra" agrega campos adicionales (por ejemplo "errores" por campo).
 */
function responder_error(string $codigo, string $mensaje, int $http, ?string $referencia = null, array $extra = []): void
{
    $cuerpo = ['ok' => false, 'codigo' => $codigo, 'mensaje' => $mensaje];
    if ($referencia !== null) {
        $cuerpo['referencia'] = $referencia;
    }
    responder_json($cuerpo + $extra, $http);
}

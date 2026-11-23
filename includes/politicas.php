<?php
declare(strict_types=1);

/**
 * Etapa 2 (integración legal): aceptación de los Términos y condiciones y del Aviso de privacidad.
 * Tabla: `aceptaciones_politicas` (migración E). No guarda dirección IP ni datos del navegador.
 *
 * Reglas:
 *  - La aceptación se exige SIEMPRE en el servidor: el campo JSON `acepta_politicas` debe ser el booleano true.
 *    (Un texto, un número o la ausencia del campo se rechazan; la validación del navegador es solo una ayuda.)
 *  - La versión de las políticas la fija el servidor (POLITICAS_VERSION); el navegador no la envía.
 *  - El registro de la aceptación se escribe dentro de la MISMA transacción que la cuenta o el pedido:
 *    si algo falla, no queda ni la cuenta/pedido ni una aceptación suelta.
 */

/** Versión pública de las políticas que se está aceptando. La fecha de vigencia sigue pendiente de definir. */
const POLITICAS_VERSION = '1.0';

const POLITICAS_CONTEXTO_REGISTRO = 'registro';
const POLITICAS_CONTEXTO_CHECKOUT = 'checkout';

const POLITICAS_MENSAJE_REGISTRO = 'Debes confirmar que tienes 18 años o más y aceptar los Términos y condiciones y el Aviso de privacidad.';
const POLITICAS_MENSAJE_CHECKOUT = 'Debes aceptar los Términos y condiciones y entender que el pedido es una demostración académica para poder confirmarlo.';

/** ¿La solicitud trae la aceptación explícita? Solo el booleano true la acredita. */
function politicas_aceptacion_presente(array $datos): bool
{
    return array_key_exists('acepta_politicas', $datos) && $datos['acepta_politicas'] === true;
}

/**
 * Guarda una aceptación. Debe llamarse DENTRO de la transacción que crea la cuenta o el pedido.
 * Consulta preparada; no recibe ni guarda IP ni datos del navegador.
 */
function politicas_registrar_aceptacion(PDO $pdo, int $usuarioId, string $contexto, ?int $pedidoId): void
{
    if ($contexto !== POLITICAS_CONTEXTO_REGISTRO && $contexto !== POLITICAS_CONTEXTO_CHECKOUT) {
        throw new InvalidArgumentException('Contexto de aceptación no válido.');
    }
    if (($contexto === POLITICAS_CONTEXTO_CHECKOUT) !== ($pedidoId !== null)) {
        throw new InvalidArgumentException('El pedido solo corresponde al contexto checkout.');
    }
    $insertar = $pdo->prepare(
        'INSERT INTO aceptaciones_politicas (usuario_id, contexto, pedido_id, version_politicas)
         VALUES (:usuario, :contexto, :pedido, :version)'
    );
    $insertar->execute([
        ':usuario'  => $usuarioId,
        ':contexto' => $contexto,
        ':pedido'   => $pedidoId,
        ':version'  => POLITICAS_VERSION,
    ]);
}

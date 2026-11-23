<?php
declare(strict_types=1);

/**
 * POST api/admin/cliente_estado.php   (solo administradores; exige token CSRF)
 * Cuerpo JSON: { "id": 12, "activo": false, "motivo": "texto opcional (máx. 200)" }
 * Activa o desactiva una cuenta de CLIENTE y deja constancia en la auditoría.
 * 409 no_permitido: cuenta propia u otro administrador. 404 si no existe. Repetir la operación es inocuo.
 */
require_once __DIR__ . '/../../includes/admin_panel.php';

admin_endpoint('POST', static function (PDO $pdo, array $admin): void {
    $datos = leer_json();

    $id = admin_entero($datos['id'] ?? null);
    if ($id === null || !array_key_exists('activo', $datos) || !is_bool($datos['activo'])) {
        responder_error('validacion', 'Datos no válidos: indica id y activo (verdadero/falso).', 422);
    }

    $motivo = '';
    if (isset($datos['motivo'])) {
        if (!is_string($datos['motivo'])) {
            responder_error('validacion', 'El motivo debe ser texto.', 422);
        }
        $motivo = trim((string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $datos['motivo']));
        if (mb_strlen($motivo) > 200) {
            responder_error('validacion', 'El motivo no puede superar 200 caracteres.', 422);
        }
    }

    $resultado = cliente_cambiar_estado($pdo, $admin, $id, $datos['activo'], $motivo);
    responder_json([
        'ok'      => true,
        'cambiado' => $resultado['cambiado'],
        'activo'  => $resultado['activo'],
        'mensaje' => $resultado['cambiado']
            ? ($resultado['activo'] ? 'Cuenta activada.' : 'Cuenta desactivada.')
            : 'La cuenta ya estaba en ese estado; no se hizo ningún cambio.',
    ]);
});

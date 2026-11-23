<?php
declare(strict_types=1);

/**
 * GET api/admin/auditoria.php?accion=&entidad=&pagina=1   (solo administradores)
 * Registro de operaciones administrativas (quién, qué, sobre qué, cuándo y desde qué IP).
 */
require_once __DIR__ . '/../../includes/admin_panel.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    $accion  = admin_texto_get('accion', 50);
    $entidad = admin_texto_get('entidad', 40);
    if (preg_match('/^[a-z_]*$/', $accion . $entidad) !== 1) {
        responder_error('validacion', 'Filtro no válido.', 422);
    }
    responder_json(['ok' => true] + auditoria_listar($pdo, $accion, $entidad, admin_pagina()));
});

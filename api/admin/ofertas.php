<?php
declare(strict_types=1);

/**
 * GET api/admin/ofertas.php?q=&estado=ok|incompleta|huerfana|sin_oferta&pagina=1  (administradores)
 * Productos con su precio de venta y su precio anterior (el que se muestra tachado). Solo lectura.
 */
require_once __DIR__ . '/../../includes/promociones.php';

admin_endpoint('GET', static function (PDO $pdo, array $admin): void {
    responder_json(['ok' => true] + ofertas_listar($pdo, admin_texto_get('q'), admin_opcion_get('estado', OFERTA_ESTADOS), admin_pagina()));
});

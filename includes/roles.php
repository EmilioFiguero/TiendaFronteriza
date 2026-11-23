<?php
declare(strict_types=1);

/**
 * Roles de usuario (Fase 3.6.1). Archivo mínimo y sin dependencias: lo usan api/sesion.php y
 * api/login.php solo para saber si hay que mostrar el enlace «Panel administrativo».
 * IMPORTANTE: mostrar u ocultar el enlace NO da ni quita permisos; los permisos se comprueban
 * en el servidor en cada endpoint de api/admin/ (ver includes/admin.php).
 */

const ROL_CLIENTE = 'cliente';
const ROL_ADMIN   = 'admin';

/**
 * ¿Es administrador? Si la migración A todavía no se aplicó (la columna `rol` no existe, error 1054)
 * devuelve false en vez de romper el inicio de sesión de los clientes.
 */
function usuario_es_admin(PDO $pdo, int $usuarioId): bool
{
    try {
        $consulta = $pdo->prepare('SELECT rol FROM usuarios WHERE id = :id');
        $consulta->execute([':id' => $usuarioId]);
        $rol = $consulta->fetchColumn();
        return $rol === ROL_ADMIN;
    } catch (PDOException $e) {
        if (errno_de_pdo($e) === 1054) {
            return false;
        }
        throw $e;
    }
}

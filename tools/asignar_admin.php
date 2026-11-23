<?php
declare(strict_types=1);

/**
 * Asignar o retirar el rol de administrador (SOLO consola; no funciona desde el navegador).
 *
 *   C:\xampp\php\php.exe C:\xampp\htdocs\tienda-fronteriza\tools\asignar_admin.php correo@ejemplo.com
 *   C:\xampp\php\php.exe ...\asignar_admin.php correo@ejemplo.com --quitar
 *   C:\xampp\php\php.exe ...\asignar_admin.php --listar
 *
 * - La cuenta debe existir (registrada normalmente) y estar activa.
 * - No guarda ni pide contraseñas. Deja un registro en auditoria_admin (admin_id = NULL, origen consola).
 * - Se niega a retirar al ÚLTIMO administrador (usa --forzar si de verdad lo quieres).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Solo se puede ejecutar desde la consola.');
}

require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/roles.php';

$args = array_slice($argv, 1);
$quitar = in_array('--quitar', $args, true);
$forzar = in_array('--forzar', $args, true);
$listar = in_array('--listar', $args, true);
$correo = '';
foreach ($args as $a) {
    if ($a !== '' && $a[0] !== '-') {
        $correo = strtolower(trim($a));
    }
}

try {
    $pdo = obtener_conexion();

    if ($listar) {
        foreach ($pdo->query("SELECT id, nombre, correo, activo FROM usuarios WHERE rol = 'admin' ORDER BY id") as $f) {
            echo "#{$f['id']}  {$f['nombre']} <{$f['correo']}>  " . ((int) $f['activo'] === 1 ? 'activo' : 'INACTIVO') . "\n";
        }
        exit(0);
    }
    if ($correo === '' || filter_var($correo, FILTER_VALIDATE_EMAIL) === false) {
        fwrite(STDERR, "Uso: php asignar_admin.php correo@ejemplo.com [--quitar [--forzar]] | --listar\n");
        exit(1);
    }

    $pdo->beginTransaction();
    $s = $pdo->prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE correo = :c FOR UPDATE');
    $s->execute([':c' => $correo]);
    $u = $s->fetch();
    if ($u === false) {
        $pdo->rollBack();
        fwrite(STDERR, "No existe ninguna cuenta con ese correo. Primero regístrate en la tienda.\n");
        exit(2);
    }

    if ($quitar) {
        if ($u['rol'] !== ROL_ADMIN) {
            $pdo->rollBack();
            echo "Esa cuenta ya no es administradora. Sin cambios.\n";
            exit(0);
        }
        $otros = (int) $pdo->query("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1")->fetchColumn();
        if ($otros <= 1 && !$forzar) {
            $pdo->rollBack();
            fwrite(STDERR, "Es el último administrador activo. Asigna otro antes, o usa --forzar.\n");
            exit(3);
        }
        $pdo->prepare("UPDATE usuarios SET rol = 'cliente' WHERE id = :id")->execute([':id' => $u['id']]);
        admin_auditar_consola($pdo, 'admin_retirado', (int) $u['id'], 'correo=' . $correo . ' (consola)');
        $pdo->commit();
        echo "Rol de administrador retirado a {$correo}. Su acceso al panel termina de inmediato.\n";
        exit(0);
    }

    if ((int) $u['activo'] !== 1) {
        $pdo->rollBack();
        fwrite(STDERR, "La cuenta está desactivada; no se puede asignar como administradora.\n");
        exit(4);
    }
    if ($u['rol'] === ROL_ADMIN) {
        $pdo->rollBack();
        echo "Esa cuenta ya es administradora. Sin cambios.\n";
        exit(0);
    }
    $pdo->prepare("UPDATE usuarios SET rol = 'admin' WHERE id = :id")->execute([':id' => $u['id']]);
    admin_auditar_consola($pdo, 'admin_asignado', (int) $u['id'], 'correo=' . $correo . ' (consola)');
    $pdo->commit();
    echo "Listo: {$correo} ahora es administrador. Cierra sesión y vuelve a entrar para ver el enlace al panel.\n";
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n(¿Aplicaste la migración A de la Fase 3.6.1?)\n");
    exit(9);
}

function admin_auditar_consola(PDO $pdo, string $accion, int $objetivo, string $detalle): void
{
    $pdo->prepare(
        'INSERT INTO auditoria_admin (admin_id, accion, entidad, entidad_id, detalle, ip) VALUES (NULL, :a, :e, :i, :d, NULL)'
    )->execute([':a' => $accion, ':e' => 'usuario', ':i' => (string) $objetivo, ':d' => $detalle]);
}

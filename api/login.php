<?php
declare(strict_types=1);

/**
 * POST api/login.php
 * Cuerpo JSON: { "correo", "password" }
 * Cabecera:    X-CSRF-Token
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/roles.php';

// Hash bcrypt de una contraseña inexistente: se usa cuando el correo no existe
// para que la respuesta tarde lo mismo y no se pueda adivinar qué correos están registrados.
const HASH_FICTICIO = '$2y$12$730kLx9ZctbhMkIwunVH.eDIRvRNC39pPggfZELFpsa3iDka/DNtu';

solo_metodo('POST');
verificar_origen();

try {
    iniciar_sesion_segura();
    exigir_csrf();

    $datos    = leer_json();
    $correo   = normalizar_correo(texto_campo($datos, 'correo'));
    $password = texto_campo($datos, 'password');

    if ($correo === '' || $password === '') {
        responder_error('validacion', 'Escribe tu correo y tu contraseña.', 422);
    }
    if (strlen($correo) > 150 || strlen($password) > 200) {
        responder_error('credenciales_invalidas', 'Correo o contraseña incorrectos.', 401);
    }

    // Limitación de intentos: por (correo + IP) y por IP.
    $ip = ip_cliente();
    $claveCuenta = 'login|' . $ip . '|' . $correo;
    $claveIp     = 'login-ip|' . $ip;

    $espera = max(
        limitador_bloqueado($claveCuenta, LIM_VENTANA_LOGIN, LIM_INTENTOS_CUENTA_IP),
        limitador_bloqueado($claveIp, LIM_VENTANA_LOGIN, LIM_INTENTOS_IP)
    );
    if ($espera > 0) {
        responder_limite($espera);
    }

    $pdo = obtener_conexion();
    $consulta = $pdo->prepare('SELECT id, nombre, correo, password_hash, activo FROM usuarios WHERE correo = :correo');
    $consulta->execute([':correo' => $correo]);
    $fila = $consulta->fetch();

    $hashGuardado = ($fila !== false) ? (string) $fila['password_hash'] : HASH_FICTICIO;
    $passwordOk   = password_verify($password, $hashGuardado);
    $cuentaActiva = ($fila !== false) && ((int) $fila['activo'] === 1);

    if (!$passwordOk || !$cuentaActiva) {
        limitador_registrar($claveCuenta, LIM_VENTANA_LOGIN);
        limitador_registrar($claveIp, LIM_VENTANA_LOGIN);
        // Mismo mensaje para correo inexistente, contraseña errónea o cuenta desactivada.
        responder_error('credenciales_invalidas', 'Correo o contraseña incorrectos.', 401);
    }

    // Autenticación correcta.
    limitador_reiniciar($claveCuenta);

    // Si PHP sube el costo recomendado del hash, se actualiza de forma transparente.
    if (password_needs_rehash($hashGuardado, PASSWORD_DEFAULT)) {
        $nuevo = password_hash($password, PASSWORD_DEFAULT);
        $actualizar = $pdo->prepare('UPDATE usuarios SET password_hash = :hash WHERE id = :id');
        $actualizar->execute([':hash' => $nuevo, ':id' => (int) $fila['id']]);
    }

    $esAdmin = usuario_es_admin($pdo, (int) $fila['id']);
    iniciar_sesion_usuario((int) $fila['id']);   // regenera el id de sesión y rota el token CSRF
    $token = token_csrf();
    session_write_close();

    responder_json([
        'ok'         => true,
        'mensaje'    => 'Inicio de sesión correcto.',
        'usuario'    => [
            'id' => (int) $fila['id'], 'nombre' => (string) $fila['nombre'], 'correo' => (string) $fila['correo'],
            'es_admin' => $esAdmin,   // solo para mostrar el enlace al panel; el permiso real se valida en api/admin/*
        ],
        'csrf_token' => $token,
    ]);
} catch (Throwable $e) {
    manejar_fallo($e);
}

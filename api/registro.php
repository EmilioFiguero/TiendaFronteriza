<?php
declare(strict_types=1);

/**
 * POST api/registro.php
 * Cuerpo JSON: { "nombre", "correo", "password", "confirmar_password", "acepta_politicas": true }
 * Cabecera:    X-CSRF-Token
 */
require_once __DIR__ . '/../includes/api.php';
require_once __DIR__ . '/../includes/politicas.php';   // Etapa 2: aceptación de políticas

solo_metodo('POST');
verificar_origen();

try {
    iniciar_sesion_segura();
    exigir_csrf();

    // Límite de solicitudes de registro por IP.
    $claveLimite = 'registro|' . ip_cliente();
    $espera = limitador_bloqueado($claveLimite, LIM_VENTANA_REGISTRO, LIM_REGISTROS_IP);
    if ($espera > 0) {
        responder_limite($espera);
    }
    limitador_registrar($claveLimite, LIM_VENTANA_REGISTRO);

    $datos     = leer_json();
    $nombre    = normalizar_nombre(texto_campo($datos, 'nombre'));
    $correo    = normalizar_correo(texto_campo($datos, 'correo'));
    $password  = texto_campo($datos, 'password');
    $confirmar = texto_campo($datos, 'confirmar_password');

    // Validación en el servidor (la del navegador se puede saltar).
    $errores = [];
    if (!politicas_aceptacion_presente($datos)) {   // Etapa 2: sin aceptación explícita no hay cuenta
        $errores['aceptacion'] = POLITICAS_MENSAJE_REGISTRO;
    }
    if (($mensaje = error_nombre($nombre)) !== '') {
        $errores['nombre'] = $mensaje;
    }
    if (($mensaje = error_correo($correo)) !== '') {
        $errores['correo'] = $mensaje;
    }
    if (($mensaje = error_password($password)) !== '') {
        $errores['password'] = $mensaje;
    } elseif (!hash_equals($password, $confirmar)) {
        $errores['confirmar_password'] = 'Las contraseñas no coinciden.';
    }
    if ($errores !== []) {
        responder_error('validacion', 'Revisa los datos del formulario.', 422, null, ['errores' => $errores]);
    }

    $pdo = obtener_conexion();
    $msgDuplicado = 'Este correo ya está registrado. Intenta iniciar sesión en su lugar.';

    // 1) Comprobación amable de correo repetido.
    $consulta = $pdo->prepare('SELECT id FROM usuarios WHERE correo = :correo');
    $consulta->execute([':correo' => $correo]);
    if ($consulta->fetch() !== false) {
        responder_error('correo_duplicado', $msgDuplicado, 409, null, ['errores' => ['correo' => $msgDuplicado]]);
    }

    // 2) Inserción. La contraseña se guarda SOLO como hash.
    $hash = password_hash($password, PASSWORD_DEFAULT);
    // Etapa 2: la cuenta y la constancia de aceptación se guardan en UNA transacción (ambas o ninguna).
    try {
        $pdo->beginTransaction();
        $insertar = $pdo->prepare(
            'INSERT INTO usuarios (nombre, correo, password_hash) VALUES (:nombre, :correo, :hash)'
        );
        $insertar->execute([':nombre' => $nombre, ':correo' => $correo, ':hash' => $hash]);
        $usuarioId = (int) $pdo->lastInsertId();
        politicas_registrar_aceptacion($pdo, $usuarioId, POLITICAS_CONTEXTO_REGISTRO, null);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        // 3) Si dos solicitudes simultáneas pasan el paso 1, la clave UNIQUE evita el duplicado (error 1062).
        if (errno_de_pdo($e) === 1062) {
            responder_error('correo_duplicado', $msgDuplicado, 409, null, ['errores' => ['correo' => $msgDuplicado]]);
        }
        throw $e;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    responder_json([
        'ok'      => true,
        'mensaje' => 'Cuenta creada correctamente.',
        'usuario' => ['id' => $usuarioId, 'nombre' => $nombre, 'correo' => $correo],
    ], 201);
} catch (Throwable $e) {
    manejar_fallo($e);
}

-- TIENDA FRONTERIZA - INSTALACION DEMOSTRATIVA (17 tablas, 16 productos)
-- Uso: importar SOLO en una base de datos NUEVA y VACIA llamada tienda_fronteriza.
-- No ejecutar sobre la base de datos original con pedidos o usuarios.
-- No incluye usuarios ni contrasenas, pedidos, direcciones o aceptaciones reales.
-- Cuenta administrativa: requiere provision separada y segura (no se incluye cuenta predeterminada).
-- Imagenes: las rutas requieren que los archivos correspondientes esten presentes en assets/.
-- Verificar permisos de uso de fotografias y marcas antes de publicar.
-- Requiere MariaDB/MySQL compatible y PHP con pdo_mysql.

-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 23-11-2026 a las 09:55:00
-- Versión del servidor: 10.11.16-MariaDB
-- Versión de PHP: 8.5.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `tienda_fronteriza`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `aceptaciones_politicas`
--

CREATE TABLE `aceptaciones_politicas` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `contexto` enum('registro','checkout') NOT NULL,
  `pedido_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'solo cuando el contexto es checkout',
  `version_politicas` varchar(10) NOT NULL COMMENT 'versión pública aceptada, p. ej. 1.0 (la fija el servidor)',
  `aceptado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `auditoria_admin`
--

CREATE TABLE `auditoria_admin` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `admin_id` int(10) UNSIGNED DEFAULT NULL,
  `accion` varchar(50) NOT NULL,
  `entidad` varchar(40) NOT NULL,
  `entidad_id` varchar(40) DEFAULT NULL,
  `detalle` varchar(500) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `carritos`
--

CREATE TABLE `carritos` (
  `id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `categorias`
--

CREATE TABLE `categorias` (
  `id` int(10) UNSIGNED NOT NULL,
  `slug` varchar(50) NOT NULL,
  `nombre` varchar(60) NOT NULL,
  `descripcion` varchar(200) NOT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `es_virtual` tinyint(1) NOT NULL DEFAULT 0,
  `orden` tinyint(3) UNSIGNED NOT NULL DEFAULT 0
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `configuracion_tienda`
--

CREATE TABLE `configuracion_tienda` (
  `clave` varchar(50) NOT NULL,
  `valor` varchar(200) NOT NULL,
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `actualizado_por` int(10) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cupones`
--

CREATE TABLE `cupones` (
  `id` int(10) UNSIGNED NOT NULL,
  `codigo` varchar(20) NOT NULL COMMENT 'MAYÚSCULAS A-Z 0-9 _ -, único; no se cambia después de crearlo',
  `descripcion` varchar(200) NOT NULL,
  `tipo` enum('porcentaje','monto_fijo') NOT NULL,
  `valor` decimal(10,2) NOT NULL COMMENT 'porcentaje (0.01-100) o monto en MXN',
  `compra_minima` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tope_descuento` decimal(10,2) DEFAULT NULL COMMENT 'solo para porcentaje',
  `usos_maximos` int(10) UNSIGNED DEFAULT NULL COMMENT 'informativo: aún no se registran usos porque ninguna compra aplica cupones',
  `inicia_en` datetime DEFAULT NULL,
  `termina_en` datetime DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_por` int(10) UNSIGNED DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_carrito`
--

CREATE TABLE `detalle_carrito` (
  `id` int(10) UNSIGNED NOT NULL,
  `carrito_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `cantidad` smallint(5) UNSIGNED NOT NULL
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `detalle_pedidos`
--

CREATE TABLE `detalle_pedidos` (
  `id` int(10) UNSIGNED NOT NULL,
  `pedido_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `nombre_producto` varchar(150) NOT NULL,
  `cantidad` smallint(5) UNSIGNED NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `direcciones`
--

CREATE TABLE `direcciones` (
  `id` int(10) UNSIGNED NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `nombre_completo` varchar(100) NOT NULL,
  `correo_contacto` varchar(150) NOT NULL,
  `telefono` char(10) NOT NULL,
  `calle` varchar(120) NOT NULL,
  `num_exterior` varchar(10) NOT NULL,
  `num_interior` varchar(10) DEFAULT NULL,
  `colonia` varchar(100) NOT NULL,
  `ciudad` varchar(100) NOT NULL,
  `estado` varchar(60) NOT NULL,
  `codigo_postal` char(5) NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `favoritos`
--

CREATE TABLE `favoritos` (
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `imagenes_productos`
--

CREATE TABLE `imagenes_productos` (
  `id` int(10) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `ruta` varchar(255) NOT NULL,
  `orden` tinyint(3) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `marcas`
--

CREATE TABLE `marcas` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `movimientos_inventario`
--

CREATE TABLE `movimientos_inventario` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `producto_id` int(10) UNSIGNED NOT NULL,
  `tipo` enum('inicial','venta','entrada','salida','ajuste','cancelacion') NOT NULL,
  `cantidad` int(11) NOT NULL COMMENT 'cambio con signo: + entra, - sale',
  `stock_anterior` int(11) NOT NULL,
  `stock_nuevo` int(11) NOT NULL,
  `motivo` varchar(200) DEFAULT NULL,
  `pedido_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'solo para ventas (y cancelaciones futuras)',
  `usuario_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'quien causó el movimiento: administrador, o el cliente que compró; NULL = sistema',
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pedidos`
--

CREATE TABLE `pedidos` (
  `id` int(10) UNSIGNED NOT NULL,
  `numero_pedido` varchar(20) NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `envio_nombre` varchar(100) NOT NULL,
  `envio_correo` varchar(150) NOT NULL,
  `envio_telefono` char(10) NOT NULL,
  `envio_calle` varchar(120) NOT NULL,
  `envio_num_exterior` varchar(10) NOT NULL,
  `envio_num_interior` varchar(10) DEFAULT NULL,
  `envio_colonia` varchar(100) NOT NULL,
  `envio_ciudad` varchar(100) NOT NULL,
  `envio_estado` varchar(60) NOT NULL,
  `envio_codigo_postal` char(5) NOT NULL,
  `metodo_pago` enum('tarjeta','paypal','transferencia') NOT NULL,
  `estado` enum('pendiente','pagado','preparado','enviado','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  `subtotal` decimal(10,2) NOT NULL,
  `tasa_impuesto` decimal(5,4) NOT NULL,
  `impuestos` decimal(10,2) NOT NULL,
  `zona_envio` varchar(60) DEFAULT NULL,
  `costo_envio` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total` decimal(10,2) NOT NULL,
  `guia_envio` varchar(20) DEFAULT NULL,
  `clave_idempotencia` char(36) DEFAULT NULL COMMENT 'UUID de la operacion de compra (evita pedidos duplicados)',
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `pedido_historial_estados`
--

CREATE TABLE `pedido_historial_estados` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `pedido_id` int(10) UNSIGNED NOT NULL,
  `estado_anterior` enum('pendiente','pagado','preparado','enviado','entregado','cancelado') NOT NULL,
  `estado_nuevo` enum('pendiente','pagado','preparado','enviado','entregado','cancelado') NOT NULL,
  `motivo` varchar(200) DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'administrador que hizo el cambio',
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `productos`
--

CREATE TABLE `productos` (
  `id` int(10) UNSIGNED NOT NULL,
  `codigo` varchar(20) NOT NULL,
  `categoria_id` int(10) UNSIGNED NOT NULL,
  `marca_id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` text NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `precio_anterior` decimal(10,2) DEFAULT NULL,
  `stock` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `es_destacado` tinyint(1) NOT NULL DEFAULT 0,
  `en_oferta` tinyint(1) NOT NULL DEFAULT 0,
  `es_demo` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(10) UNSIGNED NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('cliente','admin') NOT NULL DEFAULT 'cliente',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` datetime NOT NULL DEFAULT current_timestamp()
) ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `aceptaciones_politicas`
--
ALTER TABLE `aceptaciones_politicas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_aceptaciones_pedido` (`pedido_id`),
  ADD KEY `idx_aceptaciones_usuario` (`usuario_id`,`contexto`,`aceptado_en`);

--
-- Indices de la tabla `auditoria_admin`
--
ALTER TABLE `auditoria_admin`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_auditoria_fecha` (`creado_en`),
  ADD KEY `idx_auditoria_admin` (`admin_id`,`creado_en`),
  ADD KEY `idx_auditoria_entidad` (`entidad`,`entidad_id`);

--
-- Indices de la tabla `carritos`
--
ALTER TABLE `carritos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_carritos_usuario` (`usuario_id`);

--
-- Indices de la tabla `categorias`
--
ALTER TABLE `categorias`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_categorias_slug` (`slug`),
  ADD KEY `idx_categorias_orden` (`orden`);

--
-- Indices de la tabla `configuracion_tienda`
--
ALTER TABLE `configuracion_tienda`
  ADD PRIMARY KEY (`clave`),
  ADD KEY `fk_config_usuario` (`actualizado_por`);

--
-- Indices de la tabla `cupones`
--
ALTER TABLE `cupones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cupones_codigo` (`codigo`),
  ADD KEY `idx_cupones_activo_vigencia` (`activo`,`inicia_en`,`termina_en`),
  ADD KEY `fk_cupones_creado_por` (`creado_por`);

--
-- Indices de la tabla `detalle_carrito`
--
ALTER TABLE `detalle_carrito`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_detalle_carrito_producto` (`carrito_id`,`producto_id`),
  ADD KEY `idx_detalle_carrito_producto` (`producto_id`);

--
-- Indices de la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_detalle_pedidos_producto` (`pedido_id`,`producto_id`),
  ADD KEY `idx_detalle_pedidos_producto` (`producto_id`);

--
-- Indices de la tabla `direcciones`
--
ALTER TABLE `direcciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_direcciones_usuario` (`usuario_id`);

--
-- Indices de la tabla `favoritos`
--
ALTER TABLE `favoritos`
  ADD PRIMARY KEY (`usuario_id`,`producto_id`),
  ADD KEY `idx_favoritos_producto` (`producto_id`);

--
-- Indices de la tabla `imagenes_productos`
--
ALTER TABLE `imagenes_productos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_imagenes_producto_orden` (`producto_id`,`orden`);

--
-- Indices de la tabla `marcas`
--
ALTER TABLE `marcas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_marcas_nombre` (`nombre`);

--
-- Indices de la tabla `movimientos_inventario`
--
ALTER TABLE `movimientos_inventario`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_mov_pedido_producto_tipo` (`pedido_id`,`producto_id`,`tipo`),
  ADD KEY `idx_mov_producto` (`producto_id`,`id`),
  ADD KEY `idx_mov_fecha` (`creado_en`),
  ADD KEY `idx_mov_tipo` (`tipo`),
  ADD KEY `fk_mov_usuario` (`usuario_id`);

--
-- Indices de la tabla `pedidos`
--
ALTER TABLE `pedidos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_pedidos_numero` (`numero_pedido`),
  ADD UNIQUE KEY `uq_pedidos_guia` (`guia_envio`),
  ADD UNIQUE KEY `uq_pedidos_usuario_clave` (`usuario_id`,`clave_idempotencia`),
  ADD KEY `idx_pedidos_usuario_fecha` (`usuario_id`,`creado_en`),
  ADD KEY `idx_pedidos_estado` (`estado`),
  ADD KEY `idx_pedidos_estado_fecha` (`estado`,`creado_en`);

--
-- Indices de la tabla `pedido_historial_estados`
--
ALTER TABLE `pedido_historial_estados`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_phe_pedido` (`pedido_id`,`id`),
  ADD KEY `idx_phe_fecha` (`creado_en`),
  ADD KEY `fk_phe_usuario` (`usuario_id`);

--
-- Indices de la tabla `productos`
--
ALTER TABLE `productos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_productos_codigo` (`codigo`),
  ADD KEY `idx_productos_activo_categoria` (`activo`,`categoria_id`),
  ADD KEY `idx_productos_marca` (`marca_id`),
  ADD KEY `fk_productos_categoria` (`categoria_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_usuarios_correo` (`correo`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `aceptaciones_politicas`
--
ALTER TABLE `aceptaciones_politicas`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `auditoria_admin`
--
ALTER TABLE `auditoria_admin`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `carritos`
--
ALTER TABLE `carritos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `categorias`
--
ALTER TABLE `categorias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `cupones`
--
ALTER TABLE `cupones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `detalle_carrito`
--
ALTER TABLE `detalle_carrito`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `direcciones`
--
ALTER TABLE `direcciones`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `imagenes_productos`
--
ALTER TABLE `imagenes_productos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `marcas`
--
ALTER TABLE `marcas`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `movimientos_inventario`
--
ALTER TABLE `movimientos_inventario`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pedidos`
--
ALTER TABLE `pedidos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `pedido_historial_estados`
--
ALTER TABLE `pedido_historial_estados`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `productos`
--
ALTER TABLE `productos`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `aceptaciones_politicas`
--
ALTER TABLE `aceptaciones_politicas`
  ADD CONSTRAINT `fk_aceptaciones_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_aceptaciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `auditoria_admin`
--
ALTER TABLE `auditoria_admin`
  ADD CONSTRAINT `fk_auditoria_admin` FOREIGN KEY (`admin_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `carritos`
--
ALTER TABLE `carritos`
  ADD CONSTRAINT `fk_carritos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `configuracion_tienda`
--
ALTER TABLE `configuracion_tienda`
  ADD CONSTRAINT `fk_config_usuario` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `cupones`
--
ALTER TABLE `cupones`
  ADD CONSTRAINT `fk_cupones_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `detalle_carrito`
--
ALTER TABLE `detalle_carrito`
  ADD CONSTRAINT `fk_detalle_carrito_carrito` FOREIGN KEY (`carrito_id`) REFERENCES `carritos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_detalle_carrito_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `detalle_pedidos`
--
ALTER TABLE `detalle_pedidos`
  ADD CONSTRAINT `fk_detalle_pedidos_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_detalle_pedidos_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `direcciones`
--
ALTER TABLE `direcciones`
  ADD CONSTRAINT `fk_direcciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `favoritos`
--
ALTER TABLE `favoritos`
  ADD CONSTRAINT `fk_favoritos_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_favoritos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `imagenes_productos`
--
ALTER TABLE `imagenes_productos`
  ADD CONSTRAINT `fk_imagenes_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Filtros para la tabla `movimientos_inventario`
--
ALTER TABLE `movimientos_inventario`
  ADD CONSTRAINT `fk_mov_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_mov_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_mov_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `pedidos`
--
ALTER TABLE `pedidos`
  ADD CONSTRAINT `fk_pedidos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;

--
-- Filtros para la tabla `pedido_historial_estados`
--
ALTER TABLE `pedido_historial_estados`
  ADD CONSTRAINT `fk_phe_pedido` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_phe_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Filtros para la tabla `productos`
--
ALTER TABLE `productos`
  ADD CONSTRAINT `fk_productos_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_productos_marca` FOREIGN KEY (`marca_id`) REFERENCES `marcas` (`id`) ON UPDATE CASCADE;

-- Datos ficticios y de catalogo para instalacion nueva
INSERT INTO `categorias` (`id`, `slug`, `nombre`, `descripcion`, `imagen`, `es_virtual`, `orden`) VALUES
(1, 'chamarras', 'Chamarras', 'Protección y estilo para cualquier aventura.', 'assets/images/categories/chamarras.jpg', 0, 1),
(2, 'mochilas', 'Mochilas', 'Todo lo que necesitas, donde lo necesitas.', 'assets/images/categories/mochilas.jpg', 0, 2),
(3, 'ropa', 'Ropa', 'Prendas versátiles para el día a día.', 'assets/images/categories/ropa.jpg', 0, 3),
(4, 'calzado', 'Calzado', 'Comodidad y estilo en cada paso.', 'assets/images/categories/calzado.jpg', 0, 4),
(5, 'outdoor', 'Outdoor', 'Equipo listo para salir a explorar.', 'assets/images/categories/outdoor.jpg', 0, 5),
(6, 'accesorios', 'Accesorios', 'Los detalles que completan tu estilo.', 'assets/images/categories/accesorios.jpg', 0, 6),
(7, 'ofertas', 'Ofertas', 'Precios especiales por tiempo limitado.', 'assets/images/categories/ofertas.jpg', 1, 7);

INSERT INTO `marcas` (`id`, `nombre`) VALUES
(2, 'Carhartt'),
(5, 'New Era'),
(4, 'Nike'),
(3, 'Patagonia'),
(1, 'The North Face');

INSERT INTO `productos` (`id`, `codigo`, `categoria_id`, `marca_id`, `nombre`, `descripcion`, `precio`, `precio_anterior`, `stock`, `es_destacado`, `en_oferta`, `es_demo`, `activo`, `creado_en`) VALUES
(1, 'p1', 1, 1, 'Denali Jacket', 'Chamarra polar negra con cuello alto, cierre frontal completo, panel superior de material tejido y logo The North Face en el pecho.', 250.00, NULL, 1, 1, 0, 0, 1, '2026-11-19 05:17:46'),
(2, 'p2', 2, 1, 'Youth Happy Camper Backpack', 'Mochila juvenil azul con detalles rojos, capacidad aproximada de 16 L, cordón elástico frontal, bolsillos laterales de malla y construcción de poliéster.', 700.00, 900.00, 1, 1, 1, 0, 1, '2026-11-19 05:17:46'),
(3, 'p3', 2, 1, 'Mochila North Face Vault', 'Mochila negra de 27 L con funda acolchada para laptop de hasta 15\", sistema de suspensión FlexVent, bolsillos laterales para botellas y acabado repelente al agua.', 700.00, NULL, 0, 1, 0, 0, 1, '2026-11-19 05:17:46'),
(4, 'p4', 3, 2, 'Playera Manga Larga', 'Playera negra de manga larga con logo Carhartt bordado en el pecho y logo grande impreso en la manga derecha.', 300.00, 450.00, 1, 0, 1, 0, 1, '2026-11-19 05:17:46'),
(5, 'p5', 1, 3, 'Better Sweater Chamarra', 'Chamarra gris con cierre completo, cuello alto, bolsillo con cierre en el pecho y dos bolsillos laterales con cierre. Etiqueta Patagonia en el pecho.', 400.00, 500.00, 0, 0, 1, 0, 1, '2026-11-19 05:17:46'),
(6, 'p6', 2, 4, 'Mochila Brasilia', 'Mochila negra con panel frontal verde olivo, bolsillos laterales de malla, correas ajustables y logo Nike en el panel principal.', 550.00, 650.00, 1, 0, 1, 0, 1, '2026-11-19 05:17:46'),
(7, 'p7', 2, 1, 'Mochila Vault Negra con Detalles Rosa Claro', 'Mochila The North Face modelo Vault en color negro con detalles en rosa claro. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(8, 'p8', 2, 1, 'Mochila Recon Gris y Negra', 'Mochila The North Face modelo Recon en color gris y negro. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(9, 'p9', 2, 1, 'Mochila Jester Gris Oscuro', 'Mochila The North Face modelo Jester en color gris oscuro. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(10, 'p10', 2, 1, 'Mochila Borealis Negra', 'Mochila The North Face modelo Borealis en color negro. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(11, 'p11', 2, 1, 'Mochila Borealis Gris con Menta', 'Mochila The North Face modelo Borealis en color gris con detalles en menta. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(12, 'p12', 2, 1, 'Mochila Recon Verde Salvia', 'Mochila The North Face modelo Recon en color verde salvia. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(13, 'p13', 2, 1, 'Mochila Recon Gris Claro y Negra', 'Mochila The North Face modelo Recon en color gris claro y negro. Artículo seminuevo.', 700.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(14, 'p14', 6, 5, 'Gorra Amarilla con Visera Azul', 'Gorra New Era en color amarillo con visera azul y logotipo bordado al frente. Artículo seminuevo.', 350.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(15, 'p15', 6, 5, 'Gorra Azul Marino', 'Gorra New Era en color azul marino con logotipo bordado al frente. Artículo seminuevo.', 350.00, NULL, 1, 0, 0, 0, 1, '2026-11-21 12:07:02'),
(16, 'M1', 2, 1, 'Mochila The North Face Borealis', 'Mochila North Face en excelentes condiciones, estetica 10/10, util para senderismo, alpinismo y campismo', 350.00, NULL, 6, 0, 0, 0, 1, '2026-11-22 16:40:21');

INSERT INTO `imagenes_productos` (`id`, `producto_id`, `ruta`, `orden`) VALUES
(1, 1, 'assets/images/products/denali-jacket.jpg', 0),
(2, 2, 'assets/images/products/happy-camper.jpg', 0),
(3, 3, 'assets/images/products/vault-black.jpg', 0),
(4, 4, 'assets/images/products/carhartt-playera.jpg', 0),
(5, 5, 'assets/images/products/patagonia-chamarra.jpg', 0),
(6, 6, 'assets/images/products/nike-mochila.jpg', 0),
(7, 7, 'assets/images/products/mochila-tnf-vault-negra-rosa.jpg', 0),
(8, 8, 'assets/images/products/mochila-tnf-recon-gris-negra.jpg', 0),
(9, 9, 'assets/images/products/mochila-tnf-jester-gris-oscuro.jpg', 0),
(10, 10, 'assets/images/products/mochila-tnf-borealis-negra.jpg', 0),
(11, 11, 'assets/images/products/mochila-tnf-borealis-gris-menta.jpg', 0),
(12, 12, 'assets/images/products/mochila-tnf-recon-verde-salvia.jpg', 0),
(13, 13, 'assets/images/products/mochila-tnf-recon-gris-claro.jpg', 0),
(14, 14, 'assets/images/products/gorra-new-era-amarilla-azul.jpg', 0),
(15, 15, 'assets/images/products/gorra-new-era-azul-marino.jpg', 0),
(16, 16, 'assets/images/products/uploads/f7172afa2f86f575122d0734c966d833.jpg', 0);

INSERT INTO `configuracion_tienda` (`clave`, `valor`, `actualizado_en`, `actualizado_por`) VALUES
('umbral_stock_bajo', '6', '2026-11-22 17:07:50', NULL);

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

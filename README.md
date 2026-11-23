# Tienda Fronteriza

Proyecto académico de comercio electrónico desarrollado con frontend web, backend PHP y base de datos MariaDB/MySQL. **Es una demostración escolar:** no procesa pagos reales ni debe utilizarse como tienda de producción sin una revisión adicional de seguridad, licencias y configuración.

## Funcionalidades

- Catálogo de productos, categorías, marcas e imágenes.
- Registro e inicio de sesión, perfil, favoritos y carrito.
- Simulación de checkout y consulta de pedidos.
- Panel administrativo y control de roles, inventario y auditoría (según las funciones implementadas en el código).
- Páginas informativas y políticas de la tienda.

## Requisitos

- Windows con XAMPP, Apache, PHP con extensión PDO MySQL y MariaDB/MySQL.
- phpMyAdmin para importar el archivo SQL.
- Navegador web moderno.

## Instalación local

1. Descarga o clona el repositorio.
2. Copia la carpeta del proyecto a `C:\xampp\htdocs\tienda-fronteriza`. Si utilizas otro nombre de carpeta, ajusta las URL de acceso.
3. Inicia **Apache** y **MySQL** en el panel de XAMPP.
4. En `http://localhost/phpmyadmin`, crea una base de datos **nueva y vacía** llamada `tienda_fronteriza` (preferentemente con cotejamiento `utf8mb4_unicode_ci`). **No importes el SQL en una base que ya tenga información que quieras conservar.**
5. Selecciona esa base e importa `sql/tienda_fronteriza_demo.sql` desde la pestaña **Importar**. El archivo contiene 17 tablas y 16 productos de demostración; no contiene cuentas personales ni pedidos reales.
6. Copia `config/config.example.php` a `config/config.php` y configura la conexión local de acuerdo con los comentarios del archivo. El nombre de base de datos debe coincidir con el creado en el paso 4. **No publiques `config.php` ni contraseñas.**
7. Abre `http://localhost/tienda-fronteriza/` y prueba el catálogo y el registro de usuarios.

> **Nota sobre imágenes:** el SQL contiene rutas de imágenes en `assets/images/`. Para verlas correctamente, esos archivos deben estar incluidos en el proyecto y contar con autorización para su distribución.

## Acceso al panel administrativo

El SQL no incluye un administrador predeterminado. Primero registra una cuenta normal desde la tienda y luego, en la computadora donde se instaló el proyecto, abre una consola y ejecuta (sustituye el correo por el de la cuenta registrada):

```powershell
C:\xampp\php\php.exe C:\xampp\htdocs\tienda-fronteriza\tools\asignar_admin.php profesor@ejemplo.com
```

Cierra sesión y vuelve a iniciarla. La herramienta `tools/asignar_admin.php` **solo se ejecuta por consola**; no funciona mediante una URL del navegador. Debe utilizarse únicamente por quien administra el servidor.

## Estructura general

- `api/`: endpoints y lógica de comunicación del backend.
- `admin/`: panel de administración.
- `includes/`: funciones y componentes PHP compartidos.
- `config/`: configuración y conexión a la base de datos.
- `sql/`: archivo de instalación de la base de datos de demostración.
- `assets/`, `css/`, `js/`: recursos y frontend.
- `tools/`: utilidades administrativas de consola.
- `logs/`, `storage/`: datos temporales de ejecución; su contenido no se publica.

## Consideraciones

- Proyecto con fines exclusivamente educativos. Las compras y pagos son simulados.
- Las marcas mencionadas pertenecen a sus respectivos titulares; no se afirma afiliación con ellas.
- Antes de compartir públicamente fotografías, logos o descripciones de terceros, verifica sus derechos de uso.
- El proyecto está pensado para una instalación local de demostración, no para un servidor público sin medidas adicionales de seguridad.

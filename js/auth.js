/* =========================================================
   TIENDA FRONTERIZA — auth.js
   Fase 3.2: registro, login, sesión y protección de páginas
   con PHP + MariaDB.

   La autenticación YA NO vive en LocalStorage. Este archivo
   solo habla con la API (carpeta api/) y guarda el estado de
   la sesión únicamente en MEMORIA (se pierde al recargar y se
   vuelve a pedir al servidor).

   - No se guarda ninguna contraseña, token ni id de sesión en
     el navegador (la cookie de sesión es HttpOnly: JavaScript
     no puede verla).
   - El token CSRF vive solo en memoria y se envía en la
     cabecera X-CSRF-Token de las solicitudes POST.
   - Este archivo NO toca tiendaFronteriza_cart ni
     tiendaFronteriza_wishlist (carrito y favoritos de visitantes).

   Debe cargarse en TODAS las páginas que incluyan el header.
   ========================================================= */

const TF_API_BASE = "api/";
const TF_API_TIMEOUT_MS = 10000;

// Claves del sistema anterior (simulado). Se eliminan: guardaban contraseñas
// en texto plano y permitían "simular" una sesión editando LocalStorage.
const LEGACY_USERS_STORAGE_KEY = "tiendaFronteriza_users";
const LEGACY_SESSION_STORAGE_KEY = "tiendaFronteriza_session";

/* ---------------------------------------------------------
   1. ESTADO EN MEMORIA
--------------------------------------------------------- */

const authState = {
  loaded: false,     // ya se consultó al servidor al menos una vez
  session: null,     // { userId, name, email } o null
  csrfToken: null,   // token CSRF de la sesión PHP actual
  serverOk: true,    // false si no se pudo hablar con el servidor
};

let resolveAuthReady;
// Las páginas que necesiten saber si hay sesión hacen: await authReady;
const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

function purgeLegacyAuth() {
  try {
    localStorage.removeItem(LEGACY_USERS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  } catch (e) {
    // LocalStorage no disponible: no hay nada que limpiar.
  }
}

// Comparación de correo sin distinguir mayúsculas.
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

// El servidor responde { id, nombre, correo }; el resto del sitio usa { userId, name, email }.
function mapServerUser(usuario) {
  if (!usuario || typeof usuario !== "object") return null;
  // isAdmin solo decide si se muestra el enlace al panel; el servidor valida el permiso en cada operación.
  return { userId: usuario.id, name: String(usuario.nombre || ""), email: String(usuario.correo || ""), isAdmin: usuario.es_admin === true };
}

/* ---------------------------------------------------------
   2. COMUNICACIÓN CON LA API
--------------------------------------------------------- */

// Devuelve siempre { ok, status, data }; nunca lanza excepciones.
// status 0 = no hubo respuesta (Apache apagado, sin red, tiempo agotado).
async function apiRequest(endpoint, { method = "GET", body = null } = {}, isRetry = false) {
  const headers = { Accept: "application/json" };
  const options = { method, headers, credentials: "same-origin", cache: "no-store" };

  if (method !== "GET") {
    if (!authState.csrfToken) await fetchSession();
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = authState.csrfToken || "";
    options.body = JSON.stringify(body || {});
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TF_API_TIMEOUT_MS);
  options.signal = controller.signal;

  let response;
  try {
    response = await fetch(TF_API_BASE + endpoint, options);
  } catch (e) {
    return { ok: false, status: 0, data: { codigo: "sin_conexion" } };
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  // Token vencido (p. ej. la sesión caducó): se pide uno nuevo y se reintenta una vez.
  if (response.status === 403 && data && data.codigo === "csrf_invalido" && !isRetry && method !== "GET") {
    await fetchSession();
    return apiRequest(endpoint, { method, body }, true);
  }

  return { ok: response.ok && Boolean(data) && data.ok === true, status: response.status, data: data || {} };
}

// Pregunta al servidor si hay sesión y obtiene el token CSRF.
async function fetchSession() {
  const res = await apiRequest("sesion.php");
  if (res.ok) {
    authState.serverOk = true;
    authState.csrfToken = res.data.csrf_token || null;
    authState.session = res.data.autenticado ? mapServerUser(res.data.usuario) : null;
  } else {
    // Sin respuesta confiable del servidor: no se asume ninguna sesión.
    authState.serverOk = false;
    authState.session = null;
  }
  authState.loaded = true;
  return authState.session;
}

// Traduce una respuesta fallida a algo que las páginas puedan mostrar.
function describeApiFailure(res) {
  const d = res.data || {};
  if (res.status === 0) {
    return {
      reason: "network",
      message: "No se pudo conectar con el servidor. Verifica que Apache y MySQL estén iniciados en XAMPP.",
    };
  }
  if (res.status === 401) return { reason: "invalid", message: d.mensaje };
  if (res.status === 409) return { reason: "duplicate", message: d.mensaje, fieldErrors: d.errores || {} };
  if (res.status === 422) return { reason: "validation", message: d.mensaje, fieldErrors: d.errores || {} };
  if (res.status === 429) return { reason: "locked", message: d.mensaje };
  return {
    reason: "server",
    message: "No se pudo completar la solicitud. Inténtalo de nuevo en unos momentos.",
  };
}

/* ---------------------------------------------------------
   3. SESIÓN (consulta en memoria)
--------------------------------------------------------- */

function getSession() {
  return authState.session;
}

function isLoggedIn() {
  return authState.session !== null;
}

function notifySessionChanged() {
  renderHeaderAccount();
  document.dispatchEvent(new CustomEvent("tiendaFronteriza:sessionChanged"));
}

/* ---------------------------------------------------------
   4. REGISTRO / LOGIN / LOGOUT / PERFIL
   Todas devuelven una promesa con { success: true, ... } o
   { success: false, reason, message, fieldErrors? }.
--------------------------------------------------------- */

async function registerUser({ name, email, password, confirmPassword, acceptedPolicies }) {
  const res = await apiRequest("registro.php", {
    method: "POST",
    body: {
      nombre: (name || "").trim(),
      correo: normalizeEmail(email),
      password: password || "",
      confirmar_password: confirmPassword !== undefined ? confirmPassword : password || "",
      // Etapa 2: solo se envía true cuando la persona marcó la casilla; el servidor lo vuelve a exigir.
      ...(acceptedPolicies === true ? { acepta_politicas: true } : {}),
    },
  });

  if (res.ok) {
    return { success: true, user: mapServerUser(res.data.usuario) };
  }
  return { success: false, ...describeApiFailure(res) };
}

// No revela cuál de los dos datos falló: el servidor responde un mensaje genérico.
async function loginUser(email, password) {
  const res = await apiRequest("login.php", {
    method: "POST",
    body: { correo: normalizeEmail(email), password: password || "" },
  });

  if (res.ok) {
    authState.session = mapServerUser(res.data.usuario);
    authState.csrfToken = res.data.csrf_token || authState.csrfToken;
    authState.serverOk = true;
    // Fase 3.4: se fusiona el carrito de visitante con el de la cuenta (MariaDB) antes de redirigir.
    if (typeof cartOnLogin === "function") await cartOnLogin();
    notifySessionChanged();
    return { success: true, session: authState.session };
  }
  return { success: false, ...describeApiFailure(res) };
}

// Cierra sesión en el servidor. Fase 3.4: limpia la copia LOCAL del carrito (el de MariaDB se conserva); no toca favoritos.
async function logoutUser() {
  // Fase 3.4: se intentan guardar los cambios pendientes del carrito antes de cerrar la sesión.
  if (typeof cartBeforeLogout === "function") await cartBeforeLogout();
  const res = await apiRequest("logout.php", { method: "POST", body: {} });
  if (!res.ok) {
    return { success: false, ...describeApiFailure(res) };
  }
  authState.session = null;
  authState.csrfToken = null;
  // Fase 3.4: se limpia la copia local; el carrito sigue guardado en MariaDB.
  if (typeof cartAfterLogout === "function") cartAfterLogout();
  await fetchSession(); // el servidor entrega un token nuevo para la sesión de visitante
  notifySessionChanged();
  return { success: true };
}

// Función protegida: solo responde con sesión válida en el servidor.
async function fetchProfile() {
  const res = await apiRequest("perfil.php");
  if (res.ok) {
    return { success: true, user: mapServerUser(res.data.usuario) };
  }
  if (res.status === 401) {
    authState.session = null;
    notifySessionChanged();
    return { success: false, reason: "unauthenticated" };
  }
  return { success: false, ...describeApiFailure(res) };
}

/* ---------------------------------------------------------
   5. PROTECCIÓN DE PÁGINAS (ej. checkout, perfil)
   Usar DESPUÉS de await authReady. Si no hay sesión, redirige
   a login.html?redirect=<pagina> y devuelve false.
--------------------------------------------------------- */

function protectPage(redirectTarget) {
  // Si el servidor todavía no responde, no se decide nada (evita falsos cierres de sesión).
  if (!authState.loaded) return false;
  if (isLoggedIn()) return true;
  const target = redirectTarget || "index.html";
  window.location.href = `login.html?redirect=${encodeURIComponent(target)}`;
  return false;
}

// Solo se permite redirigir de vuelta a páginas conocidas del propio sitio,
// nunca a una URL externa (evita redirecciones abiertas / open redirect).
const ALLOWED_REDIRECT_PAGES = [
  "index.html",
  "carrito.html",
  "favoritos.html",
  "producto.html",
  "perfil.html",
  "checkout.html",
  "pedidos.html",
];

function getSafeRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (!redirect) return null;

  // Solo el nombre de archivo, sin dominio ni query adicional.
  const page = redirect.split("?")[0].split("/").pop();
  return ALLOWED_REDIRECT_PAGES.includes(page) ? page : null;
}

/* ---------------------------------------------------------
   6. ESTADO DE SESIÓN EN EL HEADER
   Pinta el menú de cuenta (icono + dropdown) en cualquier
   página que incluya el markup #accountMenu / #accountBtn /
   #accountDropdown. No rompe buscador, favoritos, carrito ni
   el menú móvil, que siguen a cargo de app.js / cart.js.
--------------------------------------------------------- */

function renderHeaderAccount() {
  const dropdown = document.getElementById("accountDropdown");
  const accountBtn = document.getElementById("accountBtn");
  if (!dropdown || !accountBtn) return;

  // Mientras se consulta al servidor no se muestra ni "sesión" ni "sin sesión".
  if (!authState.loaded) {
    accountBtn.classList.remove("is-active");
    dropdown.innerHTML = `<p class="account-dropdown-text">Comprobando sesión…</p>`;
    return;
  }

  const session = getSession();

  if (!session) {
    accountBtn.classList.remove("is-active");
    accountBtn.setAttribute("aria-label", "Iniciar sesión");
    dropdown.innerHTML = `
      <p class="account-dropdown-text">Inicia sesión para ver tu cuenta.</p>
      <a href="login.html" class="btn btn--primary btn--small btn--full">Iniciar sesión</a>
      <a href="registro.html" class="btn btn--clear btn--small btn--full">Crear cuenta</a>
    `;
    return;
  }

  accountBtn.classList.add("is-active");
  accountBtn.setAttribute("aria-label", `Cuenta de ${session.name}`);
  // Nombre y correo vienen de la base de datos: siempre se escapan antes de pintarlos.
  dropdown.innerHTML = `
    <p class="account-dropdown-greeting">Hola, ${escapeHtml(session.name)}</p>
    <p class="account-dropdown-email">${escapeHtml(session.email)}</p>
    <a href="perfil.html" class="btn btn--clear btn--small btn--full">Mi perfil</a>
    <a href="pedidos.html" class="btn btn--clear btn--small btn--full">Mis pedidos</a>
    ${session.isAdmin ? '<a href="admin/index.html" class="btn btn--clear btn--small btn--full" data-admin-link>Panel administrativo</a>' : ""}
    <button type="button" class="btn btn--primary btn--small btn--full account-dropdown-logout" id="logoutBtn">
      Cerrar sesión
    </button>
  `;

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    const result = await logoutUser();
    closeAccountDropdown();
    showToastSafe(result.success ? "Sesión cerrada." : "No se pudo cerrar la sesión. Inténtalo de nuevo.");
  });
}

// Evita inyección de HTML si un nombre/correo llegara a contener caracteres especiales.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// showToast vive en js/cart.js. Si por algún motivo no está disponible
// (orden de scripts distinto), esta función no rompe la página.
function showToastSafe(message) {
  if (typeof showToast === "function") showToast(message);
}

function openAccountDropdown() {
  const dropdown = document.getElementById("accountDropdown");
  const btn = document.getElementById("accountBtn");
  if (!dropdown || !btn) return;
  dropdown.hidden = false;
  dropdown.classList.add("is-open");
  btn.setAttribute("aria-expanded", "true");
}

function closeAccountDropdown() {
  const dropdown = document.getElementById("accountDropdown");
  const btn = document.getElementById("accountBtn");
  if (!dropdown || !btn) return;
  dropdown.classList.remove("is-open");
  dropdown.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}

function setupAccountMenu() {
  const accountMenu = document.getElementById("accountMenu");
  const accountBtn = document.getElementById("accountBtn");
  const dropdown = document.getElementById("accountDropdown");
  if (!accountMenu || !accountBtn || !dropdown) return;

  accountBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = dropdown.classList.contains("is-open");
    if (isOpen) {
      closeAccountDropdown();
    } else {
      openAccountDropdown();
    }
  });

  document.addEventListener("click", (e) => {
    if (!accountMenu.contains(e.target)) closeAccountDropdown();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAccountDropdown();
  });
}

/* ---------------------------------------------------------
   7. INICIALIZACIÓN
--------------------------------------------------------- */

purgeLegacyAuth();

// La consulta al servidor arranca de inmediato, sin esperar al resto de la página.
fetchSession().then(() => {
  resolveAuthReady(getSession());
  notifySessionChanged();
});

document.addEventListener("DOMContentLoaded", () => {
  renderHeaderAccount();
  setupAccountMenu();
});

// Si en otra pestaña se inició o cerró sesión, al volver a esta pestaña se vuelve a consultar al servidor.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !authState.loaded) return;
  const antes = JSON.stringify(authState.session);
  await fetchSession();
  if (JSON.stringify(authState.session) !== antes) notifySessionChanged();
});

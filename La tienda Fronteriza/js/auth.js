/* =========================================================
   TIENDA FRONTERIZA — auth.js
   Fase 6: registro, login, sesión y protección de checkout.

   Autenticación SIMULADA, exclusivamente FrontEnd. No hay
   backend, base de datos ni API: todo vive en LocalStorage.

   Claves de LocalStorage:
   - tiendaFronteriza_users   → arreglo de usuarios registrados
   - tiendaFronteriza_session → sesión activa (o inexistente)

   Este archivo NO toca tiendaFronteriza_cart ni
   tiendaFronteriza_wishlist, y debe cargarse en TODAS las
   páginas que incluyan el header (para poder pintar el estado
   de sesión), después de js/app.js.
   ========================================================= */

const USERS_STORAGE_KEY = "tiendaFronteriza_users";
const SESSION_STORAGE_KEY = "tiendaFronteriza_session";

/* ---------------------------------------------------------
   1. LECTURA / ESCRITURA DE USUARIOS (LocalStorage)
--------------------------------------------------------- */

function getUsers() {
  let raw;
  try {
    raw = localStorage.getItem(USERS_STORAGE_KEY);
  } catch (e) {
    return []; // LocalStorage no disponible (modo privado, etc.)
  }

  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (u) => u && typeof u.id === "string" && typeof u.email === "string" && typeof u.password === "string"
  );
}

function saveUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
}

// Comparación de correo case-insensitive (Usuario@correo.com === usuario@correo.com).
function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function findUserByEmail(email) {
  const target = normalizeEmail(email);
  return getUsers().find((u) => normalizeEmail(u.email) === target) || null;
}

function generateUserId() {
  return "user-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------------------------------------------------------
   2. REGISTRO
--------------------------------------------------------- */

// Crea un usuario si el correo no está registrado todavía.
// Devuelve { success: true, user } o { success: false, reason: "duplicate" }.
function registerUser({ name, email, password }) {
  if (findUserByEmail(email)) {
    return { success: false, reason: "duplicate" };
  }

  const user = {
    id: generateUserId(),
    name: name.trim(),
    email: email.trim(),
    password, // Proyecto académico FrontEnd: sin backend ni hashing real.
  };

  const users = getUsers();
  users.push(user);
  saveUsers(users);

  return { success: true, user };
}

/* ---------------------------------------------------------
   3. SESIÓN (LocalStorage)
--------------------------------------------------------- */

function getSession() {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch (e) {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === "string") return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    // no-op
  }
}

function isLoggedIn() {
  return getSession() !== null;
}

/* ---------------------------------------------------------
   4. LOGIN / LOGOUT
--------------------------------------------------------- */

// Busca al usuario por correo y compara contraseña. No revela cuál de los
// dos datos falló: siempre { success: false } ante cualquier error.
function loginUser(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.password !== password) {
    return { success: false };
  }

  const session = { userId: user.id, name: user.name, email: user.email };
  saveSession(session);
  notifySessionChanged();
  return { success: true, session };
}

// Cierra sesión. NO toca carrito ni favoritos.
function logoutUser() {
  clearSession();
  notifySessionChanged();
}

function notifySessionChanged() {
  renderHeaderAccount();
  document.dispatchEvent(new CustomEvent("tiendaFronteriza:sessionChanged"));
}

/* ---------------------------------------------------------
   5. PROTECCIÓN DE PÁGINAS (ej. checkout)
   Si no hay sesión, redirige a login.html?redirect=<pagina>
   y devuelve false. Si hay sesión, devuelve true.
--------------------------------------------------------- */

function protectPage(redirectTarget) {
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
  "checkout.html", // FASE 7: checkout real ya implementado
];

function getSafeRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (!redirect) return null;

  // Solo el nombre de archivo, sin dominio ni query adicional: evita
  // que alguien pase una URL absoluta o externa por el parámetro.
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
  dropdown.innerHTML = `
    <p class="account-dropdown-greeting">Hola, ${escapeHtml(session.name)}</p>
    <p class="account-dropdown-email">${escapeHtml(session.email)}</p>
    <a href="perfil.html" class="btn btn--clear btn--small btn--full">Mi perfil</a>
    <button type="button" class="btn btn--primary btn--small btn--full account-dropdown-logout" id="logoutBtn">
      Cerrar sesión
    </button>
  `;

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    logoutUser();
    closeAccountDropdown();
    showToastSafe("Sesión cerrada.");
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

  // Si otra pestaña inicia/cierra sesión, este header se actualiza también.
  window.addEventListener("storage", (e) => {
    if (e.key === SESSION_STORAGE_KEY) renderHeaderAccount();
  });
}

/* ---------------------------------------------------------
   7. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  renderHeaderAccount();
  setupAccountMenu();
});

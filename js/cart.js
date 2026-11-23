/* =========================================================
   TIENDA FRONTERIZA — cart.js
   Fase 4: carrito de compras + LocalStorage.

   Única fuente de verdad del carrito: la clave de LocalStorage
   STORAGE_KEY. Tanto el drawer (en cualquier página), como
   carrito.html y producto.html leen y escriben a través de las
   funciones de este archivo — nadie toca LocalStorage directo.

   Depende de `products`, `formatPrice` y `capitalize`, ya
   definidos en js/app.js (que se carga antes que este archivo).
   Fase 3.4: la sección 7 (final del archivo) sincroniza el carrito con MariaDB
   cuando hay sesión; usa apiRequest/authReady de js/auth.js en tiempo de ejecución.
   ========================================================= */

const STORAGE_KEY = "tiendaFronteriza_cart";

// EDITAR aquí cuando se definan los valores comerciales reales.
const TAX_RATE = 0.16; // 16% — tasa de impuestos
const SHIPPING_COST = 0; // costo de envío fijo (0 = pendiente de definir)

/* ---------------------------------------------------------
   1. LECTURA / ESCRITURA DEL CARRITO (LocalStorage)
--------------------------------------------------------- */

// Devuelve el carrito guardado como un arreglo de { id, quantity }.
// Si no existe o los datos están corruptos, devuelve un carrito vacío
// sin romper la página.
function getCart() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
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

  // Filtra cualquier entrada inválida o que ya no corresponda a un producto real.
  return parsed.filter(
    (item) =>
      item &&
      typeof item.id === "string" &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      (!canValidateStoredProducts() || products.some((p) => p.id === item.id))
  );
}

// Guarda el carrito completo y notifica a toda la interfaz (contador, drawer, carrito.html).
function saveCart(cart) {
  // Fase 3.4: se compara con lo que había para saber qué cambió (y enviarlo a MariaDB si hay sesión).
  const previous = readRawCartMap();
  cartSync.changeCount += 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
  trackCartChanges(previous, cart);
  notifyCartUpdated();
}

// Refresca todo lo que depende del carrito y avisa a scripts de página (ej. carrito.js).
function notifyCartUpdated() {
  updateCartCounter();
  renderCartDrawer();
  document.dispatchEvent(new CustomEvent("tiendaFronteriza:cartUpdated"));
}

/* ---------------------------------------------------------
   2. OPERACIONES DEL CARRITO
--------------------------------------------------------- */

function findProductForCartItem(item) {
  return products.find((p) => p.id === item.id) || null;
}

// Agrega `quantity` unidades del producto `productId`. Si ya estaba en el
// carrito, suma a la cantidad existente (nunca duplica la línea). Respeta
// el stock disponible.
function addToCart(productId, quantity = 1) {
  const product = products.find((p) => p.id === productId);
  if (!product) return { success: false, reason: "not-found" };
  if (!isProductAvailable(product)) return { success: false, reason: "out-of-stock" };

  const cart = getCart();
  const existing = cart.find((item) => item.id === productId);
  const currentQty = existing ? existing.quantity : 0;
  const requestedAdd = Math.max(1, Math.floor(quantity) || 1);
  const desiredQty = currentQty + requestedAdd;
  const finalQty = Math.min(desiredQty, product.stock);
  const clamped = finalQty < desiredQty;

  if (existing) {
    existing.quantity = finalQty;
  } else {
    cart.push({ id: productId, quantity: finalQty });
  }

  saveCart(cart);
  return { success: true, quantity: finalQty, clamped };
}

function removeFromCart(productId) {
  const cart = getCart().filter((item) => item.id !== productId);
  saveCart(cart);
}

// Establece la cantidad exacta de un producto ya presente en el carrito.
// Menos de 1 elimina el producto. Nunca supera el stock disponible.
function updateCartQuantity(productId, newQuantity) {
  const cart = getCart();
  const existing = cart.find((item) => item.id === productId);
  if (!existing) return;

  if (newQuantity < 1) {
    removeFromCart(productId);
    return;
  }

  const product = findProductForCartItem(existing);
  const max = product && product.stock ? product.stock : newQuantity;
  existing.quantity = Math.min(newQuantity, max);
  saveCart(cart);
}

function clearCart() {
  saveCart([]);
}

/* ---------------------------------------------------------
   3. CÁLCULOS (subtotal, impuestos, envío, total)
--------------------------------------------------------- */

function getCartItemCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function calculateSubtotal(cart = getCart()) {
  return cart.reduce((sum, item) => {
    const product = findProductForCartItem(item);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);
}

function calculateTax(subtotal) {
  return subtotal * TAX_RATE;
}

function calculateShipping(cart = getCart()) {
  return cart.length === 0 ? 0 : SHIPPING_COST;
}

function calculateTotal(cart = getCart()) {
  const subtotal = calculateSubtotal(cart);
  return subtotal + calculateTax(subtotal) + calculateShipping(cart);
}

// Formato de moneda para el carrito. A diferencia de formatPrice() (Fase 1,
// que oculta los precios en $0 con "Precio próximamente" en las tarjetas),
// aquí siempre se muestra la cifra real, incluido $0.00 mientras los
// precios no estén configurados.
function formatMoney(value) {
  return (value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

/* ---------------------------------------------------------
   4. CONTADOR DEL ENCABEZADO
--------------------------------------------------------- */

function updateCartCounter() {
  const el = document.getElementById("cartCount");
  if (!el) return;
  el.textContent = String(getCartItemCount());
}

/* ---------------------------------------------------------
   5. CONFIRMACIÓN VISUAL (toast)
--------------------------------------------------------- */

function showToast(message) {
  let toast = document.getElementById("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove("is-visible");
  void toast.offsetWidth; // reinicia la animación si ya estaba visible
  toast.classList.add("is-visible");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

/* ---------------------------------------------------------
   6. CARRITO LATERAL (DRAWER)
   Usa el mismo markup en index.html, producto.html y carrito.html.
--------------------------------------------------------- */

function renderCartItemRow(item, { compact = false } = {}) {
  const product = findProductForCartItem(item);
  if (!product) return "";

  const lineTotal = product.price * item.quantity;
  const max = product.stock || item.quantity;

  return `
    <div class="cart-drawer-item" data-cart-item="${product.id}">
      <a href="producto.html?id=${encodeURIComponent(product.id)}" class="cart-drawer-item-image">
        <img src="${product.image}" alt="${product.brand} ${product.name}" loading="lazy" />
      </a>
      <div class="cart-drawer-item-info">
        <span class="cart-drawer-item-brand">${product.brand}</span>
        <a href="producto.html?id=${encodeURIComponent(product.id)}" class="cart-drawer-item-name">${product.name}</a>
        <div class="cart-drawer-item-qty">
          <button type="button" class="qty-btn qty-btn--sm" data-cart-qty-minus="${product.id}" aria-label="Disminuir cantidad">−</button>
          <span class="cart-drawer-item-qty-value">${item.quantity}</span>
          <button type="button" class="qty-btn qty-btn--sm" data-cart-qty-plus="${product.id}" aria-label="Aumentar cantidad" ${item.quantity >= max ? "disabled" : ""}>+</button>
        </div>
        <span class="cart-drawer-item-subtotal">${formatMoney(lineTotal)}</span>
      </div>
      <button type="button" class="cart-drawer-item-remove" data-cart-remove="${product.id}" aria-label="Eliminar ${product.name} del carrito">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
        </svg>
      </button>
    </div>
  `;
}

function renderCartDrawer() {
  const body = document.getElementById("cartDrawerBody");
  const footer = document.getElementById("cartDrawerFooter");
  if (!body || !footer) return; // esta página no incluye el drawer

  const cart = getCart();

  if (cart.length === 0) {
    body.innerHTML = `<p class="cart-drawer-empty">Tu carrito está vacío.</p>`;
    footer.innerHTML = `<a href="index.html" class="btn btn--primary btn--full">Seguir comprando</a>`;
    return;
  }

  body.innerHTML = cart.map((item) => renderCartItemRow(item)).join("");

  const subtotal = calculateSubtotal(cart);
  footer.innerHTML = `
    <div class="cart-drawer-subtotal">
      <span>Subtotal</span>
      <strong>${formatMoney(subtotal)}</strong>
    </div>
    <a href="carrito.html" class="btn btn--primary btn--full">Ver carrito</a>
    <a href="index.html" class="btn btn--clear btn--full">Seguir comprando</a>
  `;
}

function setupCartDrawer() {
  const cartBtn = document.getElementById("cartBtn");
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartDrawerOverlay");
  const closeBtn = document.getElementById("cartDrawerClose");
  if (!drawer) return;

  function openDrawer() {
    renderCartDrawer();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  }

  cartBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openDrawer();
  });

  closeBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Delegación de eventos para +/- y eliminar dentro del drawer.
  drawer.addEventListener("click", (e) => {
    const minusBtn = e.target.closest("[data-cart-qty-minus]");
    const plusBtn = e.target.closest("[data-cart-qty-plus]");
    const removeBtn = e.target.closest("[data-cart-remove]");

    if (minusBtn) {
      const id = minusBtn.dataset.cartQtyMinus;
      const item = getCart().find((i) => i.id === id);
      if (item) updateCartQuantity(id, item.quantity - 1);
    } else if (plusBtn && !plusBtn.disabled) {
      const id = plusBtn.dataset.cartQtyPlus;
      const item = getCart().find((i) => i.id === id);
      if (item) updateCartQuantity(id, item.quantity + 1);
    } else if (removeBtn) {
      removeFromCart(removeBtn.dataset.cartRemove);
    }
  });
}

/* ---------------------------------------------------------
   7. BOTONES "AGREGAR AL CARRITO" DEL CATÁLOGO
   Funciona con cualquier tarjeta renderizada por renderProductCard
   (Destacados, Ofertas o Catálogo), sin importar cuándo se inserte
   en el DOM, gracias a la delegación de eventos.
--------------------------------------------------------- */

function setupCatalogAddToCartButtons() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-cart-btn[data-add]");
    if (!btn || btn.disabled) return;

    const result = addToCart(btn.dataset.add, 1);

    if (!result.success) {
      showToast(result.reason === "out-of-stock" ? "Este producto está agotado." : "No se pudo agregar el producto.");
      return;
    }

    showToast(result.clamped ? "Cantidad ajustada al stock disponible." : "Producto agregado al carrito.");
  });
}

/* ---------------------------------------------------------
   8. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  updateCartCounter();
  renderCartDrawer();
  setupCartDrawer();
  setupCatalogAddToCartButtons();

  // Fase 3.3: cuando la API entrega los productos reales se vuelve a pintar el
  // carrito con precios y stock de MariaDB (y se descartan productos inexistentes).
  catalogReady.then(notifyCartUpdated);

  // Fase 3.4: con sesión iniciada, el carrito se carga y se guarda en MariaDB.
  initCartSync();
});

/* =========================================================
   7. CARRITO EN MARIADB (Fase 3.4)

   - Visitante (sin sesión): todo sigue en LocalStorage, como siempre.
   - Usuario con sesión: MariaDB es la fuente de verdad. LocalStorage guarda una copia
     para que la interfaz responda al instante, y cada cambio se envía al servidor.
   - Si un cambio no llega al servidor, queda PENDIENTE en LocalStorage, asociado al
     usuario correcto (CART_SYNC_KEY). Se reintenta sin duplicar nada porque cada cambio
     es absoluto ("deja X en N unidades" / "quita X").
   - Conflictos (otro dispositivo cambió el mismo producto): gana la versión del servidor
     y se avisa al usuario con el nombre de los productos afectados.
   - Los carritos de usuarios distintos nunca se mezclan: cada cuenta tiene su propia
     entrada en CART_SYNC_KEY y el servidor rechaza (409) si la sesión es de otra cuenta.
========================================================= */

const CART_SYNC_KEY = "tiendaFronteriza_cartSync";
const CART_SYNC_DEBOUNCE_MS = 350;
const CART_SYNC_RETRY_MS = [5000, 15000, 30000, 60000];
const CART_REFRESH_MIN_INTERVAL_MS = 30000;

const cartSync = {
  inFlight: false,
  again: false,
  reconciling: null,
  timer: null,
  retryTimer: null,
  retryIndex: 0,
  changeCount: 0, // sube con CUALQUIER cambio local: detecta respuestas del servidor ya viejas
  status: "idle", // "idle" | "error"
  lastRefresh: 0,
};

/* ---------- 7.1 Almacenamiento de cambios pendientes ---------- */

// { owner: id de la cuenta a la que pertenece la copia local (null = visitante),
//   seq: contador de cambios,
//   users: { "<id>": { snapshot: {codigo: cantidad}, pending: {codigo: {a:"s"|"e", q, n}} } } }
function readSyncStore() {
  try {
    const raw = localStorage.getItem(CART_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && parsed.users && typeof parsed.users === "object") {
      return {
        owner: Number.isInteger(parsed.owner) ? parsed.owner : null,
        seq: Number.isInteger(parsed.seq) ? parsed.seq : 0,
        users: parsed.users,
      };
    }
  } catch (e) {
    // datos corruptos o LocalStorage no disponible: se empieza de cero
  }
  return { owner: null, seq: 0, users: {} };
}

function writeSyncStore(store) {
  try {
    localStorage.setItem(CART_SYNC_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    return false;
  }
}

function userEntry(store, userId) {
  const key = String(userId);
  const entry = store.users[key];
  if (!entry || typeof entry !== "object") {
    store.users[key] = { snapshot: {}, pending: {} };
  }
  if (!store.users[key].snapshot || typeof store.users[key].snapshot !== "object") store.users[key].snapshot = {};
  if (!store.users[key].pending || typeof store.users[key].pending !== "object") store.users[key].pending = {};
  return store.users[key];
}

function pendingCount(entry) {
  return entry && entry.pending ? Object.keys(entry.pending).length : 0;
}

function totalPendingFor(userId) {
  if (userId === null || userId === undefined) return 0;
  return pendingCount(readSyncStore().users[String(userId)]);
}

/* ---------- 7.2 Copia local del carrito (vista) ---------- */

// Carrito guardado SIN filtrar por catálogo: { codigo: cantidad }.
function readRawCartMap() {
  const map = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (item && typeof item.id === "string" && Number.isInteger(item.quantity) && item.quantity > 0) {
          map[item.id] = item.quantity;
        }
      });
    }
  } catch (e) {
    // sin datos válidos
  }
  return map;
}

// Escribe la copia local SIN registrar cambios pendientes (viene del servidor).
function writeLocalCartRaw(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // sin LocalStorage: la sesión sigue funcionando con los datos del servidor
  }
}

function sameCartList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Reemplaza la copia local por la del servidor (más los cambios pendientes que sigan vigentes).
function setLocalViewIfChanged(serverItems, pending) {
  const map = {};
  serverItems.forEach((item) => {
    map[item.codigo] = item.cantidad;
  });
  Object.keys(pending || {}).forEach((code) => {
    const op = pending[code];
    if (op.a === "s") map[code] = op.q;
    else delete map[code];
  });
  const view = Object.keys(map).map((code) => ({ id: code, quantity: map[code] }));
  const current = Object.keys(readRawCartMap()).map((code) => ({ id: code, quantity: readRawCartMap()[code] }));
  if (sameCartList(view, current)) return;

  // Con la pantalla "Pedido confirmado" abierta no se vuelve a llenar el carrito:
  // se actualizará en la siguiente página.
  const confirmation = document.getElementById("checkoutConfirmation");
  if (confirmation && !confirmation.hidden) return;

  writeLocalCartRaw(view);
  notifyCartUpdated();
}

/* ---------- 7.3 Identidad: ¿de qué cuenta es este carrito? ---------- */

function sessionUserId() {
  if (typeof isLoggedIn === "function" && isLoggedIn()) {
    const session = getSession();
    return session && Number.isInteger(session.userId) ? session.userId : null;
  }
  return null;
}

// Usuario al que se le atribuyen los cambios locales. Con sesión confirmada es el de la sesión;
// si el servidor no respondió (aún no sabemos), se conserva el dueño actual de la copia local.
function authKnown() {
  return typeof authState !== "undefined" && authState.loaded && authState.serverOk;
}

function trackingUserId() {
  const id = sessionUserId();
  if (id !== null) return id;
  if (!authKnown()) return readSyncStore().owner;
  return null;
}

/* ---------- 7.4 Registro de cambios locales (se llama desde saveCart) ---------- */

function trackCartChanges(previous, cart) {
  const userId = trackingUserId();
  if (userId === null) return; // visitante: solo LocalStorage

  const store = readSyncStore();
  if (store.owner !== userId) return; // aún no se ha cargado el carrito de la cuenta: cuenta como carrito de visitante

  const next = {};
  cart.forEach((item) => {
    next[item.id] = item.quantity;
  });

  const entry = userEntry(store, userId);
  let changed = false;
  new Set([...Object.keys(previous), ...Object.keys(next)]).forEach((code) => {
    const before = previous[code] || 0;
    const after = next[code] || 0;
    if (before === after) return;
    store.seq += 1;
    entry.pending[code] = after > 0 ? { a: "s", q: after, n: store.seq } : { a: "e", q: 0, n: store.seq };
    changed = true;
  });
  if (!changed) return;

  if (!writeSyncStore(store)) {
    showCartSyncBanner(
      "error",
      "No se pudo guardar el cambio de tu carrito en este navegador ni en tu cuenta. Libera espacio del navegador e inténtalo de nuevo."
    );
    return;
  }
  scheduleCartSync(CART_SYNC_DEBOUNCE_MS);
}

/* ---------- 7.5 Avisos al usuario ---------- */

function cartProductLabel(code) {
  const product = products.find((p) => p.id === code);
  return product ? product.name : escapeForHtml(code); // product.name ya viene escapado
}

function joinLabels(codes) {
  return codes.map(cartProductLabel).join(", ");
}

function showCartSyncBanner(kind, html, { retry = false } = {}) {
  let banner = document.getElementById("cartSyncBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "cartSyncBanner";
    document.body.appendChild(banner);
    banner.addEventListener("click", (e) => {
      const action = e.target.closest("[data-cart-sync]");
      if (!action) return;
      if (action.dataset.cartSync === "retry") retryCartSync();
      if (action.dataset.cartSync === "close") hideCartSyncBanner();
    });
  }
  banner.className = `cart-sync-banner cart-sync-banner--${kind}`;
  banner.setAttribute("role", kind === "error" ? "alert" : "status");
  banner.innerHTML = `
    <p>${html}</p>
    <div class="cart-sync-banner__actions">
      ${retry ? '<button type="button" class="btn btn--primary btn--small" data-cart-sync="retry">Reintentar</button>' : ""}
      ${kind === "error" && retry ? "" : '<button type="button" class="btn btn--clear btn--small" data-cart-sync="close">Entendido</button>'}
    </div>
  `;
  banner.hidden = false;
}

function hideCartSyncBanner() {
  const banner = document.getElementById("cartSyncBanner");
  if (banner) banner.hidden = true;
}

function showSyncError(userId, extra) {
  cartSync.status = "error";
  const count = totalPendingFor(userId);
  const detail = count > 0 ? ` Tienes ${count} cambio${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"} de guardar.` : "";
  showCartSyncBanner(
    "error",
    `No se pudo guardar tu carrito en tu cuenta.${detail} Tus cambios están guardados en este navegador y no se perderán. ${extra || ""}`.trim(),
    { retry: true }
  );
}

function markCartSynced() {
  clearTimeout(cartSync.retryTimer);
  cartSync.retryIndex = 0;
  if (cartSync.status === "error") {
    cartSync.status = "idle";
    hideCartSyncBanner();
    showToast("Tu carrito se guardó correctamente en tu cuenta.");
  }
}

// Informa de lo que el servidor NO aplicó tal cual se pidió.
function reportCartResults(results) {
  if (!Array.isArray(results)) return;
  const conflicts = results.filter((r) => r.estado === "conflicto").map((r) => r.codigo);
  const adjusted = results.filter((r) => r.estado === "ajustado");
  const rejected = results.filter((r) => r.estado === "rechazado" && r.motivo !== "producto_no_encontrado");
  const parts = [];

  if (conflicts.length > 0) {
    parts.push(
      `Tu carrito se modificó desde otro dispositivo. Para ${joinLabels(conflicts)} se conservó la versión guardada en tu cuenta (la más reciente en el servidor) y tu cambio no se aplicó.`
    );
  }
  if (adjusted.length > 0) {
    parts.push(
      `Se ajustó la cantidad al stock disponible: ${adjusted.map((r) => `${cartProductLabel(r.codigo)} (${r.cantidad})`).join(", ")}.`
    );
  }
  if (rejected.length > 0) {
    parts.push(`No se pudo agregar por falta de existencias o disponibilidad: ${joinLabels(rejected.map((r) => r.codigo))}.`);
  }
  if (parts.length > 0) showCartSyncBanner("info", parts.join(" "));
}

/* ---------- 7.6 Envío de cambios pendientes ---------- */

function scheduleCartSync(delay) {
  clearTimeout(cartSync.timer);
  cartSync.timer = setTimeout(() => {
    syncNow();
  }, delay);
}

function scheduleCartRetry(seconds) {
  clearTimeout(cartSync.retryTimer);
  const wait = seconds ? seconds * 1000 : CART_SYNC_RETRY_MS[Math.min(cartSync.retryIndex, CART_SYNC_RETRY_MS.length - 1)];
  cartSync.retryIndex += 1;
  cartSync.retryTimer = setTimeout(retryCartSync, wait);
}

function mapFromServerItems(items) {
  const map = {};
  (items || []).forEach((item) => {
    map[item.codigo] = item.cantidad;
  });
  return map;
}

// Un solo envío a la vez. Si el usuario sigue cambiando cosas mientras tanto, se vuelve a enviar
// lo nuevo cuando termina el envío en curso; una respuesta vieja nunca pisa un cambio más reciente.
async function syncNow() {
  if (cartSync.inFlight) {
    cartSync.again = true;
    return;
  }
  const userId = trackingUserId();
  if (userId === null) return;

  cartSync.inFlight = true;
  clearTimeout(cartSync.timer);
  try {
    for (let round = 0; round < 6; round += 1) {
      cartSync.again = false;
      const store = readSyncStore();
      if (store.owner !== userId) return;
      const entry = userEntry(store, userId);
      const sent = Object.assign({}, entry.pending);
      const codes = Object.keys(sent);
      if (codes.length === 0) {
        markCartSynced();
        return;
      }

      const res = await apiRequest("carrito_sincronizar.php", {
        method: "POST",
        body: {
          usuario_esperado: userId,
          base: entry.snapshot,
          cambios: codes.map((code) =>
            sent[code].a === "s"
              ? { codigo: code, accion: "establecer", cantidad: sent[code].q }
              : { codigo: code, accion: "eliminar" }
          ),
        },
      });

      if (!res.ok || !res.data.carrito || !res.data.usuario || res.data.usuario.id !== userId) {
        await handleSyncFailure(res, userId);
        return;
      }
      if (readSyncStore().owner !== userId) return; // la copia local cambió de dueño mientras se esperaba

      applyServerCart(userId, res.data, sent);
      reportCartResults(res.data.resultados);
      if (totalPendingFor(userId) === 0) {
        markCartSynced();
        return;
      }
    }
  } finally {
    cartSync.inFlight = false;
    if (cartSync.again && cartSync.status !== "error" && totalPendingFor(userId) > 0) scheduleCartSync(50);
  }
}

// Guarda lo que respondió el servidor y quita de "pendientes" SOLO lo que se envió.
function applyServerCart(userId, data, sent) {
  const store = readSyncStore();
  if (store.owner !== userId) return;
  const entry = userEntry(store, userId);
  Object.keys(sent).forEach((code) => {
    const current = entry.pending[code];
    if (current && current.n === sent[code].n) delete entry.pending[code]; // si cambió mientras tanto, se conserva el más nuevo
  });
  entry.snapshot = mapFromServerItems(data.carrito.items);
  writeSyncStore(store);

  mergeApiProducts(data.carrito.items.map((item) => item.producto));
  setLocalViewIfChanged(data.carrito.items, entry.pending);
}

async function handleSyncFailure(res, userId) {
  if (res.status === 401 || res.status === 409) {
    // La sesión terminó o es de otra cuenta: se resguardan los pendientes y se revisa quién es el usuario.
    if (typeof fetchSession === "function") await fetchSession();
    if (typeof notifySessionChanged === "function") notifySessionChanged();
    await reconcileCartOwner();
    return;
  }
  showSyncError(userId, res.status === 429 ? "Hiciste muchos cambios seguidos; se reintentará en un momento." : "");
  const wait = res.status === 429 && res.data && res.data.espera_segundos ? Math.min(res.data.espera_segundos, 300) : 0;
  scheduleCartRetry(wait);
}

// Botón "Reintentar", evento "online" y reintentos automáticos.
async function retryCartSync() {
  clearTimeout(cartSync.retryTimer);
  if (typeof authState !== "undefined" && !authState.serverOk && typeof fetchSession === "function") {
    await fetchSession();
  }
  const userId = sessionUserId();
  if (userId !== null && readSyncStore().owner === userId) {
    await syncNow();
  } else {
    await reconcileCartOwner();
  }
}

/* ---------- 7.7 Quién es el dueño de la copia local ---------- */

// Se ejecuta al cargar cada página con la sesión ya conocida, y al iniciar/cerrar sesión.
function reconcileCartOwner() {
  if (cartSync.reconciling) return cartSync.reconciling;
  cartSync.reconciling = reconcileCartOwnerInner().finally(() => {
    cartSync.reconciling = null;
  });
  return cartSync.reconciling;
}

async function reconcileCartOwnerInner() {
  if (!authKnown()) {
    // No hay respuesta del servidor: no se toca nada. Si hay cambios pendientes, se avisa.
    const owner = readSyncStore().owner;
    if (owner !== null && totalPendingFor(owner) > 0) {
      showSyncError(owner, "No se pudo conectar con el servidor.");
      scheduleCartRetry(0);
    }
    return;
  }

  const userId = sessionUserId();
  let store = readSyncStore();

  if (userId === null) {
    if (store.owner !== null) stashCartOwner(store);
    return;
  }
  if (store.owner !== null && store.owner !== userId) {
    stashCartOwner(store); // el carrito local era de otra cuenta: nunca se mezcla con esta
    store = readSyncStore();
  }
  if (store.owner === userId) {
    await refreshOwnedCart(userId);
  } else {
    await adoptAccountCart(userId);
  }
}

// Deja de mostrar el carrito de una cuenta en este navegador. Sus cambios pendientes (si hay)
// se conservan, asociados a esa cuenta, y se enviarán cuando vuelva a iniciar sesión.
function stashCartOwner(store) {
  const owner = store.owner;
  const entry = store.users[String(owner)];
  const pending = pendingCount(entry);
  if (pending === 0) delete store.users[String(owner)];
  store.owner = null;
  writeSyncStore(store);

  writeLocalCartRaw([]);
  notifyCartUpdated();
  cartSync.status = "idle";
  clearTimeout(cartSync.retryTimer);

  if (pending > 0) {
    showCartSyncBanner(
      "info",
      `Quedaron ${pending} cambio${pending === 1 ? "" : "s"} de tu carrito sin guardar en tu cuenta. Se conservaron en este navegador y se enviarán cuando vuelvas a iniciar sesión con la misma cuenta.`
    );
  } else {
    hideCartSyncBanner();
  }
}

// Inicio de sesión (o primera carga con sesión): carrito de la cuenta + carrito de visitante.
async function adoptAccountCart(userId) {
  let store = readSyncStore();
  const stash = store.users[String(userId)];

  // 1) Cambios pendientes que esta misma cuenta dejó guardados en el navegador.
  if (pendingCount(stash) > 0) {
    const sent = Object.assign({}, stash.pending);
    const res = await apiRequest("carrito_sincronizar.php", {
      method: "POST",
      body: {
        usuario_esperado: userId,
        base: stash.snapshot || {},
        cambios: Object.keys(sent).map((code) =>
          sent[code].a === "s"
            ? { codigo: code, accion: "establecer", cantidad: sent[code].q }
            : { codigo: code, accion: "eliminar" }
        ),
      },
    });
    if (!res.ok || !res.data.carrito || res.data.usuario.id !== userId) {
      await adoptFailure(res, userId);
      return;
    }
    store = readSyncStore();
    const entry = userEntry(store, userId);
    Object.keys(sent).forEach((code) => {
      if (entry.pending[code] && entry.pending[code].n === sent[code].n) delete entry.pending[code];
    });
    entry.snapshot = mapFromServerItems(res.data.carrito.items);
    writeSyncStore(store);
    reportCartResults(res.data.resultados);
  }

  // 2) Fusionar el carrito de visitante (cantidad mayor, sin pasar del stock).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = JSON.stringify(readRawCartMap());
    const visitorItems = Object.entries(readRawCartMap()).map(([codigo, cantidad]) => ({ codigo, cantidad }));
    const res =
      visitorItems.length > 0
        ? await apiRequest("carrito_fusionar.php", { method: "POST", body: { usuario_esperado: userId, items: visitorItems } })
        : await apiRequest("carrito.php");

    if (!res.ok || !res.data.carrito || res.data.usuario.id !== userId) {
      await adoptFailure(res, userId);
      return;
    }
    if (sessionUserId() !== userId) return;
    if (JSON.stringify(readRawCartMap()) !== before) continue; // el visitante cambió su carrito durante la consulta: se repite (la fusión es idempotente)

    // 3) La copia local pasa a ser la de la cuenta.
    store = readSyncStore();
    store.owner = userId;
    const entry = userEntry(store, userId);
    entry.snapshot = mapFromServerItems(res.data.carrito.items);
    writeSyncStore(store);
    mergeApiProducts(res.data.carrito.items.map((item) => item.producto));
    setLocalViewIfChanged(res.data.carrito.items, entry.pending);
    if (visitorItems.length > 0) reportCartResults(res.data.resultados);
    markCartSynced();
    if (pendingCount(entry) > 0) scheduleCartSync(100);
    return;
  }
}

async function adoptFailure(res, userId) {
  if (res.status === 401 || res.status === 409) {
    if (typeof fetchSession === "function") await fetchSession();
    if (typeof notifySessionChanged === "function") notifySessionChanged();
    if (sessionUserId() !== userId || res.status === 401) {
      const store = readSyncStore();
      if (store.owner !== null && sessionUserId() === null) stashCartOwner(store);
    }
    return;
  }
  cartSync.status = "error";
  showCartSyncBanner(
    "error",
    "No se pudo cargar el carrito guardado en tu cuenta. Por ahora ves el carrito de este navegador; los productos que agregues se fusionarán con el de tu cuenta cuando se restablezca la conexión.",
    { retry: true }
  );
  scheduleCartRetry(res.status === 429 && res.data && res.data.espera_segundos ? Math.min(res.data.espera_segundos, 300) : 0);
}

// Carga normal con sesión: se envía lo pendiente y, si no hay nada, se actualiza desde el servidor.
async function refreshOwnedCart(userId) {
  if (totalPendingFor(userId) > 0) {
    await syncNow();
    return;
  }

  const changesBefore = cartSync.changeCount;
  const res = await apiRequest("carrito.php");
  if (!res.ok || !res.data.carrito || !res.data.usuario) {
    if (res.status === 401) {
      if (typeof fetchSession === "function") await fetchSession();
      if (typeof notifySessionChanged === "function") notifySessionChanged();
      const store = readSyncStore();
      if (sessionUserId() === null && store.owner !== null) stashCartOwner(store);
    } else {
      cartSync.status = "error";
      showCartSyncBanner(
        "error",
        "No se pudo actualizar tu carrito desde tu cuenta. Ves la copia guardada en este navegador.",
        { retry: true }
      );
      scheduleCartRetry(0);
    }
    return;
  }
  if (res.data.usuario.id !== userId || sessionUserId() !== userId) return;

  // Si hubo cambios locales (o un envío en curso) durante la consulta, esta respuesta puede ser vieja: se descarta.
  const store = readSyncStore();
  const entry = userEntry(store, userId);
  if (cartSync.changeCount !== changesBefore || cartSync.inFlight || pendingCount(entry) > 0) {
    if (pendingCount(entry) > 0) scheduleCartSync(50);
    return;
  }
  entry.snapshot = mapFromServerItems(res.data.carrito.items);
  writeSyncStore(store);
  mergeApiProducts(res.data.carrito.items.map((item) => item.producto));
  setLocalViewIfChanged(res.data.carrito.items, {});
  cartSync.lastRefresh = Date.now();
  markCartSynced();
}

/* ---------- 7.8 Enlaces con inicio y cierre de sesión (los llama js/auth.js) ---------- */

// Justo después de iniciar sesión, antes de redirigir.
async function cartOnLogin() {
  try {
    await reconcileCartOwner();
  } catch (e) {
    // el inicio de sesión nunca debe fallar por el carrito
  }
}

// Antes de cerrar sesión: se intentan enviar los cambios pendientes (máx. 6 s).
async function cartBeforeLogout() {
  const userId = sessionUserId();
  if (userId === null || readSyncStore().owner !== userId || totalPendingFor(userId) === 0) return;
  clearTimeout(cartSync.timer);
  await Promise.race([syncNow(), new Promise((resolve) => setTimeout(resolve, 6000))]);
}

// Tras cerrar sesión: se limpia la copia local; el carrito sigue guardado en MariaDB.
function cartAfterLogout() {
  const store = readSyncStore();
  if (store.owner !== null) stashCartOwner(store);
  clearTimeout(cartSync.timer);
}

/* ---------- 7.8b Fase 3.5: enlaces con la compra (los llama js/checkout.js) ---------- */

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Espera (máx. ~8 s) a que termine cualquier conciliación o envío de la Fase 3.4 que esté en curso.
async function waitForCartIdle() {
  for (let i = 0; i < 80 && (cartSync.reconciling || cartSync.inFlight); i += 1) {
    await sleepMs(100);
  }
}

// Antes de comprar: el pedido se arma con el carrito GUARDADO EN LA CUENTA, así que los cambios
// pendientes se envían primero. Devuelve { ok: true } solo si no queda ningún cambio sin guardar.
async function cartFlushForOrder() {
  const userId = sessionUserId();
  if (userId === null) return { ok: false, reason: "session" };
  try {
    await waitForCartIdle();
    if (readSyncStore().owner !== userId) {
      await reconcileCartOwner();
      await waitForCartIdle();
    }
    clearTimeout(cartSync.timer);
    if (totalPendingFor(userId) > 0) {
      await syncNow();
      await waitForCartIdle();
    }
  } catch (e) {
    return { ok: false, reason: "sync" };
  }
  if (sessionUserId() !== userId || readSyncStore().owner !== userId || totalPendingFor(userId) > 0) {
    return { ok: false, reason: "sync" };
  }
  return { ok: true, userId };
}

// Tras un rechazo del servidor (existencias, precios): se vuelve a leer el carrito y los productos de MariaDB.
async function cartRefreshFromServer() {
  try {
    cartSync.lastRefresh = 0;
    await reconcileCartOwner();
  } catch (e) {
    // sin conexión: se conserva la copia local
  }
}

// Pedido registrado: el servidor ya quitó de la cuenta SOLO lo comprado (dentro de la misma transacción).
// Aquí se deja igual la copia local y la "foto" de la Fase 3.4, sin generar cambios pendientes
// (no se envía ningún "eliminar"), para que la sincronización no lo vea como un conflicto.
function cartAfterOrder(codes) {
  const userId = sessionUserId();
  if (userId === null) return;
  const store = readSyncStore();
  if (store.owner !== userId) return;
  const bought = new Set(Array.isArray(codes) ? codes : []);
  const entry = userEntry(store, userId);
  bought.forEach((code) => {
    delete entry.snapshot[code];
    if (entry.pending[code] && entry.pending[code].a === "e") delete entry.pending[code];
  });
  writeSyncStore(store);

  cartSync.changeCount += 1; // una respuesta del servidor anterior a la compra ya no sirve
  const map = readRawCartMap();
  bought.forEach((code) => {
    if (!entry.pending[code]) delete map[code]; // un cambio posterior del usuario sí se respeta
  });
  writeLocalCartRaw(Object.keys(map).map((code) => ({ id: code, quantity: map[code] })));
  notifyCartUpdated();
}

/* ---------- 7.9 Arranque en cada página ---------- */

async function initCartSync() {
  try {
    if (typeof authReady === "undefined") return;
    await authReady;
    await catalogReady;
    await reconcileCartOwner();
  } catch (e) {
    // el carrito local sigue funcionando aunque falle la sincronización
  }
}

window.addEventListener("online", () => {
  if (cartSync.status === "error") retryCartSync();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  const userId = sessionUserId();
  if (userId === null || cartSync.inFlight || cartSync.reconciling) return;
  if (Date.now() - cartSync.lastRefresh < CART_REFRESH_MIN_INTERVAL_MS) return;
  cartSync.lastRefresh = Date.now();
  reconcileCartOwner();
});

// Otra pestaña del mismo navegador cambió el carrito: se actualiza contador y lista.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) notifyCartUpdated();
});

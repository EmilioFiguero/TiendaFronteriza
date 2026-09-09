/* =========================================================
   TIENDA FRONTERIZA — cart.js
   Fase 4: carrito de compras + LocalStorage.

   Única fuente de verdad del carrito: la clave de LocalStorage
   STORAGE_KEY. Tanto el drawer (en cualquier página), como
   carrito.html y producto.html leen y escriben a través de las
   funciones de este archivo — nadie toca LocalStorage directo.

   Depende de `products`, `formatPrice` y `capitalize`, ya
   definidos en js/app.js (que se carga antes que este archivo).
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
      products.some((p) => p.id === item.id)
  );
}

// Guarda el carrito completo y notifica a toda la interfaz (contador, drawer, carrito.html).
function saveCart(cart) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
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
});

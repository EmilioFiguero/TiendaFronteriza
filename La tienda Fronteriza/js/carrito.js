/* =========================================================
   TIENDA FRONTERIZA — carrito.js
   Fase 4: renderiza la página carrito.html.
   Toda la lógica de datos (LocalStorage, cálculos, stock)
   vive en js/cart.js; este archivo solo se encarga de pintar
   carrito.html y reaccionar a sus propios controles.
   ========================================================= */

/* ---------------------------------------------------------
   1. FILA DE PRODUCTO (versión grande, para la página completa)
--------------------------------------------------------- */

function renderCartPageItem(item) {
  const product = findProductForCartItem(item);
  if (!product) return "";

  const unitPriceLabel = formatMoney(product.price);
  const lineTotal = product.price * item.quantity;
  const max = product.stock || item.quantity;

  return `
    <article class="cart-item" data-cart-item="${product.id}">
      <a href="producto.html?id=${encodeURIComponent(product.id)}" class="cart-item-image">
        <img src="${product.image}" alt="${product.brand} ${product.name}" loading="lazy" />
      </a>

      <div class="cart-item-info">
        <span class="cart-item-brand">${product.brand}</span>
        <a href="producto.html?id=${encodeURIComponent(product.id)}" class="cart-item-name">${product.name}</a>
        <span class="cart-item-unit-price">${unitPriceLabel} c/u</span>
      </div>

      <div class="cart-item-qty">
        <span class="quantity-label">Cantidad</span>
        <div class="quantity-control">
          <button type="button" class="qty-btn" data-cart-qty-minus="${product.id}" aria-label="Disminuir cantidad">−</button>
          <span class="cart-item-qty-value">${item.quantity}</span>
          <button type="button" class="qty-btn" data-cart-qty-plus="${product.id}" aria-label="Aumentar cantidad" ${item.quantity >= max ? "disabled" : ""}>+</button>
        </div>
      </div>

      <div class="cart-item-subtotal">
        <span class="quantity-label">Subtotal</span>
        <strong>${formatMoney(lineTotal)}</strong>
      </div>

      <button type="button" class="cart-item-remove" data-cart-remove="${product.id}" aria-label="Eliminar ${product.name} del carrito">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/>
        </svg>
        <span>Eliminar</span>
      </button>
    </article>
  `;
}

/* ---------------------------------------------------------
   2. RESUMEN DE COMPRA
--------------------------------------------------------- */

function renderCartSummary(cart) {
  const subtotal = calculateSubtotal(cart);
  const tax = calculateTax(subtotal);
  const shipping = calculateShipping(cart);
  const total = subtotal + tax + shipping;

  return `
    <aside class="cart-summary">
      <h2>Resumen de compra</h2>
      <div class="cart-summary-row">
        <span>Subtotal</span>
        <span>${formatMoney(subtotal)}</span>
      </div>
      <div class="cart-summary-row">
        <span>Impuestos (${Math.round(TAX_RATE * 100)}%)</span>
        <span>${formatMoney(tax)}</span>
      </div>
      <div class="cart-summary-row">
        <span>Envío</span>
        <span>${formatMoney(shipping)}</span>
      </div>
      <div class="cart-summary-row cart-summary-total">
        <span>Total</span>
        <span>${formatMoney(total)}</span>
      </div>

      <button type="button" class="btn btn--primary btn--full" id="checkoutBtn">Proceder al checkout</button>
      <a href="index.html" class="btn btn--clear btn--full">Seguir comprando</a>
    </aside>
  `;
}

/* ---------------------------------------------------------
   3. ESTADO VACÍO
--------------------------------------------------------- */

function renderCartEmptyState() {
  return `
    <div class="cart-empty-state">
      <h1>Tu carrito está vacío</h1>
      <p>Explora el catálogo y encuentra tu próximo favorito.</p>
      <a href="index.html" class="btn btn--primary">Seguir comprando</a>
    </div>
  `;
}

/* ---------------------------------------------------------
   4. RENDERIZADO PRINCIPAL DE LA PÁGINA
--------------------------------------------------------- */

function renderCartPage() {
  const container = document.getElementById("cartPageContent");
  if (!container) return;

  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = renderCartEmptyState();
    return;
  }

  container.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items-list">
        ${cart.map(renderCartPageItem).join("")}
      </div>
      ${renderCartSummary(cart)}
    </div>
  `;

  const checkoutBtn = document.getElementById("checkoutBtn");
  checkoutBtn?.addEventListener("click", () => {
    // FASE 7: checkout.html ya existe y tiene su propia protección de sesión
    // (ver js/checkout.js), pero validamos aquí también para no navegar
    // innecesariamente si no hay sesión.
    if (typeof protectPage === "function" && !protectPage("carrito.html")) return;
    window.location.href = "checkout.html";
  });
}

/* ---------------------------------------------------------
   5. CONTROLES DE CANTIDAD / ELIMINAR (delegación de eventos)
--------------------------------------------------------- */

function setupCartPageControls() {
  const container = document.getElementById("cartPageContent");
  if (!container) return;

  container.addEventListener("click", (e) => {
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
   6. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  renderCartPage();
  setupCartPageControls();

  // Cuando el drawer (u otra pestaña/acción) modifica el carrito,
  // esta página se vuelve a pintar con los datos actuales.
  document.addEventListener("tiendaFronteriza:cartUpdated", renderCartPage);
});

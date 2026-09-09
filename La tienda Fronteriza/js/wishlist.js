/* =========================================================
   TIENDA FRONTERIZA — wishlist.js
   Fase 5: wishlist / favoritos + control de stock.

   Única fuente de verdad de favoritos: la clave de LocalStorage
   WISHLIST_STORAGE_KEY. Todos los botones ❤️ (Homepage, Catálogo,
   Product Detail) y la página favoritos.html pasan por las
   funciones de este archivo — nadie toca LocalStorage directo.

   Depende de `products`, `formatPrice`, `capitalize` e
   `isProductAvailable` (js/app.js) y de `addToCart`, `showToast`
   (js/cart.js), todos cargados antes que este archivo.

   El control de stock del carrito (límites de cantidad, botones
   +/- deshabilitados, "AGOTADO") ya vive en js/app.js y js/cart.js
   desde la Fase 4 y se reutiliza aquí sin duplicarlo.
   ========================================================= */

const WISHLIST_STORAGE_KEY = "tiendaFronteriza_wishlist";

/* ---------------------------------------------------------
   1. LECTURA / ESCRITURA DE FAVORITOS (LocalStorage)
   Solo se guardan IDs de producto, nunca objetos completos.
--------------------------------------------------------- */

function getWishlist() {
  let raw;
  try {
    raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
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

  // Filtra IDs inválidos o que ya no correspondan a un producto real.
  return parsed.filter((id) => typeof id === "string" && products.some((p) => p.id === id));
}

function saveWishlist(list) {
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
  updateWishlistCount();
}

/* ---------------------------------------------------------
   2. OPERACIONES DE FAVORITOS
--------------------------------------------------------- */

function isFavorite(productId) {
  return getWishlist().includes(productId);
}

function addToWishlist(productId) {
  const list = getWishlist();
  if (!list.includes(productId)) {
    list.push(productId);
    saveWishlist(list);
  }
}

function removeFromWishlist(productId) {
  const list = getWishlist().filter((id) => id !== productId);
  saveWishlist(list);
}

// Agrega o quita según el estado actual. Devuelve true si quedó
// como favorito, false si se quitó.
function toggleWishlist(productId) {
  if (isFavorite(productId)) {
    removeFromWishlist(productId);
    return false;
  }
  addToWishlist(productId);
  return true;
}

/* ---------------------------------------------------------
   3. CONTADOR DEL ENCABEZADO
   Cuenta productos favoritos únicos, no unidades.
--------------------------------------------------------- */

function updateWishlistCount() {
  const el = document.getElementById("wishlistCount");
  if (!el) return;
  el.textContent = String(getWishlist().length);
}

/* ---------------------------------------------------------
   4. BOTONES ❤️ (Homepage, Catálogo, Product Detail, Quick View)
   Delegación de eventos: funciona con cualquier botón .fav-btn
   con data-fav, sin importar cuándo se inserte en el DOM ni en
   qué página esté.
--------------------------------------------------------- */

function setupFavButtons() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".fav-btn[data-fav]");
    if (!btn) return;

    const productId = btn.dataset.fav;
    const active = toggleWishlist(productId);

    // Actualiza este botón de inmediato. Si el mismo producto tiene
    // otro botón ❤️ visible en la página, también se sincroniza.
    document.querySelectorAll(`.fav-btn[data-fav="${CSS.escape(productId)}"]`).forEach((el) => {
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-label", active ? "Quitar de favoritos" : "Agregar a favoritos");
      const label = el.querySelector(".fav-btn-label");
      if (label) label.textContent = active ? "En favoritos" : "Agregar a favoritos";
    });

    showToast(active ? "Producto agregado a favoritos." : "Producto eliminado de favoritos.");
  });
}

/* ---------------------------------------------------------
   5. PÁGINA FAVORITOS (favoritos.html)
--------------------------------------------------------- */

function renderWishlistCard(product) {
  const priceLabel = formatPrice(product.price);
  const oldPriceLabel = formatPrice(product.oldPrice);
  const hasDiscount = product.discount && product.discount > 0;
  const detailUrl = `producto.html?id=${encodeURIComponent(product.id)}`;
  const available = isProductAvailable(product);

  return `
    <article class="product-card wishlist-card" data-id="${product.id}">
      <div class="product-media">
        <a href="${detailUrl}" class="product-media-link" aria-label="Ver detalle de ${product.brand} ${product.name}">
          <img src="${product.image}" alt="${product.brand} ${product.name}" loading="lazy" />
        </a>
        ${
          hasDiscount
            ? `<span class="product-badge ${product.isDemo ? "product-badge--demo" : ""}">
                 ${product.isDemo ? "Demo −" : "Oferta −"}${product.discount}%
               </span>`
            : product.isDemo
            ? `<span class="product-badge product-badge--demo">Demo</span>`
            : ""
        }
      </div>
      <div class="product-body">
        <span class="product-brand">${product.brand}</span>
        <h3 class="product-name"><a href="${detailUrl}" class="product-name-link">${product.name}</a></h3>
        <span class="product-category">${capitalize(product.category)}</span>
        <div class="product-price-row">
          ${
            priceLabel
              ? `<span class="product-price">${priceLabel}</span>`
              : `<span class="product-price product-price--tbd">Precio próximamente</span>`
          }
          ${oldPriceLabel ? `<span class="product-price-old">${oldPriceLabel}</span>` : ""}
        </div>
        <span class="stock-badge ${available ? "stock-badge--available" : "stock-badge--unavailable"}">
          ${available ? `Disponible (${product.stock} en existencia)` : "Agotado"}
        </span>
        <div class="wishlist-card-actions">
          <button class="add-cart-btn" data-add="${product.id}" ${available ? "" : "disabled"}>
            ${available ? "Agregar al carrito" : "Agotado"}
          </button>
          <a href="${detailUrl}" class="btn btn--clear btn--small wishlist-view-btn">Ver producto</a>
          <button type="button" class="wishlist-remove-btn" data-wishlist-remove="${product.id}">
            Eliminar de favoritos
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderWishlistEmptyState() {
  return `
    <h1>NO TIENES FAVORITOS</h1>
    <p>Guarda los productos que te interesen para encontrarlos fácilmente.</p>
    <a href="index.html" class="btn btn--primary">EXPLORAR PRODUCTOS</a>
  `;
}

function renderWishlistPage() {
  const grid = document.getElementById("wishlistGrid");
  const emptyState = document.getElementById("wishlistEmpty");
  if (!grid || !emptyState) return; // esta página no incluye la grilla de favoritos

  const ids = getWishlist();
  const items = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean);

  if (items.length === 0) {
    grid.hidden = true;
    grid.innerHTML = "";
    emptyState.innerHTML = renderWishlistEmptyState();
    emptyState.hidden = false;
    return;
  }

  grid.hidden = false;
  emptyState.hidden = true;
  grid.innerHTML = items.map(renderWishlistCard).join("");
}

// Delegación de eventos para "Eliminar de favoritos" dentro de favoritos.html.
// "Agregar al carrito" reutiliza el listener global de js/cart.js
// (setupCatalogAddToCartButtons), ya que las tarjetas usan .add-cart-btn[data-add].
function setupWishlistPageControls() {
  const grid = document.getElementById("wishlistGrid");
  if (!grid) return;

  grid.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-wishlist-remove]");
    if (!removeBtn) return;

    removeFromWishlist(removeBtn.dataset.wishlistRemove);
    showToast("Producto eliminado de favoritos.");
    renderWishlistPage();
  });
}

/* ---------------------------------------------------------
   6. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  updateWishlistCount();
  setupFavButtons();
  renderWishlistPage();
  setupWishlistPageControls();
});

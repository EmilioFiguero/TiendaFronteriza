/* =========================================================
   TIENDA FRONTERIZA — producto.js
   Fase 3: página de detalle de producto.
   Fase 4: el botón "Agregar al carrito" y el selector de
   cantidad ahora usan addToCart()/isProductAvailable() de
   js/cart.js y js/app.js (ambos cargados antes que este
   archivo). No se duplica la lógica del carrito aquí.
   Reutiliza `products`, `categories`, `formatPrice` y
   `capitalize`, definidos en js/app.js. No se duplican datos
   ni funciones.
   ========================================================= */

/* ---------------------------------------------------------
   1. LECTURA DEL PRODUCTO DESDE LA URL
   Ejemplo: producto.html?id=p1
--------------------------------------------------------- */

function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function findProductById(id) {
  return products.find((p) => p.id === id) || null;
}

/* ---------------------------------------------------------
   2. MIGAS DE NAVEGACIÓN
   Inicio > Categoría > Nombre del producto
--------------------------------------------------------- */

function renderBreadcrumbs(product) {
  const list = document.getElementById("breadcrumbList");
  if (!list) return;

  const category = categories.find((c) => c.id === product.category);
  const categoryLabel = category ? category.name : capitalize(product.category);

  list.innerHTML = `
    <li><a href="index.html">Inicio</a></li>
    <li aria-hidden="true">›</li>
    <li><a href="index.html#catalogo">${categoryLabel}</a></li>
    <li aria-hidden="true">›</li>
    <li aria-current="page">${product.brand} ${product.name}</li>
  `;
}

/* ---------------------------------------------------------
   3. GALERÍA
   Si el producto no define "gallery", se usa su única imagen.
   La estructura queda lista para más fotografías a futuro.
--------------------------------------------------------- */

function getProductGallery(product) {
  if (Array.isArray(product.gallery) && product.gallery.length > 0) {
    return product.gallery;
  }
  return [product.image];
}

function renderGallery(product) {
  const images = getProductGallery(product);
  const altText = `${product.brand} ${product.name}`;

  const thumbs = images
    .map(
      (src, index) => `
        <button type="button" class="gallery-thumb ${index === 0 ? "is-active" : ""}" data-image="${src}" aria-label="Ver foto ${index + 1} de ${altText}">
          <img src="${src}" alt="" loading="lazy" />
        </button>
      `
    )
    .join("");

  return `
    <div class="product-gallery">
      <div class="gallery-main">
        <img src="${images[0]}" alt="${altText}" id="galleryMainImage" />
      </div>
      ${
        images.length > 0
          ? `<div class="gallery-thumbs" id="galleryThumbs">${thumbs}</div>`
          : ""
      }
    </div>
  `;
}

function setupGallery() {
  const thumbs = document.querySelectorAll(".gallery-thumb");
  const mainImage = document.getElementById("galleryMainImage");
  if (!thumbs.length || !mainImage) return;

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      mainImage.src = thumb.dataset.image;
      thumbs.forEach((t) => t.classList.remove("is-active"));
      thumb.classList.add("is-active");
    });
  });
}

/* ---------------------------------------------------------
   4. INFORMACIÓN, CANTIDAD, VARIANTES Y BOTÓN PRINCIPAL
--------------------------------------------------------- */

function renderStockLabel(product) {
  if (isProductAvailable(product)) {
    return `<span class="stock-badge stock-badge--available">Disponible (${product.stock} en existencia)</span>`;
  }
  return `<span class="stock-badge stock-badge--unavailable">Agotado</span>`;
}

// FASE 5: botón de favoritos del Product Detail. Usa la misma lógica
// centralizada (data-fav + delegación de eventos) que Homepage/Catálogo,
// definida en js/wishlist.js.
function renderFavButton(product) {
  const active = typeof isFavorite === "function" && isFavorite(product.id);
  return `
    <button type="button" class="fav-btn fav-btn--inline ${active ? "is-active" : ""}" data-fav="${product.id}" aria-label="${active ? "Quitar de favoritos" : "Agregar a favoritos"}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
      </svg>
      <span class="fav-btn-label">${active ? "En favoritos" : "Agregar a favoritos"}</span>
    </button>
  `;
}

// Estructura preparada para talla/color. Si el producto no trae "variants"
// definidas en app.js, no se inventa nada: simplemente no se muestra nada aquí.
function renderVariants(product) {
  if (!product.variants) return "";

  const groups = Object.entries(product.variants)
    .map(([groupName, options]) => {
      const optionButtons = options
        .map((option) => `<button type="button" class="variant-option" data-variant-group="${groupName}">${option}</button>`)
        .join("");
      return `
        <div class="variant-group">
          <span class="variant-group-label">${capitalize(groupName)}</span>
          <div class="variant-options">${optionButtons}</div>
        </div>
      `;
    })
    .join("");

  return `<div class="product-variants">${groups}</div>`;
}

function renderInfoColumn(product) {
  const priceLabel = formatPrice(product.price);
  const oldPriceLabel = formatPrice(product.oldPrice);
  const hasDiscount = product.discount && product.discount > 0;
  const category = categories.find((c) => c.id === product.category);
  const categoryLabel = category ? category.name : capitalize(product.category);

  return `
    <div class="product-info">
      <span class="product-brand product-brand--lg">${product.brand}</span>
      <h1 class="product-detail-name">${product.name}</h1>
      <span class="product-category">${categoryLabel}</span>

      <div class="product-price-row product-price-row--lg">
        ${
          priceLabel
            ? `<span class="product-price">${priceLabel}</span>`
            : `<span class="product-price product-price--tbd">Precio próximamente</span>`
        }
        ${oldPriceLabel ? `<span class="product-price-old">${oldPriceLabel}</span>` : ""}
        ${hasDiscount ? `<span class="product-badge">−${product.discount}%</span>` : ""}
      </div>

      <div class="product-stock">${renderStockLabel(product)}</div>

      ${renderVariants(product)}

      <div class="quantity-selector">
        <span class="quantity-label">Cantidad</span>
        <div class="quantity-control">
          <button type="button" class="qty-btn" id="qtyMinus" aria-label="Disminuir cantidad">−</button>
          <input type="number" id="qtyInput" value="1" min="1" step="1" inputmode="numeric" aria-label="Cantidad" />
          <button type="button" class="qty-btn" id="qtyPlus" aria-label="Aumentar cantidad">+</button>
        </div>
      </div>

      <button type="button" class="btn btn--primary btn--add-to-cart" id="addToCartBtn" ${isProductAvailable(product) ? "" : "disabled"}>
        ${isProductAvailable(product) ? "Agregar al carrito" : "Agotado"}
      </button>
      <p class="add-to-cart-note" id="addToCartNote" hidden></p>

      ${renderFavButton(product)}

      <a href="index.html" class="back-link">← Seguir comprando</a>
    </div>
  `;
}

/* ---------------------------------------------------------
   5. DESCRIPCIÓN Y ESPECIFICACIONES
   Solo se muestra información que ya existe en los datos del
   producto. La tabla de especificaciones queda preparada para
   agregar más filas cuando haya datos, sin inventarlos ahora.
--------------------------------------------------------- */

function renderDescriptionAndSpecs(product) {
  const category = categories.find((c) => c.id === product.category);
  const categoryLabel = category ? category.name : capitalize(product.category);

  return `
    <div class="product-extra">
      <div class="product-description">
        <h2>Descripción</h2>
        <p>${product.description}</p>
      </div>

      <div class="product-specs">
        <h2>Especificaciones</h2>
        <table class="specs-table">
          <tbody>
            <tr><th>Marca</th><td>${product.brand}</td></tr>
            <tr><th>Nombre / modelo</th><td>${product.name}</td></tr>
            <tr><th>Categoría</th><td>${categoryLabel}</td></tr>
          </tbody>
        </table>
        <p class="specs-note">Más especificaciones técnicas se agregarán próximamente.</p>
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------
   6. SELECTOR DE CANTIDAD
   FASE 4: la cantidad nunca puede superar el stock disponible.
--------------------------------------------------------- */

function setupQuantitySelector(product) {
  const qtyInput = document.getElementById("qtyInput");
  const qtyMinus = document.getElementById("qtyMinus");
  const qtyPlus = document.getElementById("qtyPlus");
  if (!qtyInput || !qtyMinus || !qtyPlus) return;

  const max = isProductAvailable(product) ? product.stock : 1;
  qtyInput.setAttribute("max", String(max));

  function clampQuantity() {
    let value = parseInt(qtyInput.value, 10);
    if (!value || value < 1) value = 1;
    if (value > max) value = max;
    qtyInput.value = value;
  }

  qtyMinus.addEventListener("click", () => {
    clampQuantity();
    qtyInput.value = Math.max(1, parseInt(qtyInput.value, 10) - 1);
  });

  qtyPlus.addEventListener("click", () => {
    clampQuantity();
    qtyInput.value = Math.min(max, parseInt(qtyInput.value, 10) + 1);
  });

  qtyInput.addEventListener("change", clampQuantity);

  if (!isProductAvailable(product)) {
    qtyInput.disabled = true;
    qtyMinus.disabled = true;
    qtyPlus.disabled = true;
  }
}

/* ---------------------------------------------------------
   7. BOTÓN "AGREGAR AL CARRITO"
   FASE 4: conectado a addToCart() de js/cart.js. Agrega la
   cantidad seleccionada y muestra una confirmación visual sin
   salir de producto.html.
--------------------------------------------------------- */

function setupAddToCart(product) {
  const addToCartBtn = document.getElementById("addToCartBtn");
  const note = document.getElementById("addToCartNote");
  const qtyInput = document.getElementById("qtyInput");
  if (!addToCartBtn || !note) return;

  addToCartBtn.addEventListener("click", () => {
    const quantity = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
    const result = addToCart(product.id, quantity);

    let message;
    if (!result.success) {
      message =
        result.reason === "out-of-stock"
          ? "Este producto está agotado."
          : "No se pudo agregar el producto al carrito.";
    } else if (result.clamped) {
      message = `Solo se agregaron ${result.quantity} unidades disponibles en stock.`;
    } else {
      message = "Producto agregado al carrito.";
    }

    note.textContent = message;
    note.hidden = false;
    note.classList.remove("is-visible");
    // Reinicia la animación aunque se haga clic varias veces seguidas.
    void note.offsetWidth;
    note.classList.add("is-visible");
  });
}

/* ---------------------------------------------------------
   8. RENDERIZADO PRINCIPAL Y MANEJO DE "NO ENCONTRADO"
--------------------------------------------------------- */

function renderProductDetail(product) {
  document.title = `${product.brand} ${product.name} — Tienda Fronteriza`;

  const container = document.getElementById("productDetail");
  if (!container) return;

  container.innerHTML = `
    <div class="product-detail-grid">
      ${renderGallery(product)}
      ${renderInfoColumn(product)}
    </div>
    ${renderDescriptionAndSpecs(product)}
  `;

  renderBreadcrumbs(product);
  setupGallery();
  setupQuantitySelector(product);
  setupAddToCart(product);
}

function showNotFound() {
  document.title = "Producto no encontrado — Tienda Fronteriza";

  const detail = document.getElementById("productDetail");
  const notFound = document.getElementById("productNotFound");
  const breadcrumbs = document.getElementById("breadcrumbs");

  if (detail) detail.hidden = true;
  if (breadcrumbs) breadcrumbs.hidden = true;
  if (notFound) notFound.hidden = false;
}

/* ---------------------------------------------------------
   9. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const id = getProductIdFromUrl();
  const product = id ? findProductById(id) : null;

  if (!product) {
    showNotFound();
    return;
  }

  renderProductDetail(product);
});

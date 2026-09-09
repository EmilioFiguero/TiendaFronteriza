/* =========================================================
   TIENDA FRONTERIZA — app.js
   Fase 1: solo lógica de presentación (sin carrito funcional,
   sin LocalStorage, sin backend). Los datos de abajo son
   fáciles de editar: productos, precios, imágenes y categorías.
   ========================================================= */

/* ---------------------------------------------------------
   1. CATEGORÍAS
   Edita nombre, descripción o imagen aquí.
   Coloca las imágenes en: assets/images/categories/
--------------------------------------------------------- */
const categories = [
  {
    id: "chamarras",
    name: "Chamarras",
    description: "Protección y estilo para cualquier aventura.",
    image: "assets/images/categories/chamarras.jpg",
  },
  {
    id: "mochilas",
    name: "Mochilas",
    description: "Todo lo que necesitas, donde lo necesitas.",
    image: "assets/images/categories/mochilas.jpg",
  },
  {
    id: "ropa",
    name: "Ropa",
    description: "Prendas versátiles para el día a día.",
    image: "assets/images/categories/ropa.jpg",
  },
  {
    id: "calzado",
    name: "Calzado",
    description: "Comodidad y estilo en cada paso.",
    image: "assets/images/categories/calzado.jpg",
  },
  {
    id: "outdoor",
    name: "Outdoor",
    description: "Equipo listo para salir a explorar.",
    image: "assets/images/categories/outdoor.jpg",
  },
  {
    id: "accesorios",
    name: "Accesorios",
    description: "Los detalles que completan tu estilo.",
    image: "assets/images/categories/accesorios.jpg",
  },
  {
    id: "ofertas",
    name: "Ofertas",
    description: "Precios especiales por tiempo limitado.",
    image: "assets/images/categories/ofertas.jpg",
  },
];

/* ---------------------------------------------------------
   2. PRODUCTOS
   Los primeros 3 son los destacados de la página principal.
   Los siguientes 3 ("p4","p5","p6") son los productos que se
   muestran en la sección "En oferta".
--------------------------------------------------------- */
const products = [
  // ---- PRODUCTOS REALES ----
  // Nota (Fase 3): se agregan los campos opcionales "gallery" y "variants".
  // Si "gallery" no se define, producto.js usa [product.image] automáticamente.
  // "variants" queda en null a propósito: no hay tallas/colores definidos
  // todavía, así que no se inventan. Cuando existan, basta con darle forma:
  // variants: { talla: ["S","M","L"], color: ["Negro","Azul"] }
  {
    id: "p1",
    name: "Denali Jacket",
    brand: "The North Face",
    category: "chamarras",
    price: 400,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/denali-jacket.jpg",
    gallery: null, // EDITAR: agregar más fotos aquí cuando existan, ej. ["a.jpg","b.jpg"]
    variants: null, // EDITAR: agregar variantes de talla/color cuando estén definidas
    description:
      "Chamarra polar negra con cuello alto, cierre frontal completo, panel superior de material tejido y logo The North Face en el pecho.",
    stock: 3, // EDITAR: existencias (chamarras: 3 en stock)
    isDemo: false,
  },
  {
    id: "p2",
    name: "Youth Happy Camper Backpack",
    brand: "The North Face",
    category: "mochilas",
    price: 700,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/happy-camper.jpg",
    gallery: null,
    variants: null,
    description:
      "Mochila juvenil azul con detalles rojos, capacidad aproximada de 16 L, cordón elástico frontal, bolsillos laterales de malla y construcción de poliéster.",
    stock: 1, // EDITAR: existencias (mochilas: 1 en stock)
    isDemo: false,
  },
  {
    id: "p3",
    name: "Mochila North Face Original Vault",
    brand: "The North Face",
    category: "mochilas",
    price: 700,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/vault-black.jpg",
    gallery: null,
    variants: null,
    description:
      "Mochila negra de 27 L con funda acolchada para laptop de hasta 15\", sistema de suspensión FlexVent, bolsillos laterales para botellas y acabado repelente al agua.",
    stock: 1, // EDITAR: existencias (mochilas: 1 en stock)
    isDemo: false,
  },

  // ---- PRODUCTOS EN OFERTA ----
  {
    id: "p4",
    name: "Playera Manga Larga",
    brand: "Carhartt",
    category: "ropa",
    price: 300,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/carhartt-playera.jpg",
    gallery: null,
    variants: null,
    description:
      "Playera negra de manga larga con logo Carhartt bordado en el pecho y logo grande impreso en la manga derecha.",
    stock: 1, // EDITAR: existencias
    isDemo: false,
  },
  {
    id: "p5",
    name: "Better Sweater Chamarra",
    brand: "Patagonia",
    category: "chamarras",
    price: 400,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/patagonia-chamarra.jpg",
    gallery: null,
    variants: null,
    description:
      "Chamarra gris con cierre completo, cuello alto, bolsillo con cierre en el pecho y dos bolsillos laterales con cierre. Etiqueta Patagonia en el pecho.",
    stock: 1, // EDITAR: existencias
    isDemo: false,
  },
  {
    id: "p6",
    name: "Mochila Brasilia",
    brand: "Nike",
    category: "mochilas",
    price: 550,
    oldPrice: null,
    discount: 0,
    image: "assets/images/products/nike-mochila.jpg",
    gallery: null,
    variants: null,
    description:
      "Mochila negra con panel frontal verde olivo, bolsillos laterales de malla, correas ajustables y logo Nike en el panel principal.",
    stock: 1, // EDITAR: existencias
    isDemo: false,
  },
];

/* ---------------------------------------------------------
   3. UTILIDADES
--------------------------------------------------------- */

// Formatea un precio en pesos mexicanos, o "Próximamente" si aún no está definido (price 0).
function formatPrice(value) {
  if (!value || value <= 0) return null;
  return value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// Crea el markup de una tarjeta de categoría.
// NOTA (Fase 2): el enlace ahora apunta a #catalogo (antes #productos) y,
// al hacer clic, la categoría se aplica automáticamente como filtro
// del catálogo (ver setupCategoryCardLinks más abajo).
function renderCategoryCard(category) {
  return `
    <a href="#catalogo" class="category-card reveal" data-category="${category.id}">
      <img src="${category.image}" alt="${category.name}" loading="lazy" />
      <div class="category-card-body">
        <h3>${category.name}</h3>
        <p>${category.description}</p>
      </div>
    </a>
  `;
}

// Crea el markup de una tarjeta de producto.
// FASE 3: la imagen, el nombre y "Vista rápida" enlazan a producto.html?id=...
function renderProductCard(product) {
  const priceLabel = formatPrice(product.price);
  const oldPriceLabel = formatPrice(product.oldPrice);
  const hasDiscount = product.discount && product.discount > 0;
  const detailUrl = `producto.html?id=${encodeURIComponent(product.id)}`;
  // FASE 5: isFavorite() vive en js/wishlist.js, cargado antes que este script.
  const favActive = typeof isFavorite === "function" && isFavorite(product.id);

  return `
    <article class="product-card reveal" data-id="${product.id}">
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
        <button class="fav-btn ${favActive ? "is-active" : ""}" aria-label="${favActive ? "Quitar de favoritos" : "Agregar a favoritos"}" data-fav="${product.id}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
          </svg>
        </button>
        <a href="${detailUrl}" class="quickview-btn" data-quickview="${product.id}">Vista rápida</a>
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
        <button class="add-cart-btn" data-add="${product.id}" ${isProductAvailable(product) ? "" : "disabled"}>
          ${isProductAvailable(product) ? "Agregar al carrito" : "Agotado"}
        </button>
      </div>
    </article>
  `;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// FASE 4: un producto solo se puede agregar al carrito si tiene existencias.
function isProductAvailable(product) {
  return typeof product.stock === "number" && product.stock > 0;
}

/* ---------------------------------------------------------
   4. RENDERIZADO DE SECCIONES
--------------------------------------------------------- */

function renderCategories() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;
  grid.innerHTML = categories.map(renderCategoryCard).join("");
}

function renderFeaturedProducts() {
  const grid = document.getElementById("featuredGrid");
  if (!grid) return;
  // Los 3 productos originales son los destacados principales.
  const featured = products.filter((p) => ["p1", "p2", "p3"].includes(p.id));
  grid.innerHTML = featured.map(renderProductCard).join("");
}

function renderOffers() {
  const grid = document.getElementById("offersGrid");
  if (!grid) return;
  // Los 3 productos en oferta se muestran por id explícito.
  const offers = products.filter((p) => ["p4", "p5", "p6"].includes(p.id));
  grid.innerHTML = offers.map(renderProductCard).join("");
}

/* ---------------------------------------------------------
   4b. FASE 2 — CATÁLOGO: búsqueda, filtros, orden y resultados
   Reutiliza products, categories, renderProductCard y
   formatPrice de la Fase 1. No se crea un sistema de
   renderizado distinto.
--------------------------------------------------------- */

// Estado actual de búsqueda/filtros/orden. Única fuente de verdad del catálogo.
const catalogState = {
  search: "",
  category: "all",
  priceMin: null,
  priceMax: null,
  sort: "relevance",
};

// Normaliza texto para comparar sin distinguir mayúsculas/minúsculas ni acentos.
function normalizeText(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Un producto coincide con el término de búsqueda si aparece en nombre, marca o categoría.
function productMatchesSearch(product, query) {
  if (!query) return true;
  const q = normalizeText(query);
  const haystack = normalizeText(`${product.brand} ${product.name} ${product.category}`);
  return haystack.includes(q);
}

// Aplica búsqueda + categoría + precio mínimo/máximo sobre el arreglo completo de productos.
function getFilteredProducts() {
  return products.filter((product) => {
    if (!productMatchesSearch(product, catalogState.search)) return false;

    if (catalogState.category !== "all" && product.category !== catalogState.category) {
      return false;
    }

    if (catalogState.priceMin !== null && product.price < catalogState.priceMin) {
      return false;
    }

    if (catalogState.priceMax !== null && product.price > catalogState.priceMax) {
      return false;
    }

    return true;
  });
}

// Ordena una lista de productos según catalogState.sort. "relevance" conserva el orden original.
function sortProducts(list) {
  const sorted = list.slice();

  switch (catalogState.sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "name-asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, "es"));
    case "name-desc":
      return sorted.sort((a, b) => b.name.localeCompare(a.name, "es"));
    case "relevance":
    default:
      return sorted;
  }
}

// Vuelve a calcular y pintar el catálogo completo según el estado actual.
function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  const emptyState = document.getElementById("catalogEmpty");
  const resultsCount = document.getElementById("catalogResultsCount");
  if (!grid || !emptyState || !resultsCount) return;

  const results = sortProducts(getFilteredProducts());

  if (results.length === 0) {
    grid.innerHTML = "";
    grid.hidden = true;
    emptyState.hidden = false;
    resultsCount.textContent = "NO ENCONTRAMOS PRODUCTOS";
    return;
  }

  grid.hidden = false;
  emptyState.hidden = true;
  grid.innerHTML = results.map(renderProductCard).join("");
  // Los resultados del catálogo se actualizan al instante: se muestran
  // visibles de inmediato en lugar de esperar la animación de scroll.
  grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));

  const countLabel = `Mostrando ${results.length} producto${results.length === 1 ? "" : "s"}`;
  resultsCount.textContent = catalogState.search
    ? `${countLabel} para "${catalogState.search}"`
    : countLabel;
}

// Llena el <select> de categorías del catálogo con el arreglo `categories` existente.
function populateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;
  const options = categories
    .filter((c) => c.id !== "ofertas") // "ofertas" no es una categoría de producto real
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  select.insertAdjacentHTML("beforeend", options);
}

// Restablece filtros, orden y búsqueda a sus valores por defecto.
function clearCatalogFilters() {
  catalogState.search = "";
  catalogState.category = "all";
  catalogState.priceMin = null;
  catalogState.priceMax = null;
  catalogState.sort = "relevance";

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceMinFilter = document.getElementById("priceMinFilter");
  const priceMaxFilter = document.getElementById("priceMaxFilter");
  const sortFilter = document.getElementById("sortFilter");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "all";
  if (priceMinFilter) priceMinFilter.value = "";
  if (priceMaxFilter) priceMaxFilter.value = "";
  if (sortFilter) sortFilter.value = "relevance";

  renderCatalog();
}

// Genera hasta 5 sugerencias predictivas a partir de categorías y productos.
function getSearchSuggestions(query) {
  const q = normalizeText(query);
  if (!q) return [];

  const suggestions = [];

  categories.forEach((category) => {
    if (normalizeText(category.name).includes(q)) {
      suggestions.push({ type: "Categoría", label: category.name, categoryId: category.id });
    }
  });

  products.forEach((product) => {
    const label = `${product.brand} ${product.name}`;
    if (normalizeText(label).includes(q)) {
      suggestions.push({ type: "Producto", label, productId: product.id });
    }
  });

  return suggestions.slice(0, 5);
}

function renderSearchSuggestions(suggestions) {
  const list = document.getElementById("searchSuggestions");
  if (!list) return;

  if (suggestions.length === 0) {
    list.innerHTML = "";
    list.hidden = true;
    return;
  }

  list.innerHTML = suggestions
    .map(
      (s, index) => `
        <li class="search-suggestion" role="option" tabindex="0" data-suggestion-index="${index}">
          <span class="search-suggestion-type">${s.type}</span>
          <span>${s.label}</span>
        </li>
      `
    )
    .join("");
  list.hidden = false;

  // Guarda las sugerencias actuales para poder leerlas al hacer clic/Enter.
  list.dataset.suggestions = JSON.stringify(suggestions);
}

// Aplica un término de búsqueda al catálogo, re-renderiza y desplaza la vista hasta él.
function applySearch(term) {
  catalogState.search = term.trim();
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = catalogState.search;
  renderCatalog();

  const catalogSection = document.getElementById("catalogo");
  if (catalogSection && term.trim()) {
    catalogSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setupCatalogFilters() {
  const searchBar = document.getElementById("searchBar");
  const searchInput = document.getElementById("searchInput");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceMinFilter = document.getElementById("priceMinFilter");
  const priceMaxFilter = document.getElementById("priceMaxFilter");
  const sortFilter = document.getElementById("sortFilter");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const clearFiltersBtnEmpty = document.getElementById("clearFiltersBtnEmpty");

  populateCategoryFilter();

  // --- Búsqueda predictiva (debounced) ---
  let debounceTimer = null;
  searchInput?.addEventListener("input", (e) => {
    const value = e.target.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      catalogState.search = value.trim();
      renderCatalog();
      renderSearchSuggestions(value.trim() ? getSearchSuggestions(value) : []);
    }, 200);
  });

  // Enviar el formulario de búsqueda aplica el término y cierra las sugerencias.
  searchBar?.addEventListener("submit", (e) => {
    e.preventDefault();
    applySearch(searchInput ? searchInput.value : "");
    renderSearchSuggestions([]);
  });

  // Selección de una sugerencia con clic o teclado.
  searchSuggestions?.addEventListener("click", (e) => {
    const item = e.target.closest(".search-suggestion");
    if (!item) return;
    selectSuggestion(item);
  });

  searchSuggestions?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const item = e.target.closest(".search-suggestion");
    if (!item) return;
    selectSuggestion(item);
  });

  function selectSuggestion(item) {
    const suggestions = JSON.parse(searchSuggestions.dataset.suggestions || "[]");
    const suggestion = suggestions[Number(item.dataset.suggestionIndex)];
    if (!suggestion) return;

    if (suggestion.categoryId) {
      catalogState.category = suggestion.categoryId;
      if (categoryFilter) categoryFilter.value = suggestion.categoryId;
      applySearch("");
    } else {
      applySearch(suggestion.label);
    }
    renderSearchSuggestions([]);
  }

  // Ocultar sugerencias al hacer clic fuera del buscador.
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-bar-input-wrap")) {
      renderSearchSuggestions([]);
    }
  });

  // Borrar el texto también oculta las sugerencias.
  searchInput?.addEventListener("input", (e) => {
    if (!e.target.value.trim()) renderSearchSuggestions([]);
  });

  // --- Filtro de categoría ---
  categoryFilter?.addEventListener("change", (e) => {
    catalogState.category = e.target.value;
    renderCatalog();
  });

  // --- Filtro de precio (debounced) ---
  let priceDebounce = null;
  function handlePriceChange() {
    clearTimeout(priceDebounce);
    priceDebounce = setTimeout(() => {
      const minValue = priceMinFilter?.value;
      const maxValue = priceMaxFilter?.value;
      catalogState.priceMin = minValue !== "" && minValue != null ? Number(minValue) : null;
      catalogState.priceMax = maxValue !== "" && maxValue != null ? Number(maxValue) : null;
      renderCatalog();
    }, 200);
  }
  priceMinFilter?.addEventListener("input", handlePriceChange);
  priceMaxFilter?.addEventListener("input", handlePriceChange);

  // --- Ordenamiento ---
  sortFilter?.addEventListener("change", (e) => {
    catalogState.sort = e.target.value;
    renderCatalog();
  });

  // --- Limpiar filtros ---
  clearFiltersBtn?.addEventListener("click", clearCatalogFilters);
  clearFiltersBtnEmpty?.addEventListener("click", clearCatalogFilters);
}

// Las tarjetas de "Compra por categoría" aplican su categoría como filtro del catálogo.
function setupCategoryCardLinks() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".category-card");
    if (!card) return;

    const categoryId = card.dataset.category;
    const categoryFilter = document.getElementById("categoryFilter");

    catalogState.category = categoryId;
    if (categoryFilter) categoryFilter.value = categoryId;
    renderCatalog();
    // El propio href="#catalogo" de la tarjeta se encarga del desplazamiento.
  });
}

/* ---------------------------------------------------------
   5. INTERACCIÓN DEL HEADER (menú móvil y buscador)
   Nota: fase 1. El carrito y favoritos son solo visuales,
   sin lógica de guardado todavía.
--------------------------------------------------------- */

function setupHeaderInteractions() {
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const mainNav = document.getElementById("mainNav");
  const searchToggle = document.getElementById("searchToggle");
  const searchBar = document.getElementById("searchBar");

  hamburgerBtn?.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    hamburgerBtn.classList.toggle("is-open", isOpen);
    hamburgerBtn.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav?.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      mainNav.classList.remove("is-open");
      hamburgerBtn.classList.remove("is-open");
      hamburgerBtn.setAttribute("aria-expanded", "false");
    }
  });

  searchToggle?.addEventListener("click", () => {
    const isOpen = searchBar.classList.toggle("is-open");
    searchToggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) searchBar.querySelector("input")?.focus();
  });
}

/* ---------------------------------------------------------
   6. ANIMACIÓN DE APARICIÓN AL HACER SCROLL
--------------------------------------------------------- */

function setupRevealOnScroll() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || revealItems.length === 0) {
    revealItems.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((el) => observer.observe(el));
}

/* ---------------------------------------------------------
   7. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  renderCategories();
  renderFeaturedProducts();
  renderOffers();
  renderCatalog(); // Fase 2: catálogo interactivo (búsqueda, filtros, orden)
  setupHeaderInteractions();
  setupCatalogFilters(); // Fase 2
  setupCategoryCardLinks(); // Fase 2
  setupRevealOnScroll();
});

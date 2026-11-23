/* =========================================================
   TIENDA FRONTERIZA — app.js
   Fase 3.3: el catálogo (categorías, productos, búsqueda,
   filtros, orden y paginación) se lee de MariaDB mediante la
   API PHP (api/categorias.php, api/productos.php y
   api/producto.php). Ya no hay productos escritos en este archivo.
   ========================================================= */

/* ---------------------------------------------------------
   1. DATOS DESDE LA API (Fase 3.3)
   Las categorías y los productos YA NO viven en este archivo:
   se leen de MariaDB a través de api/categorias.php,
   api/productos.php y api/producto.php.

   `categories` y `products` conservan el mismo nombre y la misma
   forma de siempre. `products` funciona como CACHÉ de los productos
   ya consultados, así el carrito, los favoritos, el checkout y el
   detalle siguen usando sus funciones sin cambios.

   Los scripts que necesiten esos datos al cargar la página deben
   esperar: await catalogReady;
--------------------------------------------------------- */

const TF_CATALOG_API = "api/";
const TF_CATALOG_TIMEOUT_MS = 10000;
const TF_PRODUCT_ID_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;

// Claves de LocalStorage de carrito y favoritos (solo lectura, para recuperar sus productos).
const TF_CART_KEY_FOR_LOOKUP = "tiendaFronteriza_cart";
const TF_WISHLIST_KEY_FOR_LOOKUP = "tiendaFronteriza_wishlist";

const categories = [];
const products = [];
const catalogApiStatus = { ok: true };

// Los textos que vienen de la base de datos se escapan UNA vez al entrar al sitio.
// Así nunca se interpretan como HTML (protección contra XSS) aunque se inserten con innerHTML.
function escapeForHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Convierte un producto de la API (en español) a la forma que usa todo el sitio.
function mapApiProduct(p) {
  if (!p || typeof p.codigo !== "string" || !TF_PRODUCT_ID_PATTERN.test(p.codigo)) return null;
  const gallery = Array.isArray(p.imagenes) ? p.imagenes.map(escapeForHtml) : [];

  return {
    id: p.codigo,
    name: escapeForHtml(p.nombre),
    brand: escapeForHtml(p.marca),
    category: escapeForHtml(p.categoria && p.categoria.slug),
    categoryName: escapeForHtml(p.categoria && p.categoria.nombre),
    price: Number(p.precio) || 0,
    oldPrice: p.precio_anterior === null || p.precio_anterior === undefined ? null : Number(p.precio_anterior),
    discount: Number(p.descuento) || 0,
    image: escapeForHtml(p.imagen),
    gallery: gallery.length > 0 ? gallery : null,
    variants: null,
    description: escapeForHtml(p.descripcion),
    stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
    isDemo: Boolean(p.es_demo),
    isFeatured: Boolean(p.es_destacado),
    isOffer: Boolean(p.en_oferta),
    titleText: `${p.marca} ${p.nombre}`, // texto sin escapar: solo para document.title
  };
}

function mapApiCategory(c) {
  return {
    id: escapeForHtml(c.slug),
    name: escapeForHtml(c.nombre),
    description: escapeForHtml(c.descripcion),
    image: escapeForHtml(c.imagen),
    isVirtual: Boolean(c.es_virtual),
    total: Number(c.total_productos) || 0,
  };
}

// Guarda (o actualiza) un producto en la caché `products` y devuelve el objeto guardado.
function mergeProduct(mapped) {
  if (!mapped) return null;
  const index = products.findIndex((p) => p.id === mapped.id);
  if (index === -1) {
    products.push(mapped);
    return mapped;
  }
  // La lista no trae la galería completa: no se pierde la que ya se había cargado.
  if (!mapped.gallery && products[index].gallery) mapped.gallery = products[index].gallery;
  products[index] = mapped;
  return mapped;
}

function mergeApiProducts(list) {
  return (Array.isArray(list) ? list : []).map((p) => mergeProduct(mapApiProduct(p))).filter(Boolean);
}

// GET a la API del catálogo. Nunca lanza excepciones: devuelve { ok, status, data }.
// status 0 = no hubo respuesta (Apache apagado, sin red, tiempo agotado).
async function catalogFetch(endpoint, params) {
  const url = new URL(TF_CATALOG_API + endpoint, document.baseURI);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TF_CATALOG_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    return { ok: response.ok && Boolean(data) && data.ok === true, status: response.status, data: data || {} };
  } catch (e) {
    return { ok: false, status: 0, data: { codigo: "sin_conexion" } };
  } finally {
    clearTimeout(timer);
  }
}

// Mensaje claro para mostrar al visitante cuando la API falla.
function describeCatalogError(res) {
  if (res.status === 0) {
    return "No se pudo conectar con el servidor. Verifica que Apache y MySQL estén iniciados en XAMPP.";
  }
  if (res.status === 422 && res.data && res.data.errores) {
    const first = Object.values(res.data.errores)[0];
    if (typeof first === "string") return first;
  }
  return "No se pudo cargar el catálogo. Inténtalo de nuevo en unos momentos.";
}

// Ids guardados en el carrito y en favoritos, para traer sus datos desde la API.
function readStoredProductIds() {
  const ids = new Set();
  [TF_CART_KEY_FOR_LOOKUP, TF_WISHLIST_KEY_FOR_LOOKUP].forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach((entry) => {
        const id = typeof entry === "string" ? entry : entry && entry.id;
        if (typeof id === "string" && TF_PRODUCT_ID_PATTERN.test(id)) ids.add(id);
      });
    } catch (e) {
      // datos corruptos o LocalStorage no disponible: se ignoran
    }
  });
  return Array.from(ids).slice(0, 50);
}

// Carga inicial común a todas las páginas: categorías + productos del carrito y favoritos.
async function loadCatalogBase() {
  const ids = readStoredProductIds();
  const [categoriesRes, storedRes] = await Promise.all([
    catalogFetch("categorias.php"),
    ids.length > 0 ? catalogFetch("productos.php", { codigos: ids.join(","), por_pagina: 48 }) : Promise.resolve(null),
  ]);

  if (categoriesRes.ok && Array.isArray(categoriesRes.data.categorias)) {
    categories.splice(0, categories.length, ...categoriesRes.data.categorias.map(mapApiCategory));
  } else {
    catalogApiStatus.ok = false;
  }
  if (storedRes && storedRes.ok) mergeApiProducts(storedRes.data.productos);
}

// Se resuelve SIEMPRE (aunque la API falle) para no bloquear la página.
let catalogLoaded = false;
const catalogReady = loadCatalogBase()
  .catch(() => {
    catalogApiStatus.ok = false;
  })
  .then(() => {
    catalogLoaded = true;
  });

// El carrito y los favoritos solo se "limpian" de productos que ya no existen
// cuando la API respondió bien. Si la API no responde (Apache/MariaDB apagado)
// o aún está cargando, se conservan tal cual para no perder datos del visitante.
function canValidateStoredProducts() {
  return catalogLoaded && catalogApiStatus.ok;
}

// Detalle de un producto desde la API (incluye su galería). Lo guarda en la caché.
async function loadProductDetail(id) {
  if (typeof id !== "string" || !TF_PRODUCT_ID_PATTERN.test(id)) return { product: null, error: "not-found" };
  const res = await catalogFetch("producto.php", { codigo: id });
  if (res.ok) {
    return { product: mergeProduct(mapApiProduct(res.data.producto)), error: null };
  }
  if (res.status === 404 || res.status === 400) return { product: null, error: "not-found" };
  return { product: null, error: "unavailable", message: describeCatalogError(res) };
}

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
        <span class="product-category">${(product.categoryName || capitalize(product.category))}</span>
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

function renderApiError(res) {
  return `<p class="catalog-api-error">${escapeForHtml(describeCatalogError(res))}</p>`;
}

function renderCategories() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;
  if (!catalogApiStatus.ok || categories.length === 0) {
    grid.innerHTML = renderApiError({ status: catalogApiStatus.ok ? 200 : 0, data: {} });
    return;
  }
  grid.innerHTML = categories.map(renderCategoryCard).join("");
  setupRevealOnScroll();
}

// Destacados: productos marcados como es_destacado en la base de datos.
async function renderFeaturedProducts() {
  const grid = document.getElementById("featuredGrid");
  if (!grid) return;
  const res = await catalogFetch("productos.php", { destacados: 1, por_pagina: 6 });
  if (!res.ok) {
    grid.innerHTML = renderApiError(res);
    return;
  }
  grid.innerHTML = mergeApiProducts(res.data.productos).map(renderProductCard).join("");
  setupRevealOnScroll();
}

// Ofertas: productos marcados como en_oferta en la base de datos.
async function renderOffers() {
  const grid = document.getElementById("offersGrid");
  if (!grid) return;
  const res = await catalogFetch("productos.php", { ofertas: 1, por_pagina: 6 });
  if (!res.ok) {
    grid.innerHTML = renderApiError(res);
    return;
  }
  grid.innerHTML = mergeApiProducts(res.data.productos).map(renderProductCard).join("");
  setupRevealOnScroll();
}

/* ---------------------------------------------------------
   4b. CATÁLOGO: búsqueda, filtros, orden y paginación
   Fase 3.3: ahora lo resuelve el servidor (api/productos.php).
   El navegador solo guarda el estado de los controles y pinta
   la página de resultados que responde la API.
--------------------------------------------------------- */

const CATALOG_PAGE_SIZE = 12;

// Estado actual de búsqueda/filtros/orden/página. Única fuente de verdad del catálogo.
const catalogState = {
  search: "",
  category: "all",
  priceMin: null,
  priceMax: null,
  availability: "all",
  sort: "relevance",
  page: 1,
};

// Valores del <select> de orden -> valores que entiende la API.
const CATALOG_SORT_TO_API = {
  relevance: "relevancia",
  "price-asc": "precio_asc",
  "price-desc": "precio_desc",
  "name-asc": "nombre_asc",
  "name-desc": "nombre_desc",
};

// Normaliza texto para comparar sin distinguir mayúsculas/minúsculas ni acentos.
function normalizeText(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildCatalogQuery() {
  return {
    q: catalogState.search,
    categoria: catalogState.category !== "all" ? catalogState.category : "",
    precio_min: catalogState.priceMin,
    precio_max: catalogState.priceMax,
    disponibilidad: catalogState.availability !== "all" ? catalogState.availability : "",
    orden: CATALOG_SORT_TO_API[catalogState.sort] || "relevancia",
    pagina: catalogState.page,
    por_pagina: CATALOG_PAGE_SIZE,
  };
}

let catalogRequestId = 0;

// Pide a la API la página actual y la pinta. Si el usuario cambia un filtro mientras
// llega una respuesta, la respuesta vieja se descarta (solo cuenta la última solicitud).
async function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  const emptyState = document.getElementById("catalogEmpty");
  const resultsCount = document.getElementById("catalogResultsCount");
  if (!grid || !emptyState || !resultsCount) return;

  const errorState = document.getElementById("catalogError");
  const pager = document.getElementById("catalogPagination");
  const requestId = ++catalogRequestId;

  resultsCount.textContent = "Cargando productos…";
  grid.setAttribute("aria-busy", "true");

  const res = await catalogFetch("productos.php", buildCatalogQuery());
  if (requestId !== catalogRequestId) return;
  grid.removeAttribute("aria-busy");

  grid.hidden = true;
  emptyState.hidden = true;
  if (errorState) errorState.hidden = true;
  if (pager) pager.hidden = true;

  if (!res.ok) {
    grid.innerHTML = "";
    if (res.status === 422) {
      // Filtro inválido (p. ej. mínimo mayor que el máximo): se explica sin romper la página.
      resultsCount.textContent = describeCatalogError(res);
      emptyState.hidden = false;
      return;
    }
    resultsCount.textContent = "No se pudo cargar el catálogo";
    const message = document.getElementById("catalogErrorMessage");
    if (message) message.textContent = describeCatalogError(res);
    if (errorState) errorState.hidden = false;
    return;
  }

  const pagination = res.data.paginacion;

  // Si se pidió una página que ya no existe (p. ej. al filtrar), se vuelve a la última.
  if (res.data.productos.length === 0 && pagination.total > 0 && catalogState.page > pagination.paginas) {
    catalogState.page = pagination.paginas;
    renderCatalog();
    return;
  }

  const results = mergeApiProducts(res.data.productos);

  if (results.length === 0) {
    grid.innerHTML = "";
    emptyState.hidden = false;
    resultsCount.textContent = "NO ENCONTRAMOS PRODUCTOS";
    return;
  }

  grid.hidden = false;
  grid.innerHTML = results.map(renderProductCard).join("");
  // Los resultados del catálogo se actualizan al instante: se muestran
  // visibles de inmediato en lugar de esperar la animación de scroll.
  grid.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));

  const from = (pagination.pagina - 1) * pagination.por_pagina + 1;
  const to = from + results.length - 1;
  const countLabel =
    pagination.total === 1
      ? "Mostrando 1 producto"
      : pagination.paginas > 1
      ? `Mostrando ${from}–${to} de ${pagination.total} productos`
      : `Mostrando ${pagination.total} productos`;
  resultsCount.textContent = catalogState.search ? `${countLabel} para "${catalogState.search}"` : countLabel;

  renderCatalogPagination(pagination);
}

function renderCatalogPagination(pagination) {
  const pager = document.getElementById("catalogPagination");
  if (!pager) return;
  if (pagination.paginas <= 1) {
    pager.hidden = true;
    pager.innerHTML = "";
    return;
  }
  pager.innerHTML = `
    <button type="button" class="btn btn--clear" data-catalog-page="prev" ${pagination.pagina <= 1 ? "disabled" : ""}>← Anterior</button>
    <span class="catalog-pagination-info">Página ${pagination.pagina} de ${pagination.paginas}</span>
    <button type="button" class="btn btn--clear" data-catalog-page="next" ${pagination.pagina >= pagination.paginas ? "disabled" : ""}>Siguiente →</button>
  `;
  pager.hidden = false;
}

// Llena el <select> de categorías del catálogo con las categorías que llegaron de la API.
// "Ofertas" se incluye: la API la resuelve como "productos en oferta".
function populateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;
  select.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());
  select.insertAdjacentHTML(
    "beforeend",
    categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")
  );
  select.value = catalogState.category;
}

// Restablece filtros, orden, búsqueda y página a sus valores por defecto.
function clearCatalogFilters() {
  catalogState.search = "";
  catalogState.category = "all";
  catalogState.priceMin = null;
  catalogState.priceMax = null;
  catalogState.availability = "all";
  catalogState.sort = "relevance";
  catalogState.page = 1;

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceMinFilter = document.getElementById("priceMinFilter");
  const priceMaxFilter = document.getElementById("priceMaxFilter");
  const availabilityFilter = document.getElementById("availabilityFilter");
  const sortFilter = document.getElementById("sortFilter");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "all";
  if (priceMinFilter) priceMinFilter.value = "";
  if (priceMaxFilter) priceMaxFilter.value = "";
  if (availabilityFilter) availabilityFilter.value = "all";
  if (sortFilter) sortFilter.value = "relevance";

  renderCatalog();
}

// Hasta 5 sugerencias: categorías (locales) + productos (los pide la API).
async function getSearchSuggestions(query) {
  const q = normalizeText(query);
  if (!q) return [];

  const suggestions = [];

  categories.forEach((category) => {
    if (normalizeText(category.name).includes(q)) {
      suggestions.push({ type: "Categoría", label: category.name, categoryId: category.id });
    }
  });

  const res = await catalogFetch("productos.php", { q: query.trim(), por_pagina: 5 });
  if (res.ok) {
    mergeApiProducts(res.data.productos).forEach((product) => {
      suggestions.push({
        type: "Producto",
        label: `${product.brand} ${product.name}`, // texto ya escapado: se muestra como HTML seguro
        term: product.titleText, // texto sin escapar: es lo que se busca
        productId: product.id,
      });
    });
  }

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

// Las páginas que no tienen catálogo (carrito, producto...) llevan la búsqueda al inicio.
function goToCatalog(params) {
  const query = new URLSearchParams(params).toString();
  window.location.href = `index.html${query ? "?" + query : ""}#catalogo`;
}

// Aplica un término de búsqueda al catálogo, re-renderiza y desplaza la vista hasta él.
function applySearch(term) {
  const text = term.trim();

  if (!document.getElementById("catalogGrid")) {
    if (text) goToCatalog({ q: text });
    return;
  }

  catalogState.search = text;
  catalogState.page = 1;
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = catalogState.search;
  renderCatalog();

  const catalogSection = document.getElementById("catalogo");
  if (catalogSection && text) {
    catalogSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Lee ?q= y ?categoria= de la URL (los usa la búsqueda desde otras páginas).
function applyInitialUrlState() {
  if (!document.getElementById("catalogGrid")) return;
  const params = new URLSearchParams(window.location.search);

  const q = (params.get("q") || "").trim().slice(0, 80);
  if (q) {
    catalogState.search = q;
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = q;
  }

  const category = params.get("categoria");
  if (category && categories.some((c) => c.id === category)) {
    catalogState.category = category;
    const categoryFilter = document.getElementById("categoryFilter");
    if (categoryFilter) categoryFilter.value = category;
  }
}

function setupCatalogFilters() {
  const searchBar = document.getElementById("searchBar");
  const searchInput = document.getElementById("searchInput");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceMinFilter = document.getElementById("priceMinFilter");
  const priceMaxFilter = document.getElementById("priceMaxFilter");
  const availabilityFilter = document.getElementById("availabilityFilter");
  const sortFilter = document.getElementById("sortFilter");
  const clearFiltersBtn = document.getElementById("clearFiltersBtn");
  const clearFiltersBtnEmpty = document.getElementById("clearFiltersBtnEmpty");
  const catalogRetryBtn = document.getElementById("catalogRetryBtn");
  const catalogPagination = document.getElementById("catalogPagination");

  // --- Búsqueda predictiva (debounced) ---
  let debounceTimer = null;
  let suggestionRequestId = 0;
  searchInput?.addEventListener("input", (e) => {
    const value = e.target.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      catalogState.search = value.trim();
      catalogState.page = 1;
      renderCatalog();

      const requestId = ++suggestionRequestId;
      if (!value.trim()) {
        renderSearchSuggestions([]);
        return;
      }
      const suggestions = await getSearchSuggestions(value);
      if (requestId === suggestionRequestId) renderSearchSuggestions(suggestions);
    }, 250);
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
      if (!document.getElementById("catalogGrid")) {
        goToCatalog({ categoria: suggestion.categoryId });
      } else {
        catalogState.category = suggestion.categoryId;
        if (categoryFilter) categoryFilter.value = suggestion.categoryId;
        applySearch("");
      }
    } else {
      applySearch(suggestion.term || suggestion.label);
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
    catalogState.page = 1;
    renderCatalog();
  });

  // --- Filtro de precio (debounced) ---
  let priceDebounce = null;
  function parsePrice(value) {
    if (value === "" || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(Math.max(0, number) * 100) / 100;
  }
  function handlePriceChange() {
    clearTimeout(priceDebounce);
    priceDebounce = setTimeout(() => {
      catalogState.priceMin = parsePrice(priceMinFilter?.value);
      catalogState.priceMax = parsePrice(priceMaxFilter?.value);
      catalogState.page = 1;
      renderCatalog();
    }, 300);
  }
  priceMinFilter?.addEventListener("input", handlePriceChange);
  priceMaxFilter?.addEventListener("input", handlePriceChange);

  // --- Disponibilidad ---
  availabilityFilter?.addEventListener("change", (e) => {
    catalogState.availability = e.target.value;
    catalogState.page = 1;
    renderCatalog();
  });

  // --- Ordenamiento ---
  sortFilter?.addEventListener("change", (e) => {
    catalogState.sort = e.target.value;
    catalogState.page = 1;
    renderCatalog();
  });

  // --- Paginación (Anterior / Siguiente) ---
  catalogPagination?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-catalog-page]");
    if (!btn || btn.disabled) return;
    catalogState.page = Math.max(1, catalogState.page + (btn.dataset.catalogPage === "next" ? 1 : -1));
    renderCatalog();
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // --- Limpiar filtros / reintentar ---
  clearFiltersBtn?.addEventListener("click", clearCatalogFilters);
  clearFiltersBtnEmpty?.addEventListener("click", clearCatalogFilters);
  catalogRetryBtn?.addEventListener("click", () => renderCatalog());
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
    catalogState.page = 1;
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
   Primero se espera a catalogReady (categorías + productos del
   carrito y favoritos); después se pintan las secciones.
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  setupHeaderInteractions();
  setupCatalogFilters();
  setupCategoryCardLinks();

  await catalogReady;

  renderCategories();
  populateCategoryFilter();
  applyInitialUrlState();
  renderFeaturedProducts();
  renderOffers();
  renderCatalog();
  setupRevealOnScroll();
});

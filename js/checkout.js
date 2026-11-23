/* =========================================================
   TIENDA FRONTERIZA — checkout.js
   Fase 7: checkout multipaso (información de envío, método de
   pago, revisión) + calculadora de envío SIMULADA por código
   postal. NO procesa pagos ni genera pedidos: eso es Fase 8.

   Depende de funciones ya existentes:
   - js/app.js   → products, formatPrice, capitalize
   - js/cart.js  → getCart, findProductForCartItem, calculateSubtotal,
                   calculateTax, TAX_RATE, formatMoney, isProductAvailable,
                   showToast
   - js/auth.js  → protectPage, getSession

   Este archivo NO duplica la lógica del carrito ni de sesión:
   solo la reutiliza. No toca tiendaFronteriza_users ni
   tiendaFronteriza_session.
   ========================================================= */

/* ---------------------------------------------------------
   0. DATOS TEMPORALES DEL CHECKOUT (sessionStorage)
   Solo viven mientras dura la sesión del navegador y son
   independientes del carrito y de la sesión de usuario.
--------------------------------------------------------- */
const CHECKOUT_DATA_KEY = "tiendaFronteriza_checkoutData";

function loadCheckoutData() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_DATA_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveCheckoutData(data) {
  try {
    sessionStorage.setItem(CHECKOUT_DATA_KEY, JSON.stringify(data));
  } catch (e) {
    // Cuota excedida o almacenamiento no disponible: seguimos sin romper la página.
  }
}

// Estado en memoria de esta carga de página. Se siembra desde sessionStorage
// (si el usuario ya había avanzado pasos) y desde la sesión del usuario.
const checkoutState = Object.assign(
  {
    step: 1,
    shipping: {
      nombre: "",
      correo: "",
      telefono: "",
      calle: "",
      numExt: "",
      numInt: "",
      colonia: "",
      ciudad: "",
      estado: "",
      cp: "",
    },
    payment: null, // "tarjeta" | "paypal" | "transferencia"
  },
  loadCheckoutData()
);

function persistCheckoutState() {
  saveCheckoutData({
    step: checkoutState.step,
    shipping: checkoutState.shipping,
    payment: checkoutState.payment,
  });
}

/* ---------------------------------------------------------
   0.1 PEDIDO CONFIRMADO (Fase 8, sessionStorage)
   Igual que CHECKOUT_DATA_KEY: vive solo mientras dura la sesión
   del navegador. Guarda el último pedido confirmado para poder
   mostrar la pantalla de confirmación (incluida su guía de envío
   simulada) sin depender del carrito, que ya quedó vacío.
--------------------------------------------------------- */
const ORDER_DATA_KEY = "tiendaFronteriza_lastOrder"; // Fase 3.5: solo guarda el NÚMERO del pedido; los datos se leen de MariaDB
const ORDER_ATTEMPT_KEY = "tiendaFronteriza_orderAttempt"; // Fase 3.5: clave de la compra en curso (evita pedidos duplicados)

// Pedido ya leído del servidor (vista de la pantalla de confirmación). No se guarda en el navegador.
let confirmedOrder = null;
let confirmationLoading = false;
let memoryAttempt = null; // plan B si sessionStorage no está disponible

function saveLastOrder(orderNumber) {
  try {
    sessionStorage.setItem(ORDER_DATA_KEY, JSON.stringify({ numero: orderNumber }));
  } catch (e) {
    // Almacenamiento no disponible: la confirmación se muestra igual desde la memoria.
  }
}

// Devuelve { numero } o null. Un valor viejo (formato de fases anteriores) se descarta.
function loadLastOrder() {
  try {
    const raw = sessionStorage.getItem(ORDER_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.numero === "string" && /^TF-\d{6}$/.test(parsed.numero)) return parsed;
    sessionStorage.removeItem(ORDER_DATA_KEY);
    return null;
  } catch (e) {
    return null;
  }
}

function clearLastOrder() {
  confirmedOrder = null;
  try {
    sessionStorage.removeItem(ORDER_DATA_KEY);
  } catch (e) {
    // no-op
  }
}

// UUID de la operación de compra. Mientras el resultado sea desconocido (sin respuesta, error 5xx)
// se reutiliza la MISMA clave: así un reintento nunca crea un segundo pedido.
function newOrderKey() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  const b = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readOrderAttempt() {
  try {
    const raw = sessionStorage.getItem(ORDER_ATTEMPT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.key === "string" && Number.isInteger(parsed.userId)) return parsed;
  } catch (e) {
    // sin datos válidos
  }
  return memoryAttempt;
}

// Clave vigente de ESTE usuario (se crea si no hay).
function getOrderAttemptKey(userId) {
  const current = readOrderAttempt();
  if (current && current.userId === userId) return current.key;
  const attempt = { key: newOrderKey(), userId };
  memoryAttempt = attempt;
  try {
    sessionStorage.setItem(ORDER_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch (e) {
    // se usa la copia en memoria
  }
  return attempt.key;
}

function clearOrderAttempt() {
  memoryAttempt = null;
  try {
    sessionStorage.removeItem(ORDER_ATTEMPT_KEY);
  } catch (e) {
    // no-op
  }
}

// Convierte el pedido que devuelve el servidor al formato que ya usa la pantalla
// «¡Pedido confirmado!» (el diseño aprobado no cambia).
function orderToView(p) {
  const e = p.envio || {};
  const direccion = [
    `${e.calle} ${e.num_exterior}${e.num_interior ? ` Int. ${e.num_interior}` : ""}`,
    e.colonia,
    `${e.ciudad}, ${e.estado}`,
    `C.P. ${e.codigo_postal}`,
  ]
    .filter(Boolean)
    .join(" — ");
  const payment = PAYMENT_METHODS.find((m) => m.id === p.metodo_pago);
  return {
    orderNumber: p.numero_pedido,
    shippingGuide: p.guia_envio || "—",
    createdAt: p.creado_en_ms,
    estado: p.estado,
    customer: { nombre: e.nombre, correo: e.correo, telefono: e.telefono, direccion },
    payment: payment ? payment.label : p.metodo_pago,
    items: (p.items || []).map((i) => ({
      code: i.codigo,
      name: i.nombre,
      brand: i.marca,
      image: i.imagen,
      quantity: i.cantidad,
      unitPrice: i.precio_unitario,
      lineTotal: i.total_linea,
    })),
    subtotal: p.subtotal,
    tax: p.impuestos,
    taxRate: p.tasa_impuesto,
    shippingCost: p.costo_envio,
    shippingZone: p.zona_envio,
    shippingFree: Boolean(p.envio_gratis),
    total: p.total,
  };
}

/* ---------------------------------------------------------
   1. CALCULADORA DE ENVÍO SIMULADA (por código postal)
   Reglas sencillas y configurables, basadas únicamente en el
   primer dígito del código postal. NO son tarifas reales de
   ninguna paquetería: son SIMULADAS para este proyecto académico.
--------------------------------------------------------- */

// EDITAR aquí para ajustar las zonas/costos simulados.
const SHIPPING_RULES = [
  { zona: "Zona Metropolitana (CDMX / Edomex)", test: (cp) => /^[01]/.test(cp), cost: 59 },
  { zona: "Zona Centro", test: (cp) => /^[2-4]/.test(cp), cost: 99 },
  { zona: "Zona Occidente y Sureste", test: (cp) => /^[5-7]/.test(cp), cost: 129 },
  { zona: "Zona Norte y Frontera", test: (cp) => /^[89]/.test(cp), cost: 149 },
];
const DEFAULT_SHIPPING = { zona: "Zona estándar", cost: 129 };

// EDITAR: umbral de envío gratis simulado/configurable del proyecto.
const FREE_SHIPPING_THRESHOLD = 1500;

// Devuelve { cost, zona, free } para un código postal de 5 dígitos y un subtotal dado.
// No hace llamadas externas ni usa una base de datos real de códigos postales.
function calculateSimulatedShipping(cp, subtotal) {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return { cost: 0, zona: "Envío gratis (promoción simulada)", free: true };
  }

  const rule = SHIPPING_RULES.find((r) => r.test(cp));
  const chosen = rule || DEFAULT_SHIPPING;
  return { cost: chosen.cost, zona: chosen.zona, free: false };
}

/* ---------------------------------------------------------
   2. VALIDACIÓN DE STOCK ANTES DEL CHECKOUT
--------------------------------------------------------- */

// Devuelve un arreglo de problemas: [{ product, item, reason }]
// reason: "out-of-stock" (stock 0) | "insufficient" (cantidad > stock)
function findStockIssues(cart) {
  const issues = [];
  cart.forEach((item) => {
    const product = findProductForCartItem(item);
    if (!product) return;
    if (product.stock <= 0) {
      issues.push({ product, item, reason: "out-of-stock" });
    } else if (item.quantity > product.stock) {
      issues.push({ product, item, reason: "insufficient" });
    }
  });
  return issues;
}

/* ---------------------------------------------------------
   3. VALIDACIÓN DEL FORMULARIO DE ENVÍO
--------------------------------------------------------- */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CP_REGEX = /^\d{5}$/;

// Acepta números de teléfono con separadores comunes; exige 10 dígitos
// (formato mexicano estándar), permitiendo opcionalmente el +52 inicial.
function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("52"));
}

const SHIPPING_FIELDS = [
  { key: "nombre", groupId: "shipNombreGroup", errorId: "shipNombreError", label: "nombre" },
  { key: "correo", groupId: "shipCorreoGroup", errorId: "shipCorreoError", label: "correo" },
  { key: "telefono", groupId: "shipTelefonoGroup", errorId: "shipTelefonoError", label: "teléfono" },
  { key: "calle", groupId: "shipCalleGroup", errorId: "shipCalleError", label: "calle" },
  { key: "numExt", groupId: "shipNumExtGroup", errorId: "shipNumExtError", label: "número exterior" },
  { key: "colonia", groupId: "shipColoniaGroup", errorId: "shipColoniaError", label: "colonia" },
  { key: "ciudad", groupId: "shipCiudadGroup", errorId: "shipCiudadError", label: "ciudad" },
  { key: "estado", groupId: "shipEstadoGroup", errorId: "shipEstadoError", label: "estado" },
  { key: "cp", groupId: "shipCpGroup", errorId: "shipCpError", label: "código postal" },
];

function setFieldError(groupId, errorId, message) {
  const group = document.getElementById(groupId);
  const errorEl = document.getElementById(errorId);
  if (!group || !errorEl) return;
  group.classList.toggle("has-error", Boolean(message));
  errorEl.textContent = message || "";
}

// Valida un solo campo del formulario de envío por su key. Devuelve true/false.
function validateShippingField(key) {
  const field = SHIPPING_FIELDS.find((f) => f.key === key);
  if (!field) return true;
  const input = document.getElementById("ship" + capitalize(key));
  const value = (input ? input.value : checkoutState.shipping[key] || "").trim();

  if (key === "correo") {
    if (!value) {
      setFieldError(field.groupId, field.errorId, "El correo es obligatorio.");
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setFieldError(field.groupId, field.errorId, "Escribe un correo con formato válido.");
      return false;
    }
  } else if (key === "telefono") {
    if (!value) {
      setFieldError(field.groupId, field.errorId, "El teléfono es obligatorio.");
      return false;
    }
    if (!isValidPhone(value)) {
      setFieldError(field.groupId, field.errorId, "Escribe un teléfono válido a 10 dígitos.");
      return false;
    }
  } else if (key === "cp") {
    if (!value) {
      setFieldError(field.groupId, field.errorId, "El código postal es obligatorio.");
      return false;
    }
    if (!CP_REGEX.test(value)) {
      setFieldError(field.groupId, field.errorId, "Usa un código postal válido de 5 dígitos.");
      return false;
    }
  } else {
    // Resto de campos obligatorios: nombre, calle, numExt, colonia, ciudad, estado.
    if (!value) {
      setFieldError(field.groupId, field.errorId, `El campo ${field.label} es obligatorio.`);
      return false;
    }
  }

  setFieldError(field.groupId, field.errorId, "");
  return true;
}

function validateShippingForm() {
  let allValid = true;
  SHIPPING_FIELDS.forEach((field) => {
    const valid = validateShippingField(field.key);
    if (!valid) allValid = false;
  });
  return allValid;
}

function collectShippingValues() {
  SHIPPING_FIELDS.concat([{ key: "numInt" }]).forEach(({ key }) => {
    const input = document.getElementById("ship" + capitalize(key));
    if (input) checkoutState.shipping[key] = input.value.trim();
  });
}

/* ---------------------------------------------------------
   4. RESUMEN LATERAL (dinámico, se recalcula con el carrito
   y el código postal)
--------------------------------------------------------- */

function getCurrentShippingResult(cart) {
  const subtotal = calculateSubtotal(cart);
  const cp = checkoutState.shipping.cp || "";
  if (!CP_REGEX.test(cp)) return { cost: null, zona: null, subtotal };
  const result = calculateSimulatedShipping(cp, subtotal);
  return Object.assign({ subtotal }, result);
}

function renderCheckoutSummary() {
  const container = document.getElementById("checkoutSummary");
  if (!container) return;

  const cart = getCart();
  const subtotal = calculateSubtotal(cart);
  const tax = calculateTax(subtotal);
  const shippingResult = getCurrentShippingResult(cart);
  const shippingKnown = shippingResult.cost !== null;
  const shippingCost = shippingKnown ? shippingResult.cost : 0;
  const total = subtotal + tax + shippingCost;

  container.innerHTML = `
    <h2>Resumen del pedido</h2>
    <div class="checkout-summary-items">
      ${cart
        .map((item) => {
          const product = findProductForCartItem(item);
          if (!product) return "";
          return `
            <div class="checkout-summary-item">
              <span>${product.name} × ${item.quantity}</span>
              <span>${formatMoney(product.price * item.quantity)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
    <div class="checkout-summary-row">
      <span>Subtotal</span>
      <span>${formatMoney(subtotal)}</span>
    </div>
    <div class="checkout-summary-row">
      <span>Impuestos (${Math.round(TAX_RATE * 100)}%)</span>
      <span>${formatMoney(tax)}</span>
    </div>
    <div class="checkout-summary-row">
      <span>Envío${shippingResult.zona ? ` (${shippingResult.zona})` : ""}</span>
      <span>${
        shippingKnown
          ? shippingResult.free
            ? `<span class="free-shipping-tag">GRATIS</span>`
            : formatMoney(shippingCost)
          : "Calculando…"
      }</span>
    </div>
    <div class="checkout-summary-row checkout-summary-total">
      <span>Total</span>
      <span>${formatMoney(total)}</span>
    </div>
  `;
}

/* ---------------------------------------------------------
   5. INDICADOR DE PASOS
--------------------------------------------------------- */

const STEP_LABELS = ["Información", "Pago", "Revisión"];

function renderStepIndicator() {
  const container = document.getElementById("checkoutSteps");
  if (!container) return;

  container.innerHTML = STEP_LABELS.map((label, index) => {
    const stepNum = index + 1;
    const stateClass =
      stepNum < checkoutState.step ? "is-done" : stepNum === checkoutState.step ? "is-active" : "";
    const connector =
      index < STEP_LABELS.length - 1 ? `<div class="checkout-step-connector"></div>` : "";
    return `
      <div class="checkout-step-indicator ${stateClass}">
        <span class="step-number">${stepNum}</span>
        <span class="step-label">${label}</span>
      </div>
      ${connector}
    `;
  }).join("");
}

/* ---------------------------------------------------------
   6. PASO 1 — INFORMACIÓN DE ENVÍO
--------------------------------------------------------- */

function renderStep1() {
  const session = getSession();
  const s = checkoutState.shipping;

  // Autorelleno desde la sesión, solo si el campo todavía está vacío.
  if (!s.nombre && session && session.name) s.nombre = session.name;
  if (!s.correo && session && session.email) s.correo = session.email;

  return `
    <h2>Paso 1 · Información de envío</h2>
    <form class="checkout-form-grid" id="shippingForm" novalidate>
      <div class="form-group" id="shipNombreGroup">
        <label for="shipNombre">Nombre completo</label>
        <input type="text" id="shipNombre" value="${escapeAttr(s.nombre)}" autocomplete="name" />
        <span class="form-error" id="shipNombreError"></span>
      </div>

      <div class="form-group" id="shipCorreoGroup">
        <label for="shipCorreo">Correo electrónico</label>
        <input type="email" id="shipCorreo" value="${escapeAttr(s.correo)}" autocomplete="email" />
        <span class="form-error" id="shipCorreoError"></span>
      </div>

      <div class="form-group" id="shipTelefonoGroup">
        <label for="shipTelefono">Teléfono</label>
        <input type="tel" id="shipTelefono" value="${escapeAttr(s.telefono)}" autocomplete="tel" placeholder="10 dígitos" />
        <span class="form-error" id="shipTelefonoError"></span>
      </div>

      <div class="form-group" id="shipCpGroup">
        <label for="shipCp">Código postal</label>
        <input type="text" id="shipCp" value="${escapeAttr(s.cp)}" inputmode="numeric" maxlength="5" placeholder="00000" autocomplete="postal-code" />
        <span class="form-error" id="shipCpError"></span>
      </div>

      <div class="form-group form-group--full" id="shipCalleGroup">
        <label for="shipCalle">Calle</label>
        <input type="text" id="shipCalle" value="${escapeAttr(s.calle)}" autocomplete="address-line1" />
        <span class="form-error" id="shipCalleError"></span>
      </div>

      <div class="form-group" id="shipNumExtGroup">
        <label for="shipNumExt">Número exterior</label>
        <input type="text" id="shipNumExt" value="${escapeAttr(s.numExt)}" />
        <span class="form-error" id="shipNumExtError"></span>
      </div>

      <div class="form-group" id="shipNumIntGroup">
        <label for="shipNumInt">Número interior <span class="optional-tag">(opcional)</span></label>
        <input type="text" id="shipNumInt" value="${escapeAttr(s.numInt)}" />
        <span class="form-error" id="shipNumIntError"></span>
      </div>

      <div class="form-group" id="shipColoniaGroup">
        <label for="shipColonia">Colonia</label>
        <input type="text" id="shipColonia" value="${escapeAttr(s.colonia)}" autocomplete="address-level3" />
        <span class="form-error" id="shipColoniaError"></span>
      </div>

      <div class="form-group" id="shipCiudadGroup">
        <label for="shipCiudad">Ciudad</label>
        <input type="text" id="shipCiudad" value="${escapeAttr(s.ciudad)}" autocomplete="address-level2" />
        <span class="form-error" id="shipCiudadError"></span>
      </div>

      <div class="form-group form-group--full" id="shipEstadoGroup">
        <label for="shipEstado">Estado</label>
        <input type="text" id="shipEstado" value="${escapeAttr(s.estado)}" autocomplete="address-level1" />
        <span class="form-error" id="shipEstadoError"></span>
      </div>

      <p class="checkout-shipping-cost-note" id="shippingCostNote"></p>
    </form>

    <div class="checkout-step-nav">
      <a href="carrito.html" class="btn btn--clear">Volver al carrito</a>
      <button type="button" class="btn btn--primary" id="step1NextBtn">Siguiente</button>
    </div>
  `;
}

function renderShippingCostNote() {
  const note = document.getElementById("shippingCostNote");
  if (!note) return;
  const cart = getCart();
  const result = getCurrentShippingResult(cart);

  if (result.cost === null) {
    note.textContent = "Escribe tu código postal para calcular el envío.";
    return;
  }

  note.innerHTML = result.free
    ? `Envío: <strong>GRATIS</strong> (${result.zona})`
    : `Envío estimado a tu código postal: <strong>${formatMoney(result.cost)}</strong> (${result.zona})`;
}

function setupStep1() {
  const cpInput = document.getElementById("shipCp");
  const form = document.getElementById("shippingForm");
  if (!form) return;

  renderShippingCostNote();

  // Validación en vivo: al salir del campo, y mientras se escribe si ya tenía error.
  SHIPPING_FIELDS.forEach(({ key, groupId }) => {
    if (key === "cp") return; // el código postal tiene su propio manejador combinado (ver abajo)
    const input = document.getElementById("ship" + capitalize(key));
    if (!input) return;
    input.addEventListener("blur", () => validateShippingField(key));
    input.addEventListener("input", () => {
      if (document.getElementById(groupId).classList.contains("has-error")) {
        validateShippingField(key);
      }
      // Guarda cada tecleo en el estado para no perder lo escrito si el
      // carrito cambia en otra pestaña y esta página se vuelve a pintar.
      checkoutState.shipping[key] = document.getElementById("ship" + capitalize(key)).value;
      persistCheckoutState();
    });
  });

  // El número interior no se valida (es opcional) pero también se guarda en vivo.
  document.getElementById("shipNumInt")?.addEventListener("input", (e) => {
    checkoutState.shipping.numInt = e.target.value;
    persistCheckoutState();
  });

  // Código postal: primero se limpia a solo dígitos (máx. 5) y luego,
  // con el valor ya limpio, se valida y se recalcula el envío simulado.
  cpInput?.addEventListener("input", () => {
    cpInput.value = cpInput.value.replace(/\D/g, "").slice(0, 5);
    if (document.getElementById("shipCpGroup").classList.contains("has-error")) {
      validateShippingField("cp");
    }
    collectShippingValues();
    persistCheckoutState();
    renderShippingCostNote();
    renderCheckoutSummary();
  });
  cpInput?.addEventListener("blur", () => validateShippingField("cp"));

  document.getElementById("step1NextBtn")?.addEventListener("click", () => {
    collectShippingValues();
    persistCheckoutState();

    if (!validateShippingForm()) return;

    const issues = findStockIssues(getCart());
    if (issues.length > 0) {
      showToast("Corrige las cantidades de tu carrito antes de continuar.");
      renderCheckoutPage();
      return;
    }

    checkoutState.step = 2;
    persistCheckoutState();
    renderCheckoutPage();
  });
}

/* ---------------------------------------------------------
   7. PASO 2 — MÉTODO DE PAGO (simulado, sin datos reales)
--------------------------------------------------------- */

const PAYMENT_METHODS = [
  { id: "tarjeta", label: "Tarjeta de crédito/débito" },
  { id: "paypal", label: "PayPal" },
  { id: "transferencia", label: "Transferencia bancaria" },
];

function renderStep2() {
  return `
    <h2>Paso 2 · Método de pago</h2>
    <div class="payment-options" id="paymentOptions">
      ${PAYMENT_METHODS.map(
        (method) => `
        <label class="payment-option ${checkoutState.payment === method.id ? "is-selected" : ""}" data-payment-option="${method.id}">
          <input type="radio" name="paymentMethod" value="${method.id}" ${checkoutState.payment === method.id ? "checked" : ""} />
          <span class="payment-option-label">${method.label}</span>
        </label>
      `
      ).join("")}
    </div>
    <span class="form-error" id="paymentError"></span>

    <div class="checkout-step-nav">
      <button type="button" class="btn btn--clear" id="step2BackBtn">Regresar</button>
      <button type="button" class="btn btn--primary" id="step2NextBtn">Siguiente</button>
    </div>
  `;
}

function setupStep2() {
  const options = document.querySelectorAll("[data-payment-option]");
  const errorEl = document.getElementById("paymentError");

  options.forEach((option) => {
    option.addEventListener("click", () => {
      checkoutState.payment = option.dataset.paymentOption;
      persistCheckoutState();
      options.forEach((o) => o.classList.toggle("is-selected", o === option));
      option.querySelector('input[type="radio"]').checked = true;
      if (errorEl) errorEl.textContent = "";
    });
  });

  document.getElementById("step2BackBtn")?.addEventListener("click", () => {
    checkoutState.step = 1;
    persistCheckoutState();
    renderCheckoutPage();
  });

  document.getElementById("step2NextBtn")?.addEventListener("click", () => {
    if (!checkoutState.payment) {
      if (errorEl) errorEl.textContent = "Selecciona un método de pago.";
      return;
    }

    const issues = findStockIssues(getCart());
    if (issues.length > 0) {
      showToast("Corrige las cantidades de tu carrito antes de continuar.");
      renderCheckoutPage();
      return;
    }

    checkoutState.step = 3;
    persistCheckoutState();
    renderCheckoutPage();
  });
}

/* ---------------------------------------------------------
   7.1 VALIDACIÓN FINAL Y CONSTRUCCIÓN DEL PEDIDO (Fase 8)
   Antes de mostrar "Pedido confirmado" nos aseguramos de que el
   carrito, los datos de envío y el método de pago sigan siendo
   válidos. Si algo falta, NO se genera ningún pedido.
--------------------------------------------------------- */

function isOrderReadyToConfirm(cart) {
  if (!cart || cart.length === 0) return false;
  if (findStockIssues(cart).length > 0) return false;
  if (!checkoutState.payment) return false;

  const s = checkoutState.shipping;
  const requiredKeys = ["nombre", "correo", "telefono", "calle", "numExt", "colonia", "ciudad", "estado", "cp"];
  if (requiredKeys.some((key) => !String(s[key] || "").trim())) return false;
  if (!EMAIL_REGEX.test(s.correo)) return false;
  if (!isValidPhone(s.telefono)) return false;
  if (!CP_REGEX.test(s.cp)) return false;

  return true;
}

// Fase 3.5: el pedido ya NO se arma en el navegador. Aquí solo se preparan los datos de envío
// que se mandan al servidor y el total que el usuario revisó (el servidor lo usa únicamente para
// avisar si algo cambió; nunca para calcular).
function shippingPayload() {
  const s = checkoutState.shipping;
  return {
    nombre: s.nombre,
    correo: s.correo,
    telefono: s.telefono,
    calle: s.calle,
    num_exterior: s.numExt,
    num_interior: s.numInt || "",
    colonia: s.colonia,
    ciudad: s.ciudad,
    estado: s.estado,
    codigo_postal: s.cp,
  };
}

// Total mostrado al usuario, en centavos enteros y con el mismo redondeo del servidor.
function getShownTotal(cart) {
  const subtotalCents = Math.round(calculateSubtotal(cart) * 100);
  const taxCents = Math.floor((subtotalCents * 160 + 500) / 1000);
  const shippingCents = Math.round((getCurrentShippingResult(cart).cost || 0) * 100);
  return (subtotalCents + taxCents + shippingCents) / 100;
}

function renderStep3() {
  const cart = getCart();
  const s = checkoutState.shipping;
  const subtotal = calculateSubtotal(cart);
  const tax = calculateTax(subtotal);
  const shippingResult = getCurrentShippingResult(cart);
  const shippingCost = shippingResult.cost || 0;
  const total = subtotal + tax + shippingCost;

  const paymentLabel =
    PAYMENT_METHODS.find((m) => m.id === checkoutState.payment)?.label || "No seleccionado";

  const direccionLinea = [
    `${s.calle} ${s.numExt}${s.numInt ? ` Int. ${s.numInt}` : ""}`,
    s.colonia,
    `${s.ciudad}, ${s.estado}`,
    `C.P. ${s.cp}`,
  ]
    .filter(Boolean)
    .join(" — ");

  return `
    <h2>Paso 3 · Revisión del pedido</h2>

    <div class="review-section">
      <h3>Información de envío</h3>
      <div class="review-row"><span>Nombre</span><span>${escapeHtmlLocal(s.nombre)}</span></div>
      <div class="review-row"><span>Correo</span><span>${escapeHtmlLocal(s.correo)}</span></div>
      <div class="review-row"><span>Teléfono</span><span>${escapeHtmlLocal(s.telefono)}</span></div>
      <div class="review-row"><span>Dirección</span><span>${escapeHtmlLocal(direccionLinea)}</span></div>
    </div>

    <div class="review-section">
      <h3>Método de pago</h3>
      <div class="review-row"><span>Seleccionado</span><span>${paymentLabel}</span></div>
    </div>

    <div class="review-section">
      <h3>Productos</h3>
      ${cart
        .map((item) => {
          const product = findProductForCartItem(item);
          if (!product) return "";
          return `
            <div class="review-product">
              <img src="${product.image}" alt="${product.brand} ${product.name}" />
              <div class="review-product-info">
                <div class="review-product-name">${product.name}</div>
                <div class="review-product-qty">Cantidad: ${item.quantity} · ${formatMoney(product.price)} c/u</div>
              </div>
              <div class="review-product-subtotal">${formatMoney(product.price * item.quantity)}</div>
            </div>
          `;
        })
        .join("")}
    </div>

    <div class="review-section">
      <h3>Resumen</h3>
      <div class="review-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
      <div class="review-row"><span>Impuestos (${Math.round(TAX_RATE * 100)}%)</span><span>${formatMoney(tax)}</span></div>
      <div class="review-row"><span>Envío</span><span>${shippingResult.free ? "GRATIS" : formatMoney(shippingCost)}</span></div>
      <div class="review-row" style="font-weight:700; font-size:16px; color: var(--color-primary);"><span>TOTAL</span><span>${formatMoney(total)}</span></div>
    </div>

    <p class="checkout-sim-note">Simulación académica: al confirmar se registra tu pedido en la tienda, pero <strong>no se realiza ningún cobro real</strong> ni se conecta ningún banco o paquetería.</p>

    <div class="form-group form-check-group" id="checkoutAcceptGroup">
      <label class="form-check" for="checkoutAccept">
        <input type="checkbox" id="checkoutAccept"${checkoutAccepted ? " checked" : ""} />
        <span>Acepto los <a href="terminos.html" target="_blank" rel="noopener">Términos y condiciones</a> y entiendo que este pedido es una demostración académica, sin cobros ni envíos reales.</span>
      </label>
      <span class="form-error" id="checkoutAcceptError"></span>
    </div>

    <div class="checkout-step-nav">
      <button type="button" class="btn btn--clear" id="step3BackBtn">Regresar</button>
      <button type="button" class="btn btn--primary" id="continueToPaymentBtn">CONTINUAR AL PAGO</button>
    </div>
  `;
}

const CHECKOUT_ACCEPT_MESSAGE =
  "Debes aceptar los Términos y condiciones y entender que el pedido es una demostración académica para poder confirmarlo.";

function setCheckoutAcceptError(message) {
  document.getElementById("checkoutAcceptGroup")?.classList.toggle("has-error", Boolean(message));
  const span = document.getElementById("checkoutAcceptError");
  if (span) span.textContent = message || "";
}

function setupStep3() {
  document.getElementById("checkoutAccept")?.addEventListener("change", (e) => {
    checkoutAccepted = e.currentTarget.checked === true;
    setCheckoutAcceptError(checkoutAccepted ? "" : CHECKOUT_ACCEPT_MESSAGE);
  });

  document.getElementById("step3BackBtn")?.addEventListener("click", () => {
    checkoutState.step = 2;
    persistCheckoutState();
    renderCheckoutPage();
  });

  // FASE 3.5: el pedido se registra en MariaDB. El pago y el envío siguen siendo SIMULADOS.
  document.getElementById("continueToPaymentBtn")?.addEventListener("click", (e) => {
    // Evita pedidos duplicados: mientras se registra el pedido, los clics extra se ignoran.
    // (El servidor tiene su propia protección: este bloqueo es solo la primera capa.)
    if (isPlacingOrder) return;

    const cart = getCart();

    // Etapa 2: primera capa (navegador). El servidor vuelve a exigir la aceptación.
    const acceptBox = document.getElementById("checkoutAccept");
    checkoutAccepted = Boolean(acceptBox && acceptBox.checked);
    if (!checkoutAccepted) {
      setCheckoutAcceptError(CHECKOUT_ACCEPT_MESSAGE);
      acceptBox?.focus();
      return;
    }
    setCheckoutAcceptError("");

    const issues = findStockIssues(cart);
    if (issues.length > 0) {
      showToast("Corrige las cantidades de tu carrito antes de continuar.");
      renderCheckoutPage();
      return;
    }

    if (!isOrderReadyToConfirm(cart)) {
      // Algo requerido falta o dejó de ser válido: nunca mostramos una
      // confirmación falsa. Regresamos al usuario a revisar sus datos.
      showToast("Faltan datos para completar tu pedido. Revisa los pasos anteriores.");
      checkoutState.step = 1;
      persistCheckoutState();
      renderCheckoutPage();
      return;
    }

    const btn = e.currentTarget;
    isPlacingOrder = true;
    clearOrderAlert();
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Registrando pedido…";

    submitOrder(cart)
      .catch(() => ({ kind: "response", res: { ok: false, status: 0, data: {} }, key: null }))
      .then(handleOrderOutcome)
      .catch(() => {
        // Nada se confirma si algo salió mal: se libera el botón y el carrito sigue intacto.
        isPlacingOrder = false;
        showOrderAlert("No se pudo completar el pedido. Tu carrito sigue intacto; inténtalo de nuevo.");
        renderCheckoutPage();
      });
  });
}

/* ---------------------------------------------------------
   8.0 REGISTRO DEL PEDIDO EN EL SERVIDOR (Fase 3.5)
--------------------------------------------------------- */

function showOrderAlert(html) {
  let alertBox = document.getElementById("checkoutOrderAlert");
  if (!alertBox) {
    const anchor = document.getElementById("checkoutStockWarning");
    if (!anchor || !anchor.parentNode) {
      showToast(html.replace(/<[^>]*>/g, ""));
      return;
    }
    alertBox = document.createElement("div");
    alertBox.id = "checkoutOrderAlert";
    alertBox.className = "checkout-stock-warning";
    alertBox.setAttribute("role", "alert");
    anchor.parentNode.insertBefore(alertBox, anchor);
  }
  alertBox.innerHTML = `<h2>No se registró tu pedido</h2><p>${html}</p>`;
  alertBox.hidden = false;
}

function clearOrderAlert() {
  const alertBox = document.getElementById("checkoutOrderAlert");
  if (alertBox) {
    alertBox.hidden = true;
    alertBox.innerHTML = "";
  }
}

// Primero se asegura que el carrito del servidor esté al día (Fase 3.4) y luego se envía el pedido.
async function submitOrder(cart) {
  const session = typeof getSession === "function" ? getSession() : null;
  const userId = session && Number.isInteger(session.userId) ? session.userId : null;
  if (userId === null) return { kind: "session" };

  const shownTotal = getShownTotal(cart); // lo que el usuario revisó, antes de sincronizar
  const flush = typeof cartFlushForOrder === "function" ? await cartFlushForOrder() : { ok: true };
  if (!flush.ok) return { kind: "sync" };

  const key = getOrderAttemptKey(userId);
  const res = await apiRequest("pedido_crear.php", {
    method: "POST",
    body: {
      usuario_esperado: userId,
      clave: key,
      metodo_pago: checkoutState.payment,
      total_mostrado: shownTotal,
      envio: shippingPayload(),
      ...(checkoutAccepted === true ? { acepta_politicas: true } : {}),
    },
  });
  return { kind: "response", res, key };
}

// Pedido guardado (nuevo o recuperado): se muestra la confirmación con los datos del servidor.
function completeOrder(pedido) {
  const order = orderToView(pedido);
  clearOrderAttempt();
  clearOrderAlert();
  checkoutAccepted = false;
  saveLastOrder(order.orderNumber);
  confirmedOrder = order;
  // El stock mostrado en el catálogo se actualiza al instante (el servidor ya lo descontó).
  order.items.forEach((item) => {
    const cached = typeof products !== "undefined" ? products.find((p) => p.id === item.code) : null;
    if (cached && typeof cached.stock === "number") cached.stock = Math.max(0, cached.stock - item.quantity);
  });
  // Primero se marca el paso 4 y después se actualiza el carrito: así el aviso de
  // "carrito actualizado" ya encuentra la confirmación y no parpadea la pantalla de carrito vacío.
  checkoutState.step = 4;
  persistCheckoutState();
  if (typeof cartAfterOrder === "function") cartAfterOrder(order.items.map((item) => item.code));
  isPlacingOrder = false;
  renderOrderConfirmation(order);
}

// ¿Ya existe en el servidor un pedido con esta clave? (respuesta perdida, recarga, otra pestaña)
async function recoverOrderByKey(key) {
  if (!key) return false;
  const res = await apiRequest(`pedido.php?clave=${encodeURIComponent(key)}`);
  if (res.ok && res.data.pedido) {
    completeOrder(res.data.pedido);
    return true;
  }
  return false;
}

const ORDER_FIELD_MAP = {
  nombre: "nombre",
  correo: "correo",
  telefono: "telefono",
  calle: "calle",
  num_exterior: "numExt",
  colonia: "colonia",
  ciudad: "ciudad",
  estado: "estado",
  codigo_postal: "cp",
};

async function handleOrderOutcome(outcome) {
  if (outcome.kind === "response" && outcome.res.ok && outcome.res.data.pedido) {
    completeOrder(outcome.res.data.pedido);
    return;
  }

  isPlacingOrder = false;
  let message = "";
  let fieldErrors = null;
  let acceptOnly = false;

  if (outcome.kind === "session") {
    message = "Tu sesión terminó. Inicia sesión de nuevo: tu carrito se conserva y no se registró ningún pedido.";
  } else if (outcome.kind === "sync") {
    message =
      "Tu carrito todavía no se guarda en tu cuenta (revisa el aviso del carrito). No se registró ningún pedido; inténtalo de nuevo cuando se sincronice.";
  } else {
    const res = outcome.res;
    const d = res.data || {};
    const code = d.codigo;

    if (res.status === 0 || res.status >= 500) {
      // Resultado desconocido: el pedido pudo guardarse aunque no llegó la respuesta. Se conserva la MISMA clave.
      if (await recoverOrderByKey(outcome.key)) return;
      message =
        "No pudimos confirmar tu pedido porque el servidor no respondió. Tu carrito sigue intacto. Puedes volver a pulsar el botón: si el pedido ya se había registrado, no se duplicará.";
    } else if (res.status === 401 || code === "usuario_distinto") {
      if (typeof fetchSession === "function") await fetchSession();
      if (typeof notifySessionChanged === "function") notifySessionChanged();
      message =
        res.status === 401
          ? "Tu sesión terminó. Inicia sesión de nuevo: tu carrito se conserva y no se registró ningún pedido."
          : "Tu sesión cambió en otra pestaña. No se registró ningún pedido; revisa tu carrito.";
      clearOrderAttempt();
    } else if (code === "existencias") {
      clearOrderAttempt();
      if (typeof cartRefreshFromServer === "function") await cartRefreshFromServer();
      const names = (d.problemas || []).map((p) => escapeHtmlLocal(p.nombre)).join(", ");
      message = `${escapeHtmlLocal(d.mensaje || "Algunos productos ya no tienen existencias.")}${names ? ` Producto(s): ${names}.` : ""}`;
    } else if (code === "precios_cambiaron") {
      clearOrderAttempt();
      if (typeof cartRefreshFromServer === "function") await cartRefreshFromServer();
      message = escapeHtmlLocal(d.mensaje || "El total de tu pedido cambió.");
    } else if (code === "carrito_vacio") {
      // Puede que el pedido ya se haya registrado antes (otra pestaña o respuesta perdida).
      if (await recoverOrderByKey(outcome.key)) return;
      clearOrderAttempt();
      if (typeof cartRefreshFromServer === "function") await cartRefreshFromServer();
      message = escapeHtmlLocal(d.mensaje || "Tu carrito está vacío.");
    } else if (code === "clave_reutilizada") {
      clearOrderAttempt();
      message = escapeHtmlLocal(d.mensaje || "Esta compra ya se había registrado.");
      message += ' <a href="pedidos.html">Ver mis pedidos</a>';
    } else if (res.status === 422 && d.errores && Object.keys(d.errores).every((k) => k === "aceptacion")) {
      // Solo falta la aceptación: se permanece en el paso 3 (la clave de intento se conserva).
      acceptOnly = true;
      message = escapeHtmlLocal(d.errores.aceptacion);
    } else if (res.status === 422 && d.errores) {
      clearOrderAttempt();
      fieldErrors = d.errores;
      message = "Revisa los datos de tu pedido: " + Object.values(d.errores).map(escapeHtmlLocal).join(" ");
    } else if (res.status === 429) {
      message = escapeHtmlLocal(d.mensaje || "Demasiados intentos. Espera un momento.");
    } else {
      message = "No se pudo registrar tu pedido. Tu carrito sigue intacto; inténtalo de nuevo en unos momentos.";
    }
  }

  if (fieldErrors) {
    checkoutState.step = 1;
    persistCheckoutState();
  }
  renderCheckoutPage();
  showOrderAlert(message);
  if (acceptOnly) {
    checkoutAccepted = false;
    const box = document.getElementById("checkoutAccept");
    if (box) box.checked = false;
    setCheckoutAcceptError(CHECKOUT_ACCEPT_MESSAGE);
  }
  if (fieldErrors) {
    Object.keys(fieldErrors).forEach((k) => {
      const key = ORDER_FIELD_MAP[k.replace(/^envio\./, "")];
      const field = SHIPPING_FIELDS.find((f) => f.key === key);
      if (field) setFieldError(field.groupId, field.errorId, fieldErrors[k]);
    });
  }
  if (outcome.kind === "session" && typeof protectPage === "function") protectPage("checkout.html");
}

/* ---------------------------------------------------------
   9. RENDERIZADO PRINCIPAL / ESTADOS
--------------------------------------------------------- */

function escapeAttr(text) {
  return String(text || "").replace(/"/g, "&quot;");
}

function escapeHtmlLocal(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function renderCheckoutEmptyState() {
  const wrap = document.getElementById("checkoutContent");
  const empty = document.getElementById("checkoutEmptyState");
  if (wrap) wrap.hidden = true;
  if (empty) empty.hidden = false;
  hideConfirmationView();
}

/* ---------------------------------------------------------
   8.1 PANTALLA "PEDIDO CONFIRMADO" (Fase 8)
--------------------------------------------------------- */

function hideConfirmationView() {
  const confirmation = document.getElementById("checkoutConfirmation");
  if (!confirmation) return;
  confirmation.hidden = true;
  confirmation.innerHTML = "";
}

function renderOrderConfirmationMarkup(order) {
  const isPending = order.estado === "pendiente";
  const dateStr = new Date(order.createdAt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <div class="order-confirmation-hero">
      <div class="order-confirmation-check" aria-hidden="true">✓</div>
      <h1>Pedido simulado registrado</h1>
      <p>${
        isPending
          ? "Se registró un pedido simulado, en espera de la confirmación de la transferencia (simulada). No se realizó ningún cobro real."
          : "Se registró un pedido simulado y el pago fue aprobado de forma simulada. No se realizó ningún cobro real ni se enviará ningún producto."
      }</p>
      <p class="order-confirmation-date">Registrado el ${dateStr}</p>
    </div>

    <div class="order-codes">
      <div class="order-code-box">
        <span class="order-code-label">Número de pedido</span>
        <span class="order-code-value">${order.orderNumber}</span>
      </div>
      <div class="order-code-box">
        <span class="order-code-label">Guía de envío (simulada)</span>
        <span class="order-code-value">${order.shippingGuide}</span>
      </div>
    </div>

    <div class="order-status-track">
      <div class="order-status-item is-done"><span class="order-status-dot">✓</span><span>Pedido simulado registrado</span></div>
      <div class="order-status-item${isPending ? "" : " is-done"}"><span class="order-status-dot">${isPending ? "○" : "✓"}</span><span>${isPending ? "Pago pendiente (simulado)" : "Pago aprobado (simulado)"}</span></div>
      <div class="order-status-item"><span class="order-status-dot">○</span><span>Preparación pendiente (la administración actualiza el estado)</span></div>
      <div class="order-status-item"><span class="order-status-dot">○</span><span>En camino</span></div>
    </div>

    <p class="order-eta">Entrega estimada: <strong>3–5 días hábiles</strong> <span class="order-eta-tag">(tiempo simulado)</span></p>

    <p class="order-sim-note">Simulación académica: <strong>no se realizó ningún cobro real</strong> ni se contactó a ningún banco o paquetería. Puedes consultar este pedido en <a href="pedidos.html">Mis pedidos</a>.</p>

    <div class="review-section">
      <h3>Datos de envío</h3>
      <div class="review-row"><span>Nombre</span><span>${escapeHtmlLocal(order.customer.nombre)}</span></div>
      <div class="review-row"><span>Correo</span><span>${escapeHtmlLocal(order.customer.correo)}</span></div>
      <div class="review-row"><span>Teléfono</span><span>${escapeHtmlLocal(order.customer.telefono)}</span></div>
      <div class="review-row"><span>Dirección</span><span>${escapeHtmlLocal(order.customer.direccion)}</span></div>
    </div>

    <div class="review-section">
      <h3>Método de pago</h3>
      <div class="review-row"><span>Seleccionado</span><span>${escapeHtmlLocal(order.payment)}</span></div>
    </div>

    <div class="review-section">
      <h3>Productos</h3>
      ${order.items
        .map(
          (item) => `
            <div class="review-product">
              <img src="${item.image}" alt="${escapeAttr(item.brand)} ${escapeAttr(item.name)}" />
              <div class="review-product-info">
                <div class="review-product-name">${escapeHtmlLocal(item.name)}</div>
                <div class="review-product-qty">Cantidad: ${item.quantity} · ${formatMoney(item.unitPrice)} c/u</div>
              </div>
              <div class="review-product-subtotal">${formatMoney(item.lineTotal)}</div>
            </div>
          `
        )
        .join("")}
    </div>

    <div class="review-section">
      <h3>Resumen</h3>
      <div class="review-row"><span>Subtotal</span><span>${formatMoney(order.subtotal)}</span></div>
      <div class="review-row"><span>Impuestos (${Math.round(order.taxRate * 100)}%)</span><span>${formatMoney(order.tax)}</span></div>
      <div class="review-row"><span>Envío${order.shippingZone ? ` (${order.shippingZone})` : ""}</span><span>${
    order.shippingFree ? "GRATIS" : formatMoney(order.shippingCost)
  }</span></div>
      <div class="review-row" style="font-weight:700; font-size:16px; color: var(--color-primary);"><span>TOTAL</span><span>${formatMoney(order.total)}</span></div>
    </div>

    <div class="checkout-step-nav order-confirmation-actions">
      <a href="index.html" class="btn btn--primary btn--full">Volver a la tienda</a>
    </div>
  `;
}

function renderOrderConfirmation(order) {
  const wrap = document.getElementById("checkoutContent");
  const empty = document.getElementById("checkoutEmptyState");
  const stockWarning = document.getElementById("checkoutStockWarning");
  const steps = document.getElementById("checkoutSteps");
  const layout = document.getElementById("checkoutLayout");
  const confirmation = document.getElementById("checkoutConfirmation");

  if (wrap) wrap.hidden = false;
  if (empty) empty.hidden = true;
  if (stockWarning) {
    stockWarning.hidden = true;
    stockWarning.innerHTML = "";
  }
  if (steps) steps.hidden = true;
  if (layout) layout.hidden = true;
  // Se vacían el paso y el resumen: ya no queda ningún botón de pago en la página.
  const stepContent = document.getElementById("checkoutStepContent");
  const summary = document.getElementById("checkoutSummary");
  if (stepContent) stepContent.innerHTML = "";
  if (summary) summary.innerHTML = "";
  if (!confirmation) return;

  confirmation.hidden = false;
  confirmation.innerHTML = renderOrderConfirmationMarkup(order);

  // La tarjeta es lo único visible: se lleva la vista al inicio de la página.
  window.scrollTo({ top: 0, behavior: "auto" });
  confirmation.setAttribute("tabindex", "-1");
  confirmation.focus({ preventScroll: true });
}

function renderStockWarning(issues) {
  const banner = document.getElementById("checkoutStockWarning");
  if (!banner) return;

  if (issues.length === 0) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }

  banner.hidden = false;
  banner.innerHTML = `
    <h2>Algunas cantidades de tu carrito ya no están disponibles</h2>
    <ul>
      ${issues
        .map(
          (issue) =>
            `<li>${issue.product.name} — ${
              issue.reason === "out-of-stock"
                ? "sin existencias."
                : `solo quedan ${issue.product.stock} disponibles (tienes ${issue.item.quantity} en el carrito).`
            }</li>`
        )
        .join("")}
    </ul>
    <a href="carrito.html" class="btn btn--primary btn--small">Ajustar carrito</a>
  `;
}

// Lee de MariaDB el pedido confirmado (tras recargar la página, por ejemplo).
async function loadConfirmedOrder(orderNumber) {
  if (confirmationLoading) return;
  confirmationLoading = true;
  const wrap = document.getElementById("checkoutContent");
  const empty = document.getElementById("checkoutEmptyState");
  const steps = document.getElementById("checkoutSteps");
  const layout = document.getElementById("checkoutLayout");
  const confirmation = document.getElementById("checkoutConfirmation");
  if (wrap) wrap.hidden = false;
  if (empty) empty.hidden = true;
  if (steps) steps.hidden = true;
  if (layout) layout.hidden = true;
  if (confirmation) {
    confirmation.hidden = false;
    confirmation.innerHTML = '<div class="order-confirmation-hero"><h1>Cargando tu pedido…</h1></div>';
  }

  const res = await apiRequest(`pedido.php?numero=${encodeURIComponent(orderNumber)}`);
  confirmationLoading = false;
  if (res.ok && res.data.pedido) {
    confirmedOrder = orderToView(res.data.pedido);
    renderOrderConfirmation(confirmedOrder);
    return;
  }
  if (res.status === 404 || res.status === 401) {
    // No es un pedido de esta cuenta (o ya no existe): se reinicia el flujo normal.
    clearLastOrder();
    checkoutState.step = 1;
    persistCheckoutState();
    renderCheckoutPage();
    return;
  }
  if (confirmation) {
    confirmation.innerHTML = `
      <div class="order-confirmation-hero">
        <h1>No pudimos cargar tu pedido</h1>
        <p>Tu pedido <strong>${escapeHtmlLocal(orderNumber)}</strong> sigue registrado en tu cuenta. Intenta de nuevo o consúltalo en «Mis pedidos».</p>
      </div>
      <div class="checkout-step-nav order-confirmation-actions">
        <button type="button" class="btn btn--primary" id="retryOrderLoadBtn">Reintentar</button>
        <a href="pedidos.html" class="btn btn--clear">Mis pedidos</a>
      </div>`;
    document.getElementById("retryOrderLoadBtn")?.addEventListener("click", () => loadConfirmedOrder(orderNumber));
  }
}

function renderCheckoutStep() {
  const stepContent = document.getElementById("checkoutStepContent");
  if (!stepContent) return;

  if (checkoutState.step === 1) {
    stepContent.innerHTML = renderStep1();
    setupStep1();
  } else if (checkoutState.step === 2) {
    stepContent.innerHTML = renderStep2();
    setupStep2();
  } else {
    stepContent.innerHTML = renderStep3();
    setupStep3();
  }

  renderStepIndicator();
  renderCheckoutSummary();
}

// true mientras se simula el pago; mantiene el botón bloqueado aunque otra
// pestaña o el carrito lateral disparen un nuevo pintado de la página.
let isPlacingOrder = false;
// Etapa 2: casilla de aceptación del paso 3. Solo vive en memoria (no se guarda en sessionStorage):
// cada pedido exige marcarla de nuevo.
let checkoutAccepted = false;

function renderCheckoutPage() {
  if (isPlacingOrder) return;

  const cart = getCart();

  // Si el último paso fue la confirmación y el carrito sigue vacío (nadie agregó productos
  // nuevos desde entonces), se muestra la pantalla de "Pedido confirmado" de ese pedido,
  // leído de MariaDB (Fase 3.5): sobrevive a recargas y no depende del navegador.
  if (checkoutState.step === 4) {
    const ref = loadLastOrder();
    if (ref && cart.length === 0) {
      if (confirmedOrder && confirmedOrder.orderNumber === ref.numero) {
        renderOrderConfirmation(confirmedOrder);
      } else {
        loadConfirmedOrder(ref.numero);
      }
      return;
    }
    // No hay pedido guardado, o el usuario ya agregó productos nuevos al
    // carrito: el pedido anterior ya no aplica, reiniciamos el flujo normal.
    clearLastOrder();
    checkoutState.step = 1;
    persistCheckoutState();
  }

  if (cart.length === 0) {
    renderCheckoutEmptyState();
    return;
  }

  const wrap = document.getElementById("checkoutContent");
  const empty = document.getElementById("checkoutEmptyState");
  const steps = document.getElementById("checkoutSteps");
  const layout = document.getElementById("checkoutLayout");
  if (wrap) wrap.hidden = false;
  if (empty) empty.hidden = true;
  if (steps) steps.hidden = false;
  if (layout) layout.hidden = false;
  hideConfirmationView();

  const issues = findStockIssues(cart);
  renderStockWarning(issues);

  // Si hay problemas de stock y el usuario no está en el paso 1, lo regresamos
  // ahí para que no pueda avanzar hasta corregir el carrito.
  if (issues.length > 0 && checkoutState.step > 1) {
    checkoutState.step = 1;
    persistCheckoutState();
  }

  renderCheckoutStep();
}

/* ---------------------------------------------------------
   10. INICIALIZACIÓN
--------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  // Protección de sesión (Fase 3.2): primero se espera la respuesta del servidor.
  // Si no hay usuario autenticado, protectPage() redirige a
  // login.html?redirect=checkout.html y no continúa.
  if (typeof authReady !== "undefined") await authReady;
  if (typeof protectPage === "function" && !protectPage("checkout.html")) return;

  // Fase 3.3: precios y stock vienen de MariaDB; se espera a tenerlos.
  await catalogReady;

  // Si el carrito cambia (ej. el usuario ajustó cantidades en otra pestaña,
  // o desde el drawer), el checkout se vuelve a pintar con datos actuales.
  document.addEventListener("tiendaFronteriza:cartUpdated", renderCheckoutPage);

  // Fase 3.5: si quedó una compra "en curso" (se recargó la página o se perdió la respuesta),
  // se consulta al servidor: si el pedido sí se registró, se muestra su confirmación.
  const pending = readOrderAttempt();
  const session = typeof getSession === "function" ? getSession() : null;
  if (pending && session && pending.userId === session.userId && checkoutState.step !== 4) {
    if (await recoverOrderByKey(pending.key)) return;
  }
  renderCheckoutPage();

});

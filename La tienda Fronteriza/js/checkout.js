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
   8. PASO 3 — REVISIÓN FINAL
--------------------------------------------------------- */

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

    <div class="checkout-step-nav">
      <button type="button" class="btn btn--clear" id="step3BackBtn">Regresar</button>
      <button type="button" class="btn btn--primary" id="continueToPaymentBtn">CONTINUAR AL PAGO</button>
    </div>
  `;
}

function setupStep3() {
  document.getElementById("step3BackBtn")?.addEventListener("click", () => {
    checkoutState.step = 2;
    persistCheckoutState();
    renderCheckoutPage();
  });

  // FASE 7: este botón todavía NO ejecuta ningún pago. La simulación de
  // pago (spinner, número de pedido, vaciar carrito) corresponde a la Fase 8.
  document.getElementById("continueToPaymentBtn")?.addEventListener("click", () => {
    const issues = findStockIssues(getCart());
    if (issues.length > 0) {
      showToast("Corrige las cantidades de tu carrito antes de continuar.");
      renderCheckoutPage();
      return;
    }
  });
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

function renderCheckoutPage() {
  const cart = getCart();

  if (cart.length === 0) {
    renderCheckoutEmptyState();
    return;
  }

  const wrap = document.getElementById("checkoutContent");
  const empty = document.getElementById("checkoutEmptyState");
  if (wrap) wrap.hidden = false;
  if (empty) empty.hidden = true;

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

document.addEventListener("DOMContentLoaded", () => {
  // Protección de sesión: si no hay usuario autenticado, protectPage()
  // redirige a login.html?redirect=checkout.html y no continúa.
  if (typeof protectPage === "function" && !protectPage("checkout.html")) return;

  renderCheckoutPage();

  // Si el carrito cambia (ej. el usuario ajustó cantidades en otra pestaña,
  // o desde el drawer), el checkout se vuelve a pintar con datos actuales.
  document.addEventListener("tiendaFronteriza:cartUpdated", renderCheckoutPage);
});

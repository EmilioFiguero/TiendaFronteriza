/* =========================================================
   TIENDA FRONTERIZA — pedidos.js  (Fase 3.5)
   Historial de pedidos del usuario autenticado (pedidos.html).
   Los datos vienen de MariaDB (api/pedidos.php): el servidor solo
   devuelve los pedidos de la cuenta con sesión iniciada.
   El pago y el envío son simulaciones académicas.
   ========================================================= */

const HIST_ESTADOS = {
  pendiente: "Pendiente de pago (simulado)",
  pagado: "Pagado (simulado)",
  preparado: "Preparado para envío",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const HIST_METODOS = {
  tarjeta: "Tarjeta de crédito/débito (simulado)",
  paypal: "PayPal (simulado)",
  transferencia: "Transferencia bancaria (simulada)",
};

let histPage = 1;

function histEscape(text) {
  const div = document.createElement("div");
  div.textContent = text === null || text === undefined ? "" : String(text);
  // También se escapan las comillas: el resultado se usa dentro de atributos (alt, src, data-*).
  return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function histDate(ms) {
  return new Date(ms).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function histAddress(e) {
  return [
    `${e.calle} ${e.num_exterior}${e.num_interior ? ` Int. ${e.num_interior}` : ""}`,
    e.colonia,
    `${e.ciudad}, ${e.estado}`,
    `C.P. ${e.codigo_postal}`,
  ]
    .filter(Boolean)
    .join(" — ");
}

function histOrderMarkup(p) {
  const units = p.items.reduce((sum, i) => sum + i.cantidad, 0);
  const estado = HIST_ESTADOS[p.estado] || p.estado;
  return `
    <details class="hist-card" data-order="${histEscape(p.numero_pedido)}">
      <summary class="hist-summary">
        <span class="hist-number">${histEscape(p.numero_pedido)}</span>
        <span class="hist-date">${histEscape(histDate(p.creado_en_ms))}</span>
        <span class="hist-status hist-status--${histEscape(p.estado)}">${histEscape(estado)}</span>
        <span class="hist-units">${units} artículo${units === 1 ? "" : "s"}</span>
        <span class="hist-total">${formatMoney(p.total)}</span>
      </summary>
      <div class="hist-detail">
        <div class="review-section">
          <h3>Productos</h3>
          ${p.items
            .map(
              (item) => `
            <div class="review-product">
              <img src="${histEscape(item.imagen)}" alt="${histEscape(item.marca)} ${histEscape(item.nombre)}" loading="lazy" />
              <div class="review-product-info">
                <div class="review-product-name">${histEscape(item.nombre)}</div>
                <div class="review-product-qty">Cantidad: ${item.cantidad} · ${formatMoney(item.precio_unitario)} c/u</div>
              </div>
              <div class="review-product-subtotal">${formatMoney(item.total_linea)}</div>
            </div>`
            )
            .join("")}
        </div>
        <div class="review-section">
          <h3>Envío (simulado)</h3>
          <div class="review-row"><span>Nombre</span><span>${histEscape(p.envio.nombre)}</span></div>
          <div class="review-row"><span>Dirección</span><span>${histEscape(histAddress(p.envio))}</span></div>
          <div class="review-row"><span>Guía (simulada)</span><span>${histEscape(p.guia_envio || "—")}</span></div>
          <div class="review-row"><span>Pago</span><span>${histEscape(HIST_METODOS[p.metodo_pago] || p.metodo_pago)}</span></div>
        </div>
        <div class="review-section">
          <h3>Resumen</h3>
          <div class="review-row"><span>Subtotal</span><span>${formatMoney(p.subtotal)}</span></div>
          <div class="review-row"><span>Impuestos (${Math.round(p.tasa_impuesto * 100)}%)</span><span>${formatMoney(p.impuestos)}</span></div>
          <div class="review-row"><span>Envío${p.zona_envio ? ` (${histEscape(p.zona_envio)})` : ""}</span><span>${p.envio_gratis ? "GRATIS" : formatMoney(p.costo_envio)}</span></div>
          <div class="review-row" style="font-weight:700; font-size:16px; color: var(--color-primary);"><span>TOTAL</span><span>${formatMoney(p.total)}</span></div>
        </div>
      </div>
    </details>`;
}

function histShowMessage(html) {
  const box = document.getElementById("histMessage");
  const list = document.getElementById("histList");
  const pager = document.getElementById("histPager");
  if (list) list.hidden = true;
  if (pager) pager.hidden = true;
  if (box) {
    box.innerHTML = html;
    box.hidden = false;
  }
}

async function loadOrderHistory(page) {
  histShowMessage("<p>Cargando tus pedidos…</p>");
  const res = await apiRequest(`pedidos.php?pagina=${encodeURIComponent(page)}`);

  if (res.status === 401) {
    if (typeof fetchSession === "function") await fetchSession();
    if (typeof notifySessionChanged === "function") notifySessionChanged();
    protectPage("pedidos.html");
    return;
  }
  if (!res.ok || !Array.isArray(res.data.pedidos)) {
    histShowMessage(
      `<p>No se pudo cargar tu historial. Revisa que Apache y MySQL estén iniciados e inténtalo de nuevo.</p>
       <button type="button" class="btn btn--primary btn--small" id="histRetry">Reintentar</button>`
    );
    document.getElementById("histRetry")?.addEventListener("click", () => loadOrderHistory(histPage));
    return;
  }

  histPage = res.data.pagina;
  if (res.data.total === 0) {
    histShowMessage(
      `<h3>Aún no tienes pedidos</h3>
       <p>Cuando completes una compra aparecerá aquí.</p>
       <a href="index.html" class="btn btn--primary">Explorar productos</a>`
    );
    return;
  }

  const box = document.getElementById("histMessage");
  const list = document.getElementById("histList");
  const pager = document.getElementById("histPager");
  if (box) box.hidden = true;
  if (list) {
    list.innerHTML = res.data.pedidos.map(histOrderMarkup).join("");
    list.hidden = false;
  }
  if (pager) {
    pager.hidden = res.data.paginas <= 1;
    pager.innerHTML = `
      <button type="button" class="btn btn--clear btn--small" data-hist-page="${histPage - 1}" ${histPage <= 1 ? "disabled" : ""}>← Más recientes</button>
      <span>Página ${histPage} de ${res.data.paginas}</span>
      <button type="button" class="btn btn--clear btn--small" data-hist-page="${histPage + 1}" ${histPage >= res.data.paginas ? "disabled" : ""}>Más antiguos →</button>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Protección de sesión (Fase 3.2): se espera la respuesta del servidor.
  if (typeof authReady !== "undefined") await authReady;
  if (typeof protectPage === "function" && !protectPage("pedidos.html")) return;

  document.getElementById("histPager")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-hist-page]");
    if (btn && !btn.disabled) loadOrderHistory(Number(btn.dataset.histPage));
  });
  loadOrderHistory(1);
});

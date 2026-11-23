"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const f = { q: "", stock: "", estado: "", pagina: 1 };
  const h = { producto: null, tipo: "", pagina: 1 };
  let umbral = 2;

  const aviso = el("p", { class: "admin-msg", role: "status" });
  const umbralIn = el("input", { class: "admin-input", style: "min-width:90px;width:90px", inputmode: "numeric", "aria-label": "Umbral de stock bajo" });
  const umbralBox = el("section", { class: "admin-card" }, el("h2", { text: "Umbral de stock bajo" }),
    el("div", { class: "admin-inline" }, campo("Un producto cuenta como «stock bajo» cuando tiene de 1 hasta…", umbralIn, "unidades (de 1 a 100)", "umbral"),
      el("button", { class: "btn btn--primary btn--small", type: "button", text: "Guardar umbral", onclick: guardarUmbral })));
  const q = el("input", { type: "search", class: "admin-input admin-grow", placeholder: "Buscar por nombre o código", maxlength: "80", "aria-label": "Buscar" });
  const selStk = el("select", { class: "admin-input", "aria-label": "Existencias" }, el("option", { value: "", text: "Todas las existencias" }), el("option", { value: "bajo", text: "Stock bajo" }), el("option", { value: "agotado", text: "Agotados" }), el("option", { value: "ok", text: "Normal" }));
  const selEst = el("select", { class: "admin-input", "aria-label": "Estado" }, el("option", { value: "", text: "Activos e inactivos" }), el("option", { value: "activo", text: "Solo activos" }), el("option", { value: "inactivo", text: "Solo inactivos" }));
  const ajusteBox = el("div", {});
  const lista = el("div", {});
  const histFiltros = el("div", { class: "admin-toolbar" });
  const histLista = el("div", {});
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); f.pagina = 1; cargar(); }, 300); });
  selStk.addEventListener("change", () => { f.stock = selStk.value; f.pagina = 1; cargar(); });
  selEst.addEventListener("change", () => { f.estado = selEst.value; f.pagina = 1; cargar(); });
  c.replaceChildren(umbralBox, el("h2", { class: "admin-section-title", text: "Existencias" }), el("div", { class: "admin-toolbar" }, q, selStk, selEst), aviso, ajusteBox, lista,
    el("h2", { class: "admin-section-title", text: "Historial de movimientos" }), histFiltros, histLista);

  function mensaje(txt, ok) { aviso.className = "admin-msg " + (ok ? "is-ok" : "is-err"); aviso.textContent = txt; }

  async function guardarUmbral() {
    const v = umbralIn.value.trim();
    const r = await adminFetch("admin/configuracion.php", { method: "POST", body: { umbral_stock_bajo: /^\d{1,3}$/.test(v) ? Number(v) : v } });
    if (!r.ok && adminErrorGlobal(r)) return;
    mensaje(r.ok ? r.data.mensaje : textoError(r), r.ok);
    if (r.ok) cargar();
  }

  async function cargar() {
    const qs = new URLSearchParams({ q: f.q, stock: f.stock, estado: f.estado, orden: "stock", pagina: String(f.pagina) });
    const r = await adminFetch("admin/inventario.php?" + qs);
    if (!r.ok) { if (!adminErrorGlobal(r)) lista.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    umbral = r.data.umbral_stock_bajo; umbralIn.value = String(umbral);
    f.pagina = r.data.pagina;
    if (!r.data.productos.length) { lista.replaceChildren(el("p", { class: "admin-muted", text: "No hay productos con esos filtros." })); return; }
    lista.replaceChildren(
      el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["", "Código", "Producto", "Existencias", "Estado", ""].map((x) => el("th", { text: x })))),
        el("tbody", {}, r.data.productos.map((p) => el("tr", {},
          el("td", {}, el("img", { class: "admin-thumb", src: "../" + p.imagen, alt: "", loading: "lazy" })),
          el("td", { text: p.codigo }), el("td", { text: p.nombre }), el("td", {}, tagStock(p.estado_stock, p.stock)),
          el("td", {}, el("span", { class: "admin-tag " + (p.activo ? "admin-tag--pagado" : "admin-tag--inactivo"), text: p.activo ? "Activo" : "Inactivo" })),
          el("td", { class: "admin-actions" },
            el("button", { class: "btn btn--primary btn--small", type: "button", text: "Ajustar", onclick: () => abrirAjuste(p) }),
            el("button", { class: "btn btn--clear btn--small", type: "button", text: "Historial", onclick: () => { h.producto = p; h.pagina = 1; cargarHist(); histFiltros.scrollIntoView({ behavior: "smooth" }); } })))))),
      pagina(r.data, (n) => { f.pagina = n; cargar(); }));
  }

  function abrirAjuste(p) {
    const tipo = el("select", { class: "admin-input" }, el("option", { value: "entrada", text: "Entrada (sumar unidades)" }), el("option", { value: "salida", text: "Salida (restar unidades: merma, daño, etc.)" }), el("option", { value: "ajuste", text: "Ajuste (fijar las existencias finales)" }));
    const cant = el("input", { class: "admin-input", inputmode: "numeric", placeholder: "0" });
    const motivo = el("input", { class: "admin-input", maxlength: "200", placeholder: "Ej. Conteo físico, llegada de mercancía, producto dañado" });
    const msg = el("p", { class: "admin-msg", role: "status" });
    const etiqueta = campo("Cantidad", cant, null, "cantidad");
    tipo.addEventListener("change", () => { etiqueta.querySelector(".admin-field-l").textContent = tipo.value === "ajuste" ? "Existencias finales" : "Cantidad"; });
    const form = el("form", { class: "admin-form", novalidate: "" }, campo("Tipo de movimiento", tipo, null, "tipo"), etiqueta,
      el("div", { class: "is-wide" }, campo("Motivo (obligatorio)", motivo, "3 a 200 caracteres. Queda en el historial y en la auditoría.", "motivo")),
      el("div", { class: "admin-form-actions is-wide" }, el("button", { class: "btn btn--primary", type: "submit", text: "Registrar movimiento" }), el("button", { class: "btn btn--clear", type: "button", text: "Cancelar", onclick: () => ajusteBox.replaceChildren() })), msg);
    ajusteBox.replaceChildren(el("section", { class: "admin-card" }, el("h2", { text: `Ajustar: ${p.nombre} (${p.codigo})` }), el("p", { class: "admin-muted", text: `Existencias actuales: ${p.stock}` }), form));
    ajusteBox.scrollIntoView({ behavior: "smooth", block: "start" });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); marcarErrores(form, null);
      const v = cant.value.trim();
      const r = await adminFetch("admin/inventario_ajustar.php", { method: "POST", body: { producto_id: p.id, tipo: tipo.value, cantidad: /^\d{1,7}$/.test(v) ? Number(v) : v, stock_esperado: p.stock, motivo: motivo.value } });
      if (!r.ok) {
        if (adminErrorGlobal(r)) return;
        marcarErrores(form, r.data.errores); msg.className = "admin-msg is-err"; msg.textContent = r.data.errores ? "Revisa los campos marcados." : textoError(r);
        if (r.data.codigo === "existencias_cambiaron") cargar();
        return;
      }
      mensaje(`${p.nombre}: ${r.data.mensaje}`, true); ajusteBox.replaceChildren(); cargar(); cargarHist();
    });
  }

  const selTipo = el("select", { class: "admin-input", "aria-label": "Tipo de movimiento" }, el("option", { value: "", text: "Todos los tipos" }),
    ...[["inicial", "Inicial"], ["venta", "Venta"], ["entrada", "Entrada"], ["salida", "Salida"], ["ajuste", "Ajuste"], ["cancelacion", "Cancelación"]].map(([v, t2]) => el("option", { value: v, text: t2 })));
  selTipo.addEventListener("change", () => { h.tipo = selTipo.value; h.pagina = 1; cargarHist(); });

  async function cargarHist() {
    histFiltros.replaceChildren(selTipo, h.producto ? el("span", { class: "admin-chip" }, `${h.producto.codigo} · ${h.producto.nombre}`, el("button", { type: "button", "aria-label": "Quitar filtro de producto", text: "×", onclick: () => { h.producto = null; h.pagina = 1; cargarHist(); } })) : el("span", { class: "admin-muted", text: "Todos los productos (usa «Historial» en una fila para filtrar)." }));
    const qs = new URLSearchParams({ tipo: h.tipo, pagina: String(h.pagina) });
    if (h.producto) qs.set("producto_id", String(h.producto.id));
    const r = await adminFetch("admin/inventario_movimientos.php?" + qs);
    if (!r.ok) { if (!adminErrorGlobal(r)) histLista.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    h.pagina = r.data.pagina;
    if (!r.data.movimientos.length) { histLista.replaceChildren(el("p", { class: "admin-muted", text: "Sin movimientos." })); return; }
    histLista.replaceChildren(el("table", { class: "admin-table" },
      el("thead", {}, el("tr", {}, ["Fecha", "Producto", "Tipo", "Cambio", "Antes → después", "Motivo / pedido", "Responsable"].map((x, i) => el("th", { class: i === 3 ? "num" : "", text: x })))),
      el("tbody", {}, r.data.movimientos.map((m) => el("tr", {},
        el("td", { text: fecha(m.creado_en_ms) }), el("td", { text: `${m.producto} (${m.codigo})` }),
        el("td", {}, el("span", { class: "admin-tag admin-tag--mov-" + m.tipo, text: m.tipo })),
        el("td", { class: "num " + (m.cantidad > 0 ? "is-pos" : "is-neg"), text: (m.cantidad > 0 ? "+" : "") + m.cantidad }),
        el("td", { text: `${m.stock_anterior} → ${m.stock_nuevo}` }),
        el("td", { text: m.numero_pedido ? `Pedido ${m.numero_pedido}` : m.motivo || "" }), el("td", { text: m.responsable }))))),
      pagina(r.data, (n) => { h.pagina = n; cargarHist(); }));
  }
  cargar(); cargarHist();
})();

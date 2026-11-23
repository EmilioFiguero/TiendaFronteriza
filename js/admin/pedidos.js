/* Panel administrativo — Pedidos (Fase 3.6.3).
   Seguridad: aquí solo se decide QUÉ SE MUESTRA. El servidor valida rol, CSRF, transiciones y reposición de existencias.
   Todo texto del servidor se pinta con textContent (a través de el()), nunca como HTML. */
"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const f = { q: "", estado: "", metodo: "", desde: "", hasta: "", orden: "recientes", pagina: 1 };
  const ACCION = { pagado: "Confirmar pago (simulado)", preparado: "Marcar como preparado", enviado: "Marcar como enviado", entregado: "Marcar como entregado" };
  let ocupado = false;

  const aviso = el("p", { class: "admin-msg", role: "status" });
  const q = el("input", { type: "search", class: "admin-input admin-grow", placeholder: "Buscar por pedido, cliente o correo", maxlength: "80", "aria-label": "Buscar pedidos" });
  const selMet = el("select", { class: "admin-input", "aria-label": "Método de pago" }, el("option", { value: "", text: "Todos los métodos" }), ...Object.entries(METODOS_PED).map(([v, t]) => el("option", { value: v, text: t })));
  const selOrd = el("select", { class: "admin-input", "aria-label": "Ordenar" }, el("option", { value: "recientes", text: "Más recientes" }), el("option", { value: "antiguos", text: "Más antiguos" }), el("option", { value: "total_desc", text: "Total: mayor a menor" }), el("option", { value: "total_asc", text: "Total: menor a mayor" }));
  const desde = el("input", { type: "date", class: "admin-input", "aria-label": "Desde" });
  const hasta = el("input", { type: "date", class: "admin-input", "aria-label": "Hasta" });
  const chips = el("div", { class: "admin-chips", role: "group", "aria-label": "Filtrar por estado" });
  const detalle = el("div", {});
  const lista = el("div", {});
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); f.pagina = 1; cargar(); }, 300); });
  selMet.addEventListener("change", () => { f.metodo = selMet.value; f.pagina = 1; cargar(); });
  selOrd.addEventListener("change", () => { f.orden = selOrd.value; f.pagina = 1; cargar(); });
  desde.addEventListener("change", () => { f.desde = desde.value; f.pagina = 1; cargar(); });
  hasta.addEventListener("change", () => { f.hasta = hasta.value; f.pagina = 1; cargar(); });
  const limpiar = el("button", { class: "btn btn--clear btn--small", type: "button", text: "Limpiar filtros", onclick: () => {
    Object.assign(f, { q: "", estado: "", metodo: "", desde: "", hasta: "", orden: "recientes", pagina: 1 });
    q.value = ""; selMet.value = ""; selOrd.value = "recientes"; desde.value = ""; hasta.value = ""; cargar();
  } });
  c.replaceChildren(
    el("p", { class: "admin-muted admin-note", text: "Pagos y envíos son simulaciones académicas: ningún pedido generó un cobro real ni un envío físico." }),
    el("div", { class: "admin-toolbar" }, q, selMet, el("label", { class: "admin-muted" }, "Desde ", desde), el("label", { class: "admin-muted" }, "Hasta ", hasta), selOrd, limpiar),
    chips, aviso, detalle, lista);

  function mensaje(txt, ok) { aviso.className = "admin-msg " + (ok ? "is-ok" : "is-err"); aviso.textContent = txt; }

  function pintarChips(conteos) {
    const total = Object.values(conteos).reduce((a, b) => a + b, 0);
    const defs = [["", "Todos", total], ...Object.keys(ESTADOS_PED).map((e) => [e, ESTADOS_PED[e], conteos[e] || 0])];
    chips.replaceChildren(...defs.map(([v, txt, n]) => el("button", { type: "button", class: "admin-fchip" + (f.estado === v ? " is-active" : ""), "aria-pressed": f.estado === v ? "true" : "false",
      onclick: () => { f.estado = v; f.pagina = 1; cargar(); } }, txt, el("b", { text: String(n) }))));
  }

  async function cargar() {
    const qs = new URLSearchParams({ q: f.q, estado: f.estado, metodo: f.metodo, desde: f.desde, hasta: f.hasta, orden: f.orden, pagina: String(f.pagina) });
    const r = await adminFetch("admin/pedidos.php?" + qs);
    if (!r.ok) { if (!adminErrorGlobal(r)) { lista.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); } return; }
    f.pagina = r.data.pagina;
    pintarChips(r.data.conteos);
    if (!r.data.pedidos.length) { lista.replaceChildren(el("p", { class: "admin-muted", text: "No hay pedidos con esos filtros." })); return; }
    lista.replaceChildren(
      el("div", { class: "admin-card" }, el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["Pedido", "Fecha", "Cliente", "Pago", "Artículos", "Total", "Estado", ""].map((x) => el("th", { text: x })))),
        el("tbody", {}, r.data.pedidos.map((p) => el("tr", {},
          el("td", { style: "white-space:nowrap", text: p.numero_pedido }), el("td", { style: "white-space:nowrap", text: fecha(p.creado_en_ms) }),
          el("td", {}, p.cliente, el("br"), el("small", { class: "admin-muted", text: p.correo })),
          el("td", { text: METODOS_PED[p.metodo_pago] || p.metodo_pago }), el("td", { class: "num", text: String(p.unidades) }),
          el("td", { class: "num", text: money(p.total) }), el("td", {}, tagPedido(p.estado)),
          el("td", { class: "admin-actions" }, el("button", { class: "btn btn--primary btn--small", type: "button", text: "Ver detalle", onclick: () => abrir(p.numero_pedido, true) }))))))),
      pagina(r.data, (n) => { f.pagina = n; cargar(); }));
  }

  async function abrir(numero, desplazar) {
    const r = await adminFetch("admin/pedido.php?numero=" + encodeURIComponent(numero));
    if (!r.ok) { if (!adminErrorGlobal(r)) mensaje(textoError(r, "No se pudo cargar el pedido."), false); return; }
    pintarDetalle(r.data.pedido);
    if (desplazar) detalle.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pintarDetalle(p) {
    const e = p.envio;
    const direccion = `${e.calle} ${e.num_exterior}${e.num_interior ? " Int. " + e.num_interior : ""}, ${e.colonia}, ${e.ciudad}, ${e.estado}, C.P. ${e.codigo_postal}`;
    const avanzar = p.siguientes.filter((s) => s !== "cancelado");
    const motivo = el("input", { class: "admin-input", maxlength: "200", placeholder: "Opcional" });
    const zonaAcc = el("div", {});

    const barra = avanzar.length || p.cancelable
      ? el("div", { class: "admin-actions-bar" },
          avanzar.length ? campo("Nota del cambio de estado", motivo, "Se guarda en el historial (hasta 200 caracteres).", "motivo") : null,
          ...avanzar.map((s) => el("button", { class: "btn btn--primary btn--small", type: "button", text: ACCION[s], onclick: (ev) => cambiar(p, s, motivo.value, ev.currentTarget) })),
          p.cancelable ? el("button", { class: "btn btn--danger btn--small", type: "button", text: "Cancelar pedido", onclick: () => formularioCancelar(p, zonaAcc) }) : null)
      : el("p", { class: "admin-muted", text: p.estado === "cancelado" ? "Pedido cancelado: no admite más cambios." : "Pedido entregado: no admite más cambios." });

    detalle.replaceChildren(el("section", { class: "admin-card", "aria-label": "Detalle del pedido " + p.numero_pedido },
      el("div", { class: "admin-detail-head" }, el("h2", { text: "Pedido " + p.numero_pedido }), el("span", {}, tagPedido(p.estado), " ",
        el("button", { class: "btn btn--clear btn--small", type: "button", text: "Cerrar", onclick: () => { detalle.replaceChildren(); history.replaceState(null, "", "pedidos.html"); } }))),
      el("div", { class: "admin-detail-cols" },
        el("div", {}, el("h3", { text: "Cliente y envío" }), el("dl", { class: "admin-dl" },
          el("dt", { text: "Cuenta" }), el("dd", { text: `${p.cuenta.nombre} (${p.cuenta.correo})${p.cuenta.activa ? "" : " — cuenta inactiva"}` }),
          el("dt", { text: "Recibe" }), el("dd", { text: e.nombre }), el("dt", { text: "Teléfono" }), el("dd", { text: e.telefono }),
          el("dt", { text: "Correo" }), el("dd", { text: e.correo }), el("dt", { text: "Dirección" }), el("dd", { text: direccion }),
          el("dt", { text: "Zona de envío" }), el("dd", { text: p.zona_envio || "—" }), el("dt", { text: "Guía (simulada)" }), el("dd", { text: p.guia_envio || "—" }))),
        el("div", {}, el("h3", { text: "Pedido" }), el("dl", { class: "admin-dl" },
          el("dt", { text: "Fecha" }), el("dd", { text: fecha(p.creado_en_ms) }), el("dt", { text: "Método de pago" }), el("dd", { text: METODOS_PED[p.metodo_pago] || p.metodo_pago }),
          el("dt", { text: "Estado" }), el("dd", { text: ESTADOS_PED[p.estado] || p.estado })))),
      el("h3", { text: "Productos (precios del momento de la compra)" }),
      el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["Código", "Producto", "Cantidad", "Precio", "Importe"].map((x) => el("th", { text: x })))),
        el("tbody", {}, p.items.map((i) => el("tr", {}, el("td", { text: i.codigo }), el("td", { text: `${i.marca} · ${i.nombre}` }), el("td", { class: "num", text: String(i.cantidad) }), el("td", { class: "num", text: money(i.precio_unitario) }), el("td", { class: "num", text: money(i.total_linea) }))))),
      el("div", { class: "admin-totals" },
        el("div", {}, el("span", { text: "Subtotal" }), el("span", { text: money(p.subtotal) })),
        el("div", {}, el("span", { text: `Impuestos (${Math.round(p.tasa_impuesto * 100)}%)` }), el("span", { text: money(p.impuestos) })),
        el("div", {}, el("span", { text: "Envío" }), el("span", { text: p.envio_gratis ? "GRATIS" : money(p.costo_envio) })),
        el("div", { class: "is-total" }, el("span", { text: "Total" }), el("span", { text: money(p.total) }))),
      el("div", { class: "admin-detail-cols", style: "margin-top:16px" },
        el("div", {}, el("h3", { text: "Historial de estados" }), el("ul", { class: "admin-timeline" }, p.historial.map((h) =>
          el("li", {}, h.anterior ? `${ESTADOS_PED[h.anterior]} → ${ESTADOS_PED[h.nuevo]}` : `Pedido registrado: ${ESTADOS_PED[h.nuevo]}`,
            el("small", { text: `${fecha(h.fecha_ms)} · ${h.quien}${h.motivo ? " · " + h.motivo : ""}` }))))),
        el("div", {}, el("h3", { text: "Movimientos de inventario del pedido" }), p.movimientos.length
          ? el("ul", { class: "admin-timeline" }, p.movimientos.map((m) => el("li", {}, `${m.tipo === "venta" ? "Venta" : "Cancelación (reposición)"}: ${m.codigo} · ${m.producto}`,
              el("small", { text: `${m.cantidad > 0 ? "+" : ""}${m.cantidad} unidades (${m.antes} → ${m.despues}) · ${fecha(m.fecha_ms)}` }))))
          : el("p", { class: "admin-muted", text: "Este pedido no tiene movimientos registrados (se creó antes del control de inventario)." }))),
      barra, zonaAcc));
  }

  function formularioCancelar(p, zona) {
    const motivo = el("textarea", { class: "admin-input", maxlength: "200", rows: "3", placeholder: "Por qué se cancela (3 a 200 caracteres)" });
    const unidades = p.items.reduce((a, i) => a + i.cantidad, 0);
    zona.replaceChildren(el("div", { class: "admin-danger-box", role: "alertdialog", "aria-label": "Confirmar cancelación" },
      el("strong", { text: `Cancelar el pedido ${p.numero_pedido}` }),
      el("p", { text: `Se repondrán ${unidades} unidad(es) al inventario y el pedido quedará cancelado. Sus importes no cambian. Esta acción no se puede deshacer.` }),
      campo("Motivo de la cancelación (obligatorio)", motivo, null, "motivo"),
      el("div", { class: "admin-form-actions" },
        el("button", { class: "btn btn--danger btn--small", type: "button", text: "Confirmar cancelación", onclick: (ev) => cancelar(p, motivo.value, ev.currentTarget, zona) }),
        el("button", { class: "btn btn--clear btn--small", type: "button", text: "Volver", onclick: () => zona.replaceChildren() }))));
    motivo.focus();
  }

  async function ejecutar(boton, p, endpoint, body, zona) {
    if (ocupado) return;
    ocupado = true; boton.disabled = true;
    try {
      const r = await adminFetch(endpoint, { method: "POST", body });
      if (!r.ok && adminErrorGlobal(r)) return;
      if (r.ok) { mensaje(r.data.mensaje, true); pintarDetalle(r.data.pedido); cargar(); return; }
      if (r.status === 422 && zona) marcarErrores(zona, r.data.errores);
      mensaje(textoError(r), false);
      if (r.status === 409) { await abrir(p.numero_pedido, false); cargar(); }   // el pedido cambió: se muestra su estado actual
    } finally { ocupado = false; boton.disabled = false; }
  }
  function cambiar(p, nuevo, motivo, boton) {
    return ejecutar(boton, p, "admin/pedido_estado.php", { numero_pedido: p.numero_pedido, estado_esperado: p.estado, estado_nuevo: nuevo, motivo: motivo.trim() }, null);
  }
  function cancelar(p, motivo, boton, zona) {
    return ejecutar(boton, p, "admin/pedido_cancelar.php", { numero_pedido: p.numero_pedido, estado_esperado: p.estado, motivo: motivo.trim() }, zona);
  }

  await cargar();
  const n = new URLSearchParams(location.search).get("numero");
  if (n && /^TF-[0-9]{6}$/.test(n)) abrir(n, true);
})();

/* Panel administrativo — Promociones (Fase 3.6.4): cupones (SOLO administración y simulación) y ofertas por precio anterior.
   El servidor valida rol, CSRF y reglas. Todo texto se pinta con textContent (a través de el()). */
"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const TXT = { vigente: "Vigente", programado: "Programado", vencido: "Vencido", inactivo: "Inactivo" };
  const OF = { ok: "Oferta activa", incompleta: "Incompleta", huerfana: "Precio anterior sin oferta", sin_oferta: "Sin oferta" };
  const fc = { q: "", estado: "", pagina: 1 };
  const fo = { q: "", estado: "", pagina: 1 };
  const aviso = el("p", { class: "admin-msg", role: "status" });
  const msg = (t, ok) => { aviso.className = "admin-msg " + (ok ? "is-ok" : "is-err"); aviso.textContent = t; };
  const zonaForm = el("div", {}), zonaCup = el("div", {}), zonaOf = el("div", {});
  const chipsC = el("div", { class: "admin-chips", role: "group", "aria-label": "Filtrar cupones" });
  const chipsO = el("div", { class: "admin-chips", role: "group", "aria-label": "Filtrar ofertas" });
  const qC = el("input", { type: "search", class: "admin-input admin-grow", placeholder: "Buscar cupón por código o descripción", maxlength: "80", "aria-label": "Buscar cupones" });
  const qO = el("input", { type: "search", class: "admin-input admin-grow", placeholder: "Buscar producto por nombre o código", maxlength: "80", "aria-label": "Buscar productos" });
  let tC, tO;
  qC.addEventListener("input", () => { clearTimeout(tC); tC = setTimeout(() => { fc.q = qC.value.trim(); fc.pagina = 1; cargarCupones(); }, 300); });
  qO.addEventListener("input", () => { clearTimeout(tO); tO = setTimeout(() => { fo.q = qO.value.trim(); fo.pagina = 1; cargarOfertas(); }, 300); });

  c.replaceChildren(
    el("h2", { class: "admin-section-title", text: "Cupones" }),
    el("p", { class: "admin-banner", text: "Los cupones son una función administrativa y de simulación: todavía no se aplican a compras. Crearlos, editarlos o simularlos no cambia carritos, pedidos ni importes." }),
    aviso,
    el("div", { class: "admin-toolbar" }, qC, el("button", { class: "btn btn--primary btn--small", type: "button", text: "Nuevo cupón", onclick: () => formulario(null) })),
    chipsC, zonaForm, zonaCup,
    el("h2", { class: "admin-section-title", text: "Ofertas de productos" }),
    el("p", { class: "admin-muted admin-note", text: "Una oferta solo muestra el precio anterior tachado en el catálogo. No cambia el precio de venta del producto ni los pedidos ya hechos. El precio anterior debe ser mayor al precio actual." }),
    el("div", { class: "admin-toolbar" }, qO), chipsO, zonaOf);

  function chips(cont, conteos, textos, f, recargar) {
    const total = Object.values(conteos).reduce((a, b) => a + b, 0);
    cont.replaceChildren(...[["", "Todos", total], ...Object.keys(textos).map((k) => [k, textos[k], conteos[k] || 0])].map(([v, t, n]) =>
      el("button", { type: "button", class: "admin-fchip" + (f.estado === v ? " is-active" : ""), "aria-pressed": f.estado === v ? "true" : "false", onclick: () => { f.estado = v; f.pagina = 1; recargar(); } }, t, el("b", { text: String(n) }))));
  }
  const valorTxt = (x) => x.tipo === "porcentaje" ? `${x.valor}%` : money(x.valor);

  async function cargarCupones() {
    const r = await adminFetch("admin/cupones.php?" + new URLSearchParams({ q: fc.q, estado: fc.estado, pagina: String(fc.pagina) }));
    if (!r.ok) { if (!adminErrorGlobal(r)) zonaCup.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    fc.pagina = r.data.pagina;
    chips(chipsC, r.data.conteos, TXT, fc, cargarCupones);
    if (!r.data.cupones.length) { zonaCup.replaceChildren(el("p", { class: "admin-muted", text: "No hay cupones con esos filtros." })); return; }
    zonaCup.replaceChildren(
      el("div", { class: "admin-card" }, el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["Código", "Descripción", "Descuento", "Compra mínima", "Vigencia", "Estado", ""].map((x) => el("th", { text: x })))),
        el("tbody", {}, r.data.cupones.map((x) => el("tr", {},
          el("td", { style: "white-space:nowrap", text: x.codigo }), el("td", { text: x.descripcion }),
          el("td", {}, valorTxt(x), x.tope_descuento ? el("br") : null, x.tope_descuento ? el("small", { class: "admin-muted", text: "tope " + money(x.tope_descuento) }) : null),
          el("td", { class: "num", text: money(x.compra_minima) }),
          el("td", { text: (x.inicia || "…") + " a " + (x.termina || "sin fin") }),
          el("td", {}, el("span", { class: "admin-tag admin-tag--" + x.estado, text: TXT[x.estado] })),
          el("td", { class: "admin-actions" },
            el("button", { class: "btn btn--clear btn--small", type: "button", text: "Editar", onclick: () => formulario(x) }),
            el("button", { class: "btn btn--clear btn--small", type: "button", text: "Simular", onclick: () => simulador(x) }),
            el("button", { class: "btn btn--clear btn--small", type: "button", text: x.activo ? "Desactivar" : "Activar", onclick: () => cambiar(x) }))))))),
      pagina(r.data, (n) => { fc.pagina = n; cargarCupones(); }));
  }

  async function cambiar(x) {
    const r = await adminFetch("admin/cupon_estado.php", { method: "POST", body: { id: x.id, activo: !x.activo } });
    if (!r.ok) { if (!adminErrorGlobal(r)) msg(textoError(r), false); return; }
    msg(`Cupón ${x.codigo} ${x.activo ? "desactivado" : "activado"}.`, true); cargarCupones();
  }

  function simulador(x) {
    const sub = el("input", { class: "admin-input", type: "text", inputmode: "decimal", placeholder: "Ej. 1200.00", "aria-label": "Subtotal a simular" });
    const out = el("p", { class: "admin-sim-out", role: "status" });
    zonaForm.replaceChildren(el("div", { class: "admin-card" }, el("h3", { text: `Simular cupón ${x.codigo}` }),
      el("p", { class: "admin-muted", text: "Solo calcula: no se aplica a ninguna compra ni se guarda nada." }),
      el("div", { class: "admin-sim" }, campo("Subtotal de la compra (MXN, antes de IVA y envío)", sub, null, "subtotal"),
        el("button", { class: "btn btn--primary btn--small", type: "button", text: "Calcular", onclick: async () => {
          const r = await adminFetch("admin/cupon_simular.php", { method: "POST", body: { id: x.id, subtotal: sub.value.trim() } });
          if (!r.ok) { if (!adminErrorGlobal(r)) out.textContent = textoError(r); return; }
          const d = r.data;
          out.textContent = d.valido ? `Descuento simulado: ${money(d.descuento)} → subtotal con descuento ${money(d.subtotal_con_descuento)}.` : `No aplicaría: ${d.motivo}`;
        } }),
        el("button", { class: "btn btn--clear btn--small", type: "button", text: "Cerrar", onclick: () => zonaForm.replaceChildren() })), out));
    zonaForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formulario(x) {
    const ed = !!x;
    const i = (n, attrs) => el("input", Object.assign({ class: "admin-input", "data-n": n }, attrs));
    const codigo = i("codigo", { maxlength: "20", value: ed ? x.codigo : "", disabled: ed ? "" : false });
    const desc = i("descripcion", { maxlength: "200", value: ed ? x.descripcion : "" });
    const tipo = el("select", { class: "admin-input" }, el("option", { value: "porcentaje", text: "Porcentaje (%)" }), el("option", { value: "monto_fijo", text: "Monto fijo (MXN)" }));
    if (ed) tipo.value = x.tipo;
    const valor = i("valor", { inputmode: "decimal", value: ed ? String(x.valor) : "" });
    const minima = i("compra_minima", { inputmode: "decimal", value: ed ? String(x.compra_minima) : "0" });
    const tope = i("tope_descuento", { inputmode: "decimal", value: ed && x.tope_descuento ? String(x.tope_descuento) : "" });
    const usos = i("usos_maximos", { inputmode: "numeric", value: ed && x.usos_maximos ? String(x.usos_maximos) : "" });
    const ini = i("inicia", { type: "date", value: ed && x.inicia ? x.inicia : "" });
    const fin = i("termina", { type: "date", value: ed && x.termina ? x.termina : "" });
    const act = el("input", { type: "checkbox" }); act.checked = ed ? x.activo : true;
    const caja = el("div", { class: "admin-card" });
    const guardar = async () => {
      const b = { descripcion: desc.value.trim(), tipo: tipo.value, valor: valor.value.trim(), compra_minima: minima.value.trim(), tope_descuento: tope.value.trim() || null,
        usos_maximos: usos.value.trim() || null, inicia: ini.value || null, termina: fin.value || null, activo: act.checked };
      if (ed) b.id = x.id; else b.codigo = codigo.value.trim();
      const r = await adminFetch(ed ? "admin/cupon_editar.php" : "admin/cupon_crear.php", { method: "POST", body: b });
      if (!r.ok) { if (adminErrorGlobal(r)) return; marcarErrores(caja, r.data.errores); msg(textoError(r), false); return; }
      msg(ed ? "Cupón actualizado." : "Cupón creado.", true); zonaForm.replaceChildren(); cargarCupones();
    };
    caja.append(el("h3", { text: ed ? `Editar cupón ${x.codigo}` : "Nuevo cupón (administrativo, sin aplicar a compras)" }),
      el("div", { class: "admin-form-grid" },
        campo("Código", codigo, ed ? "El código no se puede cambiar." : "3 a 20: letras, números, guion o guion bajo.", "codigo"),
        campo("Descripción", desc, null, "descripcion"), campo("Tipo", tipo, null, "tipo"), campo("Valor", valor, "Porcentaje (máx. 100) o importe en MXN.", "valor"),
        campo("Compra mínima (MXN)", minima, "0 = sin mínimo.", "compra_minima"), campo("Tope de descuento (MXN)", tope, "Solo porcentaje; opcional.", "tope_descuento"),
        campo("Usos máximos", usos, "Opcional.", "usos_maximos"), campo("Inicia", ini, "Opcional.", "inicia"), campo("Termina", fin, "Opcional; incluye todo ese día.", "termina")),
      el("label", { class: "admin-check" }, act, " Activo"),
      el("div", { class: "admin-form-actions" }, el("button", { class: "btn btn--primary", type: "button", text: ed ? "Guardar cambios" : "Crear cupón", onclick: guardar }),
        el("button", { class: "btn btn--clear", type: "button", text: "Cancelar", onclick: () => zonaForm.replaceChildren() })));
    zonaForm.replaceChildren(caja);
    zonaForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function cargarOfertas() {
    const r = await adminFetch("admin/ofertas.php?" + new URLSearchParams({ q: fo.q, estado: fo.estado, pagina: String(fo.pagina) }));
    if (!r.ok) { if (!adminErrorGlobal(r)) zonaOf.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    fo.pagina = r.data.pagina;
    chips(chipsO, r.data.conteos, OF, fo, cargarOfertas);
    if (!r.data.productos.length) { zonaOf.replaceChildren(el("p", { class: "admin-muted", text: "No hay productos con esos filtros." })); return; }
    zonaOf.replaceChildren(
      el("div", { class: "admin-card" }, el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["Producto", "Precio de venta", "Precio anterior (tachado)", "Descuento", "Estado", ""].map((x) => el("th", { text: x })))),
        el("tbody", {}, r.data.productos.map((p) => {
          const inp = el("input", { class: "admin-input", inputmode: "decimal", style: "max-width:130px", "aria-label": "Precio anterior de " + p.nombre, value: p.precio_anterior != null ? String(p.precio_anterior) : "" });
          const guardar = async (quitar) => {
            const r2 = await adminFetch("admin/oferta_guardar.php", { method: "POST", body: { producto_id: p.id, precio_anterior: quitar ? null : inp.value.trim() } });
            if (!r2.ok) { if (!adminErrorGlobal(r2)) msg(textoError(r2), false); return; }
            msg(quitar ? `Oferta quitada de ${p.nombre}.` : `Oferta guardada en ${p.nombre}.`, true); cargarOfertas();
          };
          return el("tr", {}, el("td", {}, p.nombre, el("br"), el("small", { class: "admin-muted", text: p.codigo + " · " + p.marca + (p.activo ? "" : " · inactivo") })),
            el("td", { class: "num", text: money(p.precio) }), el("td", {}, inp), el("td", { text: p.descuento_pct != null ? p.descuento_pct + "%" : "—" }),
            el("td", {}, el("span", { class: "admin-tag admin-tag--of-" + p.estado, text: OF[p.estado] })),
            el("td", { class: "admin-actions" }, el("button", { class: "btn btn--primary btn--small", type: "button", text: "Guardar oferta", onclick: () => guardar(false) }),
              p.en_oferta || p.precio_anterior != null ? el("button", { class: "btn btn--clear btn--small", type: "button", text: "Quitar oferta", onclick: () => guardar(true) }) : null));
        })))),
      pagina(r.data, (n) => { fo.pagina = n; cargarOfertas(); }));
  }

  await Promise.all([cargarCupones(), cargarOfertas()]);
})();

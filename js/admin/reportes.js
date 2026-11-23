/* Panel administrativo — Reportes (Fase 3.6.4). Solo lectura. Todas las ventas y pagos son SIMULADOS.
   El servidor decide qué datos salen (nombres abreviados, correos enmascarados). Texto siempre con textContent. */
"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const cat = await adminFetch("admin/reportes.php");
  if (!cat.ok) { if (!adminErrorGlobal(cat)) pantallaMensaje("No se pudo cargar", textoError(cat)); return; }
  const hoy = new Date(), iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const st = { reporte: cat.data.reportes[0].clave, desde: iso(new Date(hoy.getTime() - 29 * 864e5)), hasta: iso(hoy) };
  const sel = el("select", { class: "admin-input", "aria-label": "Reporte" }, cat.data.reportes.map((r) => el("option", { value: r.clave, text: r.titulo })));
  const desde = el("input", { type: "date", class: "admin-input", value: st.desde, "aria-label": "Desde" });
  const hasta = el("input", { type: "date", class: "admin-input", value: st.hasta, "aria-label": "Hasta" });
  const salida = el("div", {});
  const qs = () => new URLSearchParams({ reporte: sel.value, desde: desde.value, hasta: hasta.value });
  const csv = el("a", { class: "btn btn--clear btn--small", href: "#", text: "Descargar CSV" });
  csv.addEventListener("click", () => { csv.href = ADMIN_API + "admin/reporte_exportar.php?" + qs(); });
  c.replaceChildren(
    el("p", { class: "admin-banner", text: cat.data.aviso }),
    el("div", { class: "admin-toolbar" }, sel, el("label", { class: "admin-muted" }, "Desde ", desde), el("label", { class: "admin-muted" }, "Hasta ", hasta),
      el("button", { class: "btn btn--primary btn--small", type: "button", text: "Ver reporte", onclick: cargar }), csv,
      el("button", { class: "btn btn--clear btn--small", type: "button", text: "Imprimir", onclick: () => window.print() })),
    salida);
  const fmt = (col, v) => col.tipo === "dinero" ? money(v) : col.tipo === "entero" ? String(v) : String(v);

  async function cargar() {
    const r = await adminFetch("admin/reportes.php?" + qs());
    if (!r.ok) { if (!adminErrorGlobal(r)) salida.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    const rep = r.data.reporte;
    const max = rep.grafica ? Math.max(1, ...rep.filas.map((f) => Number(f[rep.grafica.valor]) || 0)) : 1;
    const colG = rep.grafica ? rep.columnas.find((x) => x.clave === rep.grafica.valor) : null;
    salida.replaceChildren(
      el("div", { class: "admin-card" },
        el("h2", { text: rep.titulo }),
        el("p", { class: "admin-muted", text: `Periodo: ${rep.periodo.desde} a ${rep.periodo.hasta} · ${rep.aviso}` }),
        el("div", { class: "admin-kpis" }, rep.resumen.map((x) => el("div", { class: "admin-kpi" }, el("span", { class: "admin-kpi-t", text: x.etiqueta }), el("span", { class: "admin-kpi-v", text: fmt(x, x.valor) })))),
        rep.grafica && rep.filas.length ? el("div", { class: "admin-bars", role: "img", "aria-label": "Gráfica de barras del reporte" }, rep.filas.slice(0, 15).map((f) =>
          el("div", { class: "admin-bar-row" }, el("span", { text: String(f[rep.grafica.etiqueta]) }), el("i", { style: `width:${Math.round((Number(f[rep.grafica.valor]) || 0) / max * 100)}%` }), el("span", { text: fmt(colG, f[rep.grafica.valor]) })))) : null,
        rep.filas.length ? el("table", { class: "admin-table" },
          el("thead", {}, el("tr", {}, rep.columnas.map((x) => el("th", { class: x.tipo === "texto" ? "" : "num", text: x.etiqueta })))),
          el("tbody", {}, rep.filas.map((f) => el("tr", {}, rep.columnas.map((x) => el("td", { class: x.tipo === "texto" ? "" : "num", text: fmt(x, f[x.clave]) })))))) : el("p", { class: "admin-muted", text: "No hay datos en este periodo." }),
        rep.truncado ? el("p", { class: "admin-muted", text: "Se muestran solo las primeras filas." }) : null,
        rep.notas.map((n) => el("p", { class: "admin-muted admin-note", text: n }))));
  }
  cargar();
})();

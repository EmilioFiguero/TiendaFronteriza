"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const res = await adminFetch("admin/dashboard.php");
  if (!res.ok) { if (!adminErrorGlobal(res)) pantallaMensaje("No se pudo cargar", res.data.mensaje || "Intenta de nuevo."); return; }
  const d = res.data, c = document.getElementById("adminContent");

  const kpi = (titulo, valor, nota, clase) => el("div", { class: "admin-kpi " + (clase || "") }, el("span", { class: "admin-kpi-t", text: titulo }), el("strong", { class: "admin-kpi-v", text: valor }), nota ? el("span", { class: "admin-kpi-n", text: nota }) : null);
  const p = d.productos, v = d.ventas;

  const filas = Object.keys(ESTADOS).map((e) => el("tr", {}, el("td", {}, tag(e)), el("td", { class: "num", text: d.pedidos.por_estado[e].cantidad }), el("td", { class: "num", text: money(d.pedidos.por_estado[e].importe) })));
  const rec = d.recientes.length
    ? el("table", { class: "admin-table" }, el("thead", {}, el("tr", {}, ["Pedido", "Cliente", "Estado", "Total", "Fecha"].map((t) => el("th", { text: t })))),
        el("tbody", {}, d.recientes.map((r) => el("tr", {}, el("td", { text: r.numero_pedido }), el("td", { text: r.cliente }), el("td", {}, tag(r.estado)), el("td", { class: "num", text: money(r.total) }), el("td", { text: fecha(r.creado_en_ms) })))))
    : el("p", { class: "admin-muted", text: "Todavía no hay pedidos." });
  const alertas = p.alertas.length
    ? el("ul", { class: "admin-list" }, p.alertas.map((a) => el("li", {}, el("span", { text: `${a.nombre} (${a.codigo})` }), el("strong", { class: a.stock === 0 ? "is-out" : "is-low", text: a.stock === 0 ? "Agotado" : `${a.stock} en stock` }))))
    : el("p", { class: "admin-muted", text: "Sin alertas de inventario." });

  c.replaceChildren(
    el("section", { class: "admin-kpis" },
      kpi("Productos", p.total, `${p.activos} activos · ${p.inactivos} inactivos`),
      kpi("Stock bajo", p.stock_bajo, `1 a ${d.umbral_stock_bajo} unidades`, p.stock_bajo ? "is-warn" : ""),
      kpi("Agotados", p.agotados, "Productos activos sin existencias", p.agotados ? "is-bad" : ""),
      kpi("Clientes", d.clientes.total, `${d.clientes.activos} activos · ${d.clientes.inactivos} inactivos`),
      kpi("Ventas simuladas", money(v.importe), `${v.cantidad} pedidos (pagados, preparados, enviados y entregados)`, "is-main"),
      kpi("Por cobrar", money(v.por_cobrar.importe), `${v.por_cobrar.cantidad} pedidos pendientes de pago`)),
    el("p", { class: "admin-muted admin-note", text: "Pagos y envíos son simulaciones académicas. Los pedidos cancelados no se cuentan como ventas." }),
    el("div", { class: "admin-grid2" },
      el("section", { class: "admin-card" }, el("h2", { text: "Pedidos por estado" }),
        el("table", { class: "admin-table" }, el("thead", {}, el("tr", {}, el("th", { text: "Estado" }), el("th", { class: "num", text: "Pedidos" }), el("th", { class: "num", text: "Importe" }))), el("tbody", {}, filas))),
      el("section", { class: "admin-card" }, el("h2", { text: "Alertas de inventario" }), alertas)),
    el("section", { class: "admin-card" }, el("h2", { text: "Pedidos recientes" }), rec));
})();

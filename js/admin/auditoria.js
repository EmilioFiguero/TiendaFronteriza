"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const f = { accion: "", entidad: "", pagina: 1 };
  const selA = el("select", { class: "admin-input", "aria-label": "Acción" });
  const selE = el("select", { class: "admin-input", "aria-label": "Entidad" });
  const lista = el("div", {});
  selA.addEventListener("change", () => { f.accion = selA.value; f.pagina = 1; cargar(); });
  selE.addEventListener("change", () => { f.entidad = selE.value; f.pagina = 1; cargar(); });
  c.replaceChildren(el("div", { class: "admin-filters" }, selA, selE), lista);

  function llenar(sel, todas, valores, actual) {
    sel.replaceChildren(el("option", { value: "", text: todas }), ...valores.map((v) => el("option", { value: v, text: v, selected: v === actual ? "" : false })));
  }
  async function cargar() {
    const r = await adminFetch("admin/auditoria.php?" + new URLSearchParams({ accion: f.accion, entidad: f.entidad, pagina: String(f.pagina) }));
    if (!r.ok) { if (!adminErrorGlobal(r)) lista.replaceChildren(el("p", { class: "admin-msg is-err", text: r.data.mensaje || "No se pudo cargar." })); return; }
    llenar(selA, "Todas las acciones", r.data.acciones, f.accion);
    llenar(selE, "Todas las entidades", r.data.entidades, f.entidad);
    f.pagina = r.data.pagina;
    if (!r.data.registros.length) { lista.replaceChildren(el("p", { class: "admin-muted", text: "Aún no hay operaciones registradas." })); return; }
    lista.replaceChildren(el("table", { class: "admin-table" },
      el("thead", {}, el("tr", {}, ["Fecha", "Administrador", "Acción", "Entidad", "Detalle"].map((t) => el("th", { text: t })))),
      el("tbody", {}, r.data.registros.map((a) => el("tr", {}, el("td", { text: fecha(a.creado_en_ms) }), el("td", { text: a.admin }), el("td", { text: a.accion }), el("td", { text: a.entidad + (a.entidad_id ? " #" + a.entidad_id : "") }), el("td", { text: a.detalle || "" }))))),
      pagina(r.data, (n) => { f.pagina = n; cargar(); }));
  }
  cargar();
})();

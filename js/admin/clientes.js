"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const f = { q: "", estado: "", rol: "cliente", pagina: 1 };
  const q = el("input", { type: "search", class: "admin-input", placeholder: "Buscar por nombre o correo", maxlength: "80", "aria-label": "Buscar cliente" });
  const est = el("select", { class: "admin-input", "aria-label": "Estado" }, el("option", { value: "", text: "Todos los estados" }), el("option", { value: "activo", text: "Activos" }), el("option", { value: "inactivo", text: "Inactivos" }));
  const rol = el("select", { class: "admin-input", "aria-label": "Rol" }, el("option", { value: "cliente", text: "Clientes" }), el("option", { value: "admin", text: "Administradores" }), el("option", { value: "todos", text: "Todas las cuentas" }));
  const aviso = el("p", { class: "admin-msg", role: "status" });
  const lista = el("div", {});
  const detalle = el("div", {});
  let temporizador;
  q.addEventListener("input", () => { clearTimeout(temporizador); temporizador = setTimeout(() => { f.q = q.value.trim(); f.pagina = 1; cargar(); }, 300); });
  est.addEventListener("change", () => { f.estado = est.value; f.pagina = 1; cargar(); });
  rol.addEventListener("change", () => { f.rol = rol.value; f.pagina = 1; cargar(); });
  c.replaceChildren(el("div", { class: "admin-filters" }, q, est, rol), aviso, lista, detalle);

  async function cargar() {
    const qs = new URLSearchParams({ q: f.q, estado: f.estado, rol: f.rol, pagina: String(f.pagina) });
    const r = await adminFetch("admin/clientes.php?" + qs);
    if (!r.ok) { if (!adminErrorGlobal(r)) lista.replaceChildren(el("p", { class: "admin-msg is-err", text: r.data.mensaje || "No se pudo cargar." })); return; }
    f.pagina = r.data.pagina;
    if (!r.data.clientes.length) { lista.replaceChildren(el("p", { class: "admin-muted", text: "No hay cuentas con esos filtros." })); return; }
    lista.replaceChildren(
      el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["Nombre", "Correo", "Rol", "Estado", "Pedidos", "Comprado", "Alta", ""].map((t) => el("th", { text: t })))),
        el("tbody", {}, r.data.clientes.map((u) => el("tr", {},
          el("td", { text: u.nombre }), el("td", { text: u.correo }), el("td", { text: u.rol === "admin" ? "Administrador" : "Cliente" }),
          el("td", {}, el("span", { class: "admin-tag " + (u.activo ? "admin-tag--pagado" : "admin-tag--cancelado"), text: u.activo ? "Activa" : "Inactiva" })),
          el("td", { class: "num", text: u.pedidos }), el("td", { class: "num", text: money(u.comprado) }), el("td", { text: fecha(u.creado_en_ms) }),
          el("td", { class: "admin-actions" },
            el("button", { class: "btn btn--clear btn--small", type: "button", text: "Ver", onclick: () => ver(u.id) }),
            u.rol === "cliente" && u.id !== adminState.me.id ? el("button", { class: "btn btn--small " + (u.activo ? "btn--clear" : "btn--primary"), type: "button", text: u.activo ? "Desactivar" : "Activar", onclick: () => cambiar(u) }) : null))))),
      pagina(r.data, (n) => { f.pagina = n; cargar(); }));
  }

  async function ver(id) {
    const r = await adminFetch("admin/cliente.php?id=" + id);
    if (!r.ok) { if (!adminErrorGlobal(r)) aviso.textContent = r.data.mensaje || "No se pudo cargar el cliente."; return; }
    const u = r.data.cliente;
    detalle.replaceChildren(el("section", { class: "admin-card" },
      el("h2", { text: u.nombre }), el("p", { class: "admin-muted", text: `${u.correo} · ${u.activo ? "cuenta activa" : "cuenta inactiva"} · alta ${fecha(u.creado_en_ms)}` }),
      u.ultimos_pedidos.length
        ? el("table", { class: "admin-table" }, el("thead", {}, el("tr", {}, ["Pedido", "Estado", "Pago", "Total", "Fecha"].map((t) => el("th", { text: t })))),
            el("tbody", {}, u.ultimos_pedidos.map((p) => el("tr", {}, el("td", {}, el("a", { href: "pedidos.html?numero=" + encodeURIComponent(p.numero_pedido), text: p.numero_pedido })), el("td", {}, tag(p.estado)), el("td", { text: p.metodo_pago }), el("td", { class: "num", text: money(p.total) }), el("td", { text: fecha(p.creado_en_ms) })))))
        : el("p", { class: "admin-muted", text: "Este cliente aún no tiene pedidos." })));
    detalle.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function cambiar(u) {
    const nuevo = !u.activo;
    let motivo = "";
    if (!nuevo) { const m = window.prompt(`Motivo para desactivar a ${u.nombre} (opcional):`, ""); if (m === null) return; motivo = m.trim(); }
    else if (!window.confirm(`¿Activar la cuenta de ${u.nombre}?`)) return;
    const r = await adminFetch("admin/cliente_estado.php", { method: "POST", body: { id: u.id, activo: nuevo, motivo } });
    if (!r.ok && adminErrorGlobal(r)) return;
    aviso.className = "admin-msg " + (r.ok ? "is-ok" : "is-err");
    aviso.textContent = r.ok ? r.data.mensaje : (r.data.mensaje || "No se pudo completar la operación.");
    cargar();
  }
  cargar();
})();

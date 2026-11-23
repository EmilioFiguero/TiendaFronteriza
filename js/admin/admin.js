/* Panel administrativo — utilidades comunes (Fase 3.6.1).
   Seguridad: aquí solo se decide QUÉ SE MUESTRA. Cada operación la autoriza el servidor (api/admin/*). */
"use strict";

const ADMIN_API = "../api/";
const adminState = { csrf: "", me: null };

const ADMIN_MENU = [
  { href: "index.html", id: "index", text: "Resumen" },
  { href: "clientes.html", id: "clientes", text: "Clientes" },
  { href: "auditoria.html", id: "auditoria", text: "Auditoría" },
  { href: "productos.html", id: "productos", text: "Productos" },
  { href: "inventario.html", id: "inventario", text: "Inventario" },
  { href: "pedidos.html", id: "pedidos", text: "Pedidos" },
  { href: "promociones.html", id: "promociones", text: "Promociones" },
  { href: "reportes.html", id: "reportes", text: "Reportes" },
];

function el(tag, attrs, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
  return n;
}

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const money = (n) => MXN.format(Number(n) || 0);
const fecha = (ms) => new Date(ms).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const ESTADOS = { pendiente: "Pendiente de pago", pagado: "Pagado", preparado: "Preparado", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };

async function adminFetch(endpoint, { method = "GET", body = null, form = null } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") {
    if (!form) headers["Content-Type"] = "application/json";   // con FormData el navegador pone el suyo
    headers["X-CSRF-Token"] = adminState.csrf;
  }
  try {
    const r = await fetch(ADMIN_API + endpoint, { method, headers, credentials: "same-origin", body: form ? form : body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await r.json(); } catch (_) { /* respuesta no JSON */ }
    return { ok: r.ok && data && data.ok === true, status: r.status, data: data || {} };
  } catch (_) {
    return { ok: false, status: 0, data: {} };
  }
}

function pantallaMensaje(titulo, texto, enlace) {
  const c = document.getElementById("adminContent");
  c.replaceChildren(el("div", { class: "admin-card admin-center" }, el("h2", { text: titulo }), el("p", { class: "admin-muted", text: texto }), enlace || null));
}

/** Comprueba sesión y rol antes de pintar nada. Devuelve true si se puede continuar. */
async function adminIniciar() {
  const side = document.getElementById("adminSidebar");
  const pagina = document.body.dataset.page;
  side.replaceChildren(
    el("a", { class: "admin-brand", href: "index.html" }, el("span", { class: "admin-brand-1", text: "TIENDA" }), el("span", { class: "admin-brand-2", text: "FRONTERIZA" }), el("small", { text: "Panel administrativo" })),
    el("nav", {}, ADMIN_MENU.map((m) => m.soon
      ? el("span", { class: "admin-nav-link is-soon", text: m.text }, el("em", { text: "Próximamente" }))
      : el("a", { class: "admin-nav-link" + (m.id === pagina ? " is-active" : ""), href: m.href, "aria-current": m.id === pagina ? "page" : false, text: m.text })))
  );

  const s = await adminFetch("sesion.php");
  if (s.status === 0) { pantallaMensaje("Sin conexión", "No pudimos comunicarnos con el servidor. Revisa que Apache y MySQL estén encendidos."); return false; }
  adminState.csrf = s.data.csrf_token || "";
  if (!s.data.autenticado) {
    pantallaMensaje("Inicia sesión", "Necesitas una cuenta de administrador.", el("a", { class: "btn btn--primary", href: "../login.html", text: "Ir a iniciar sesión" }));
    return false;
  }
  adminState.me = s.data.usuario;
  document.getElementById("adminWho").textContent = adminState.me.nombre;
  if (s.data.usuario.es_admin !== true) { sinPermiso(); return false; }
  return true;
}

function sinPermiso() {
  pantallaMensaje("Sin permiso", "Tu cuenta no tiene acceso al panel administrativo.", el("a", { class: "btn btn--clear", href: "../index.html", text: "Volver a la tienda" }));
}

/** Traduce errores del servidor; devuelve true si ya se mostró una pantalla completa (401/403/503). */
function adminErrorGlobal(res) {
  if (res.status === 401) { pantallaMensaje("Sesión expirada", "Vuelve a iniciar sesión.", el("a", { class: "btn btn--primary", href: "../login.html", text: "Iniciar sesión" })); return true; }
  if (res.status === 403) { sinPermiso(); return true; }
  if (res.status === 503) { pantallaMensaje("Falta una migración", res.data.mensaje || "Aplica la migración A de la Fase 3.6.1."); return true; }
  return false;
}

function pagina(info, ir) {
  return el("div", { class: "admin-pager" },
    el("button", { class: "btn btn--clear btn--small", type: "button", disabled: info.pagina <= 1 ? "" : false, onclick: () => ir(info.pagina - 1), text: "← Anterior" }),
    el("span", { text: `Página ${info.pagina} de ${info.paginas} · ${info.total} registros` }),
    el("button", { class: "btn btn--clear btn--small", type: "button", disabled: info.pagina >= info.paginas ? "" : false, onclick: () => ir(info.pagina + 1), text: "Siguiente →" }));
}
function tag(estado) { return el("span", { class: "admin-tag admin-tag--" + estado, text: ESTADOS[estado] || estado }); }

/** Texto de error de una respuesta fallida (con el detalle por campo si el servidor lo envía). */
function textoError(res, porDefecto) {
  const e = res.data && res.data.errores;
  if (e && typeof e === "object") return Object.values(e).join(" ");
  return (res.data && res.data.mensaje) || porDefecto || "No se pudo completar la operación.";
}
function campo(etiqueta, control, ayuda, nombre) {
  return el("label", { class: "admin-field" }, el("span", { class: "admin-field-l", text: etiqueta }), control, ayuda ? el("small", { class: "admin-muted", text: ayuda }) : null, el("small", { class: "admin-field-err", "data-err": nombre || "" }));
}
function marcarErrores(contenedor, errores) {
  contenedor.querySelectorAll("[data-err]").forEach((n) => { n.textContent = (errores && errores[n.dataset.err]) || ""; });
}
const STOCK_TXT = { ok: "Normal", bajo: "Stock bajo", agotado: "Agotado" };
function tagStock(estado, n) { return el("span", { class: "admin-tag admin-tag--s-" + estado, text: estado === "agotado" ? "Agotado" : `${n} · ${STOCK_TXT[estado]}` }); }

const ESTADOS_PED = { pendiente: "Pendiente de pago (simulado)", pagado: "Pagado (simulado)", preparado: "Preparado para envío", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };
const METODOS_PED = { tarjeta: "Tarjeta (simulada)", paypal: "PayPal (simulado)", transferencia: "Transferencia (simulada)" };
function tagPedido(estado) { return el("span", { class: "admin-tag admin-tag--" + estado, text: ESTADOS_PED[estado] || estado }); }

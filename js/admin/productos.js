"use strict";
(async function () {
  if (!(await adminIniciar())) return;
  const c = document.getElementById("adminContent");
  const f = { q: "", estado: "", categoria: "", marca: "", stock: "", pagina: 1 };
  let catalogos = { categorias: [], marcas: [] };

  const q = el("input", { type: "search", class: "admin-input admin-grow", placeholder: "Buscar por nombre o código (SKU)", maxlength: "80", "aria-label": "Buscar producto" });
  const selCat = el("select", { class: "admin-input", "aria-label": "Categoría" });
  const selMar = el("select", { class: "admin-input", "aria-label": "Marca" });
  const selEst = el("select", { class: "admin-input", "aria-label": "Estado" }, el("option", { value: "", text: "Todos los estados" }), el("option", { value: "activo", text: "Activos" }), el("option", { value: "inactivo", text: "Inactivos" }));
  const selStk = el("select", { class: "admin-input", "aria-label": "Existencias" }, el("option", { value: "", text: "Todas las existencias" }), el("option", { value: "bajo", text: "Stock bajo" }), el("option", { value: "agotado", text: "Agotados" }), el("option", { value: "ok", text: "Normal" }));
  const nuevoBtn = el("button", { class: "btn btn--primary btn--small admin-spacer", type: "button", text: "+ Nuevo producto", onclick: () => abrirForm(null) });
  const aviso = el("p", { class: "admin-msg", role: "status" });
  const formBox = el("div", {});
  const lista = el("div", {});
  let t;
  q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { f.q = q.value.trim(); f.pagina = 1; cargar(); }, 300); });
  for (const [sel, k] of [[selCat, "categoria"], [selMar, "marca"], [selEst, "estado"], [selStk, "stock"]]) sel.addEventListener("change", () => { f[k] = sel.value; f.pagina = 1; cargar(); });
  c.replaceChildren(el("div", { class: "admin-toolbar" }, q, selCat, selMar, selEst, selStk, nuevoBtn), aviso, formBox, lista);

  function llenarFiltros() {
    selCat.replaceChildren(el("option", { value: "", text: "Todas las categorías" }), ...catalogos.categorias.map((x) => el("option", { value: x.id, text: x.nombre, selected: String(x.id) === f.categoria ? "" : false })));
    selMar.replaceChildren(el("option", { value: "", text: "Todas las marcas" }), ...catalogos.marcas.map((x) => el("option", { value: x.id, text: x.nombre, selected: String(x.id) === f.marca ? "" : false })));
  }
  function mensaje(texto, ok) { aviso.className = "admin-msg " + (ok ? "is-ok" : "is-err"); aviso.textContent = texto; }

  async function cargar() {
    const qs = new URLSearchParams({ q: f.q, estado: f.estado, categoria: f.categoria, marca: f.marca, stock: f.stock, pagina: String(f.pagina) });
    const r = await adminFetch("admin/productos.php?" + qs);
    if (!r.ok) { if (!adminErrorGlobal(r)) lista.replaceChildren(el("p", { class: "admin-msg is-err", text: textoError(r) })); return; }
    catalogos = { categorias: r.data.categorias, marcas: r.data.marcas };
    if (!selCat.options.length || selCat.options.length !== catalogos.categorias.length + 1) llenarFiltros();
    f.pagina = r.data.pagina;
    if (!r.data.productos.length) { lista.replaceChildren(el("p", { class: "admin-muted", text: "No hay productos con esos filtros." })); return; }
    lista.replaceChildren(
      el("table", { class: "admin-table" },
        el("thead", {}, el("tr", {}, ["", "Código", "Producto", "Categoría", "Marca", "Precio", "Existencias", "Estado", ""].map((x, i) => el("th", { class: i === 5 ? "num" : "", text: x })))),
        el("tbody", {}, r.data.productos.map((p) => el("tr", {},
          el("td", {}, el("img", { class: "admin-thumb", src: "../" + p.imagen, alt: "", loading: "lazy" })),
          el("td", { text: p.codigo }),
          el("td", {}, p.nombre, p.tiene_pedidos ? el("small", { class: "admin-muted", text: "  · con pedidos" }) : null),
          el("td", { text: p.categoria.nombre }), el("td", { text: p.marca.nombre }),
          el("td", { class: "num", text: money(p.precio) }),
          el("td", {}, tagStock(p.estado_stock, p.stock)),
          el("td", {}, el("span", { class: "admin-tag " + (p.activo ? "admin-tag--pagado" : "admin-tag--inactivo"), text: p.activo ? "Activo" : "Inactivo" })),
          el("td", { class: "admin-actions" },
            el("button", { class: "btn btn--clear btn--small", type: "button", text: "Editar", onclick: () => abrirForm(p.id) }),
            el("button", { class: "btn btn--small " + (p.activo ? "btn--clear" : "btn--primary"), type: "button", text: p.activo ? "Desactivar" : "Activar", onclick: () => cambiarEstado(p) })))))),
      pagina(r.data, (n) => { f.pagina = n; cargar(); }));
  }

  async function cambiarEstado(p) {
    const nuevo = !p.activo;
    if (!nuevo && !window.confirm(`¿Desactivar «${p.nombre}»? Dejará de verse en la tienda; el historial de pedidos se conserva.`)) return;
    const r = await adminFetch("admin/producto_estado.php", { method: "POST", body: { id: p.id, activo: nuevo } });
    if (!r.ok && adminErrorGlobal(r)) return;
    mensaje(r.ok ? r.data.mensaje : textoError(r), r.ok);
    cargar();
  }

  async function abrirForm(id) {
    let p = null;
    if (id !== null) {
      const r = await adminFetch("admin/producto.php?id=" + id);
      if (!r.ok) { if (!adminErrorGlobal(r)) mensaje(textoError(r), false); return; }
      p = r.data.producto; catalogos = { categorias: r.data.categorias, marcas: r.data.marcas };
    }
    const crear = p === null;
    const nombre = el("input", { class: "admin-input", maxlength: "150", value: p ? p.nombre : "", required: "" });
    const desc = el("textarea", { class: "admin-input", maxlength: "2000", required: "" }); desc.value = p ? p.descripcion : "";
    const precio = el("input", { class: "admin-input", inputmode: "decimal", value: p ? p.precio.toFixed(2) : "", required: "", placeholder: "0.00" });
    const cat = el("select", { class: "admin-input" }, catalogos.categorias.map((x) => el("option", { value: x.id, text: x.nombre, selected: p && p.categoria.id === x.id ? "" : false })));
    const mar = el("select", { class: "admin-input" }, catalogos.marcas.map((x) => el("option", { value: x.id, text: x.nombre, selected: p && p.marca.id === x.id ? "" : false })));
    const dest = el("input", { type: "checkbox", checked: p && p.es_destacado ? "" : false });
    const ofer = el("input", { type: "checkbox", checked: p && p.en_oferta ? "" : false });
    const codigo = crear ? el("input", { class: "admin-input", maxlength: "20", placeholder: "Se genera automáticamente (p16, p17…)" }) : null;
    const stock = crear ? el("input", { class: "admin-input", inputmode: "numeric", value: "0" }) : null;
    const activo = crear ? el("input", { type: "checkbox", checked: "" }) : null;
    const archivo = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "admin-input" });
    const msg = el("p", { class: "admin-msg", role: "status" });

    const form = el("form", { class: "admin-form", novalidate: "" },
      campo("Nombre", nombre, null, "nombre"),
      crear ? campo("Código (SKU)", codigo, "Opcional. 2–20 letras, números, - o _. No se puede cambiar después.", "codigo") : campo("Código (SKU)", el("input", { class: "admin-input", value: p.codigo, disabled: "" }), "No se puede cambiar.", ""),
      el("div", { class: "is-wide" }, campo("Descripción", desc, "10 a 2000 caracteres.", "descripcion")),
      campo("Categoría", cat, null, "categoria_id"), campo("Marca", mar, null, "marca_id"),
      campo("Precio (MXN)", precio, "Los pedidos anteriores conservan el precio al que se compraron.", "precio"),
      crear ? campo("Existencias iniciales", stock, "Genera un movimiento de inventario. Después solo cambian desde Inventario.", "stock") : campo("Existencias", el("input", { class: "admin-input", value: p.stock, disabled: "" }), "Se ajustan desde Inventario.", ""),
      el("label", { class: "admin-check" }, dest, "Producto destacado"),
      el("label", { class: "admin-check" }, ofer, "En oferta"),
      crear ? el("label", { class: "admin-check" }, activo, "Visible en la tienda (activo)") : null,
      crear ? el("div", { class: "is-wide" }, campo("Imagen (JPG, PNG o WebP, máx. 2 MB)", archivo, "Opcional; también puedes subirla después.", "imagen")) : null,
      el("div", { class: "admin-form-actions is-wide" },
        el("button", { class: "btn btn--primary", type: "submit", text: crear ? "Crear producto" : "Guardar cambios" }),
        el("button", { class: "btn btn--clear", type: "button", text: "Cerrar", onclick: () => formBox.replaceChildren() })));

    const bloques = [el("h2", { text: crear ? "Nuevo producto" : `Editar ${p.codigo}` }), form, msg];
    if (!crear) bloques.push(seccionImagenes(p, archivo));
    formBox.replaceChildren(el("section", { class: "admin-card" }, ...bloques));
    formBox.scrollIntoView({ behavior: "smooth", block: "start" });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      marcarErrores(form, null); msg.textContent = "";
      const cuerpo = { nombre: nombre.value, descripcion: desc.value, precio: precio.value.trim(), categoria_id: Number(cat.value), marca_id: Number(mar.value), es_destacado: dest.checked, en_oferta: ofer.checked };
      let ep = "admin/producto_editar.php";
      if (crear) { ep = "admin/producto_crear.php"; Object.assign(cuerpo, { stock: stock.value.trim() === "" ? 0 : stock.value.trim(), activo: activo.checked }); if (codigo.value.trim()) cuerpo.codigo = codigo.value.trim(); }
      else cuerpo.id = p.id;
      if (crear && archivo.files[0]) { const e = await revisarArchivo(archivo.files[0]); if (e) { msg.className = "admin-msg is-err"; msg.textContent = e; return; } }
      const r = await adminFetch(ep, { method: "POST", body: cuerpo });
      if (!r.ok) {
        if (adminErrorGlobal(r)) return;
        marcarErrores(form, r.data.errores); msg.className = "admin-msg is-err"; msg.textContent = r.data.errores ? "Revisa los campos marcados." : textoError(r); return;
      }
      let texto = r.data.mensaje;
      if (crear && archivo.files[0]) {
        const fd = new FormData(); fd.append("producto_id", String(r.data.id)); fd.append("imagen", archivo.files[0]);
        const up = await adminFetch("admin/producto_imagen.php", { method: "POST", form: fd });
        texto += up.ok ? " Imagen subida." : " El producto se creó, pero la imagen no se pudo subir: " + textoError(up);
      }
      mensaje(texto, true); formBox.replaceChildren(); cargar();
    });
  }

  // Comprobación rápida en el navegador (comodidad): tamaño y "firma" real del archivo. El servidor la repite siempre.
  async function revisarArchivo(file) {
    if (file.size > 2 * 1024 * 1024) return "La imagen supera 2 MB.";
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    const webp = String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
    return jpg || png || webp ? "" : "El archivo no es una imagen JPG, PNG o WebP.";
  }

  function seccionImagenes(p, archivo) {
    const cont = el("div", { class: "admin-imgs" });
    const msg = el("p", { class: "admin-msg", role: "status" });
    const pintar = (imagenes) => {
      cont.replaceChildren(
        el("h2", { text: "Imágenes" }),
        el("div", { class: "admin-gallery" }, imagenes.map((im, i) => el("figure", { class: i === 0 ? "is-main" : "" },
          el("img", { src: "../" + im.url, alt: "" }), i === 0 ? "Principal" : "Galería",
          im.quitable ? el("div", {}, el("button", { class: "btn btn--clear btn--small", type: "button", text: "Quitar", onclick: () => quitar(im.id) })) : el("div", { class: "admin-muted", text: "original" })))),
        imagenes.length ? null : el("p", { class: "admin-muted", text: "Sin imágenes: la tienda muestra «Foto próximamente»." }),
        el("div", { class: "admin-inline", style: "margin-top:14px" }, campo("Subir imagen nueva (será la principal)", archivo), el("button", { class: "btn btn--primary btn--small", type: "button", text: "Subir", onclick: subir })), msg);
    };
    async function recargar() { const r = await adminFetch("admin/producto.php?id=" + p.id); if (r.ok) pintar(r.data.producto.imagenes); cargar(); }
    async function subir() {
      const file = archivo.files[0];
      if (!file) { msg.className = "admin-msg is-err"; msg.textContent = "Selecciona un archivo primero."; return; }
      const e = await revisarArchivo(file); if (e) { msg.className = "admin-msg is-err"; msg.textContent = e; return; }
      const fd = new FormData(); fd.append("producto_id", String(p.id)); fd.append("imagen", file);
      const r = await adminFetch("admin/producto_imagen.php", { method: "POST", form: fd });
      if (!r.ok && adminErrorGlobal(r)) return;
      msg.className = "admin-msg " + (r.ok ? "is-ok" : "is-err"); msg.textContent = r.ok ? r.data.mensaje : textoError(r);
      if (r.ok) { archivo.value = ""; await recargar(); msg.className = "admin-msg is-ok"; msg.textContent = r.data.mensaje; }
    }
    async function quitar(id) {
      if (!window.confirm("¿Quitar esta imagen? Se borra el archivo subido.")) return;
      const r = await adminFetch("admin/producto_imagen_quitar.php", { method: "POST", body: { imagen_id: id } });
      if (!r.ok && adminErrorGlobal(r)) return;
      await recargar(); msg.className = "admin-msg " + (r.ok ? "is-ok" : "is-err"); msg.textContent = r.ok ? r.data.mensaje : textoError(r);
    }
    pintar(p.imagenes);
    return cont;
  }
  cargar();
})();

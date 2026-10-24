/* =========================================================
   Té Quiero Pastelería - Reseñas
   1. Carga las reseñas publicadas desde /api/resenas
   2. Envía nuevas reseñas a /api/resenas (quedan pendientes de revisión)
   Todo el contenido se inserta con textContent (sin innerHTML), para evitar XSS.
   ========================================================= */

(function () {
  "use strict";

  var grid = document.getElementById("resenasGrid");
  var estado = document.getElementById("resenasEstado");
  var form = document.getElementById("resenaForm");
  var mensaje = document.getElementById("resenaMensaje");
  var boton = document.getElementById("resenaEnviar");

  if (!grid || !estado) return;

  /* ---------- Helpers ---------- */

  function iniciales(nombre) {
    return String(nombre)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (parte) { return parte.charAt(0); })
      .join("")
      .toUpperCase();
  }

  function formatearFecha(iso) {
    if (!iso) return "";
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return "";
    return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  }

  function crearEtiqueta(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    el.textContent = texto;
    return el;
  }

  /* ---------- Render de reseñas ---------- */

  function crearTarjeta(r) {
    var card = document.createElement("article");
    card.className = "resena";

    var head = document.createElement("div");
    head.className = "resena__head";

    var avatar = crearEtiqueta("div", "resena__avatar", iniciales(r.nombre));
    avatar.setAttribute("aria-hidden", "true");

    var datos = document.createElement("div");
    datos.className = "resena__datos";
    datos.appendChild(crearEtiqueta("p", "resena__nombre", r.nombre));

    var meta = document.createElement("div");
    meta.className = "resena__meta";
    if (r.guia_local) {
      meta.appendChild(crearEtiqueta("span", "resena__badge", "Local Guide"));
    }
    var conteos = [];
    if (r.opiniones != null) conteos.push(r.opiniones + (r.opiniones === 1 ? " opinión" : " opiniones"));
    if (r.fotos != null) conteos.push(r.fotos + (r.fotos === 1 ? " foto" : " fotos"));
    if (conteos.length) {
      meta.appendChild(crearEtiqueta("span", "resena__conteo", conteos.join(" · ")));
    }
    if (meta.childNodes.length) datos.appendChild(meta);

    head.appendChild(avatar);
    head.appendChild(datos);

    var texto = crearEtiqueta("p", "resena__texto", r.texto);

    var fecha = r.fecha_texto || formatearFecha(r.creada);

    card.appendChild(head);
    card.appendChild(texto);
    if (fecha) card.appendChild(crearEtiqueta("p", "resena__fecha", fecha));

    return card;
  }

  function render(lista) {
    grid.innerHTML = "";

    if (!Array.isArray(lista) || lista.length === 0) {
      estado.textContent = "Todavía no hay reseñas publicadas. ¡Sé la primera!";
      estado.hidden = false;
      return;
    }

    lista.forEach(function (r) {
      grid.appendChild(crearTarjeta(r));
    });
    estado.hidden = true;
  }

  function cargarResenas() {
    fetch("/api/resenas", { headers: { Accept: "application/json" } })
      .then(function (respuesta) {
        if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
        return respuesta.json();
      })
      .then(render)
      .catch(function () {
        estado.textContent = "No pudimos cargar las reseñas en este momento. Podés leerlas en Google Maps.";
        estado.hidden = false;
      });
  }

  /* ---------- Formulario ---------- */

  function setMensaje(texto, tipo) {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.className = "resena-form__msg" + (tipo ? " is-" + tipo : "");
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var datos = {
        nombre: form.elements.nombre.value,
        texto: form.elements.texto.value,
        web: form.elements.web.value, // campo trampa
      };

      setMensaje("", "");
      boton.disabled = true;
      boton.textContent = "Enviando…";

      fetch("/api/resenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      })
        .then(function (respuesta) {
          return respuesta
            .json()
            .catch(function () { return {}; })
            .then(function (cuerpo) {
              return { ok: respuesta.ok, cuerpo: cuerpo };
            });
        })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            setMensaje(res.cuerpo.mensaje || "¡Gracias por tu reseña!", "ok");
          } else {
            setMensaje(res.cuerpo.error || "No se pudo enviar. Intentá de nuevo.", "error");
          }
        })
        .catch(function () {
          setMensaje("No pudimos conectarnos. Intentá de nuevo más tarde.", "error");
        })
        .then(function () {
          boton.disabled = false;
          boton.textContent = "Enviar reseña";
        });
    });
  }

  cargarResenas();
})();

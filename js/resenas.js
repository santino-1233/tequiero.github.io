/* =========================================================
   Té Quiero Pastelería - Reseñas (versión estática para Netlify)
   1. Lee las reseñas aprobadas desde data/resenas.json
   2. Envía nuevas reseñas con Netlify Forms (quedan en el panel de Netlify)
   Todo el contenido se inserta con textContent (sin innerHTML).
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

    card.appendChild(head);
    card.appendChild(crearEtiqueta("p", "resena__texto", r.texto));
    if (r.fecha_texto) card.appendChild(crearEtiqueta("p", "resena__fecha", r.fecha_texto));

    return card;
  }

  function render(lista) {
    grid.innerHTML = "";

    if (!lista.length) {
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
    // Solo se muestran las aprobadas (aprobada: true en data/resenas.json)
    fetch("data/resenas.json", { cache: "no-cache" })
      .then(function (respuesta) {
        if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
        return respuesta.json();
      })
      .then(function (lista) {
        render(lista.filter(function (r) { return r.aprobada === true; }));
      })
      .catch(function () {
        estado.textContent = "No pudimos cargar las reseñas en este momento. Podés leerlas en Google Maps.";
        estado.hidden = false;
      });
  }

  /* ---------- Formulario (Netlify Forms) ---------- */

  function setMensaje(texto, tipo) {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.className = "resena-form__msg" + (tipo ? " is-" + tipo : "");
  }

  function validar(nombre, texto) {
    if (nombre.trim().length < 2) return "Escribí tu nombre (mínimo 2 letras).";
    if (texto.trim().length < 10) return "Contanos un poco más (mínimo 10 caracteres).";
    return "";
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var nombre = form.elements.nombre.value;
      var texto = form.elements.texto.value;

      var error = validar(nombre, texto);
      if (error) {
        setMensaje(error, "error");
        return;
      }

      setMensaje("", "");
      boton.disabled = true;
      boton.textContent = "Enviando…";

      // Netlify Forms recibe los datos como formulario codificado y los guarda en el panel
      var cuerpo = new URLSearchParams(new FormData(form)).toString();

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo,
      })
        .then(function (respuesta) {
          if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);
          form.reset();
          setMensaje("¡Gracias! Tu reseña se publica después de revisarla.", "ok");
        })
        .catch(function () {
          setMensaje("No pudimos enviar tu reseña. Intentá de nuevo más tarde.", "error");
        })
        .then(function () {
          boton.disabled = false;
          boton.textContent = "Enviar reseña";
        });
    });
  }

  cargarResenas();
})();

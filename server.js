/* =========================================================
   Té Quiero Pastelería - Servidor
   - Sirve la web (index.html, menu.html, css, js, assets)
   - API de reseñas:
       GET  /api/resenas            -> reseñas publicadas
       POST /api/resenas            -> nueva reseña (queda pendiente de revisión)
   - Moderación (requiere la variable de entorno ADMIN_TOKEN):
       GET    /api/admin/resenas          -> todas (incluye pendientes)
       PATCH  /api/admin/resenas/:id      -> body: { "aprobada": true | false }
       DELETE /api/admin/resenas/:id
   Sin dependencias externas: solo módulos built-in de Node.js (v18+).
   Uso:  node server.js          (o: npm start)
         PORT=8080 ADMIN_TOKEN=clave-secreta node server.js
   ========================================================= */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "resenas.json");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

const MAX_BODY_BYTES = 10 * 1024;          // tamaño máximo del body JSON
const LIMITE_VENTANA_MS = 10 * 60 * 1000;  // ventana de 10 minutos
const LIMITE_POR_VENTANA = 5;              // máximo de reseñas por IP en esa ventana
const MAX_NOMBRE = 60;
const MAX_TEXTO = 600;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------- Almacenamiento en archivo JSON ---------- */

function leerResenas() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function guardarResenas(lista) {
  // Escribe a un archivo temporal y lo reemplaza: evita dejar el JSON a medias
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporal = DATA_FILE + ".tmp";
  fs.writeFileSync(temporal, JSON.stringify(lista, null, 2), "utf8");
  fs.renameSync(temporal, DATA_FILE);
}

/* ---------- Utilidades ---------- */

function enviarJSON(res, status, obj) {
  const cuerpo = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(cuerpo),
    "Cache-Control": "no-store",
  });
  res.end(cuerpo);
}

function errorHttp(status, mensaje) {
  return Object.assign(new Error(mensaje), { status: status, publicMessage: mensaje });
}

function leerJSON(req) {
  return new Promise(function (resolve, reject) {
    let total = 0;
    const partes = [];
    req.on("data", function (chunk) {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(errorHttp(413, "La solicitud es demasiado grande."));
        req.destroy();
        return;
      }
      partes.push(chunk);
    });
    req.on("end", function () {
      try {
        const texto = Buffer.concat(partes).toString("utf8");
        resolve(texto ? JSON.parse(texto) : {});
      } catch (e) {
        reject(errorHttp(400, "El formato de los datos no es válido."));
      }
    });
    req.on("error", reject);
  });
}

// Quita caracteres de control, colapsa espacios y recorta el largo
function limpiarTexto(valor, max) {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Límite simple por IP para evitar spam del formulario
const intentosPorIP = new Map();

function dentroDelLimite(ip) {
  const ahora = Date.now();
  const recientes = (intentosPorIP.get(ip) || []).filter(function (t) {
    return ahora - t < LIMITE_VENTANA_MS;
  });
  if (recientes.length >= LIMITE_POR_VENTANA) {
    intentosPorIP.set(ip, recientes);
    return false;
  }
  recientes.push(ahora);
  intentosPorIP.set(ip, recientes);
  return true;
}

function esAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const recibido = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const esperado = Buffer.from(ADMIN_TOKEN);
  return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

/* ---------- API pública de reseñas ---------- */

// Solo se exponen los campos públicos (no el estado de moderación)
function resenaPublica(r) {
  return {
    id: r.id,
    nombre: r.nombre,
    texto: r.texto,
    guia_local: !!r.guia_local,
    opiniones: r.opiniones ?? null,
    fotos: r.fotos ?? null,
    fecha_texto: r.fecha_texto || "",
    creada: r.creada || "",
  };
}

async function manejarResenasPublicas(req, res) {
  if (req.method === "GET") {
    const publicadas = leerResenas().filter(function (r) { return r.aprobada; });
    return enviarJSON(res, 200, publicadas.map(resenaPublica));
  }

  if (req.method === "POST") {
    const ip = req.socket.remoteAddress || "desconocida";
    if (!dentroDelLimite(ip)) {
      return enviarJSON(res, 429, { error: "Ya enviaste varias reseñas. Probá de nuevo en unos minutos." });
    }

    const body = await leerJSON(req);

    // Campo trampa: los bots suelen completarlo. Respondemos OK pero no guardamos nada.
    if (body.web) {
      return enviarJSON(res, 201, { mensaje: "¡Gracias! Tu reseña se publica después de revisarla." });
    }

    const nombre = limpiarTexto(body.nombre, MAX_NOMBRE);
    const texto = limpiarTexto(body.texto, MAX_TEXTO);

    if (nombre.length < 2) {
      return enviarJSON(res, 400, { error: "Escribí tu nombre (mínimo 2 letras)." });
    }
    if (texto.length < 10) {
      return enviarJSON(res, 400, { error: "Contanos un poco más (mínimo 10 caracteres)." });
    }

    const lista = leerResenas();
    lista.push({
      id: crypto.randomUUID(),
      nombre: nombre,
      texto: texto,
      guia_local: false,
      opiniones: null,
      fotos: null,
      fecha_texto: "",
      creada: new Date().toISOString(),
      aprobada: false,          // queda pendiente hasta que la revises
    });
    guardarResenas(lista);

    return enviarJSON(res, 201, { mensaje: "¡Gracias! Tu reseña se publica después de revisarla." });
  }

  return enviarJSON(res, 405, { error: "Método no permitido." });
}

/* ---------- API de moderación ---------- */

async function manejarAdmin(req, res, id) {
  if (!ADMIN_TOKEN) {
    return enviarJSON(res, 503, { error: "Moderación deshabilitada: falta configurar ADMIN_TOKEN." });
  }
  if (!esAdmin(req)) {
    return enviarJSON(res, 401, { error: "No autorizado." });
  }

  const lista = leerResenas();

  if (!id && req.method === "GET") {
    return enviarJSON(res, 200, lista);
  }

  if (id && req.method === "PATCH") {
    const body = await leerJSON(req);
    const resena = lista.find(function (r) { return r.id === id; });
    if (!resena) return enviarJSON(res, 404, { error: "Reseña no encontrada." });
    if (typeof body.aprobada !== "boolean") {
      return enviarJSON(res, 400, { error: "Falta el campo 'aprobada' (true o false)." });
    }
    resena.aprobada = body.aprobada;
    guardarResenas(lista);
    return enviarJSON(res, 200, resena);
  }

  if (id && req.method === "DELETE") {
    const nueva = lista.filter(function (r) { return r.id !== id; });
    if (nueva.length === lista.length) return enviarJSON(res, 404, { error: "Reseña no encontrada." });
    guardarResenas(nueva);
    res.writeHead(204);
    return res.end();
  }

  return enviarJSON(res, 405, { error: "Método no permitido." });
}

/* ---------- Archivos estáticos ---------- */

function servirEstatico(req, res, pathname) {
  let relativo;
  try {
    relativo = decodeURIComponent(pathname);
  } catch (e) {
    return enviarTexto(res, 400, "Solicitud inválida.");
  }
  if (relativo === "/") relativo = "/index.html";

  const archivo = path.normalize(path.join(ROOT, relativo));
  const rel = path.relative(ROOT, archivo);

  // Nada fuera de la carpeta del proyecto, ni datos ni código del servidor
  if (rel.startsWith("..") || path.isAbsolute(rel)) return enviarTexto(res, 404, "No encontrado.");
  if (rel === "server.js" || rel === "package.json" || rel.startsWith("data" + path.sep) || rel.startsWith("node_modules")) {
    return enviarTexto(res, 404, "No encontrado.");
  }

  const tipo = MIME[path.extname(archivo).toLowerCase()];
  if (!tipo) return enviarTexto(res, 404, "No encontrado.");

  fs.readFile(archivo, function (err, datos) {
    if (err) return enviarTexto(res, 404, "No encontrado.");
    res.writeHead(200, {
      "Content-Type": tipo,
      "Content-Length": datos.length,
      "Cache-Control": "public, max-age=300",
    });
    if (req.method === "HEAD") return res.end();
    res.end(datos);
  });
}

function enviarTexto(res, status, texto) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(texto);
}

/* ---------- Enrutamiento ---------- */

async function manejarApi(req, res, url) {
  const p = url.pathname;

  if (p === "/api/resenas") return manejarResenasPublicas(req, res);

  const admin = p.match(/^\/api\/admin\/resenas(?:\/([^/]+))?$/);
  if (admin) return manejarAdmin(req, res, admin[1] ? decodeURIComponent(admin[1]) : null);

  return enviarJSON(res, 404, { error: "Ruta no encontrada." });
}

const servidor = http.createServer(async function (req, res) {
  try {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      return await manejarApi(req, res, url);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return enviarTexto(res, 405, "Método no permitido.");
    }
    return servirEstatico(req, res, url.pathname);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err.status) {
      return enviarJSON(res, err.status, { error: err.publicMessage || "Error en la solicitud." });
    }
    console.error(err);
    return enviarJSON(res, 500, { error: "Error interno. Intentá de nuevo más tarde." });
  }
});

servidor.listen(PORT, function () {
  console.log("Té Quiero web en http://localhost:" + PORT);
  if (!ADMIN_TOKEN) {
    console.log("Aviso: ADMIN_TOKEN no está configurado; la moderación de reseñas está deshabilitada.");
  }
});

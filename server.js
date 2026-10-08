const express = require("express");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Crear carpeta de descargas temporal
const downloadsDir = process.env.RENDER_FS ? 
  path.join("/var/data", "yt-dlp-downloads") : 
  path.join(os.homedir(), "Downloads", "yt-dlp-music");

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

console.log(`📁 Carpeta de descargas: ${downloadsDir}`);

// Endpoint para descargar una URL CON DESCARGA DIRECTA
app.post("/api/download", (req, res) => {
  const { url, format = "mp3", quality = "0" } = req.body;

  if (!url) {
    return res.status(400).json({ error: "La URL es obligatoria." });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "URL inválida." });
  }

  const allowedFormats = ["mp3", "m4a", "wav", "opus", "vorbis"];
  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ error: "Formato no soportado." });
  }

  const outputTemplate = path.join(downloadsDir, "%(title)s.%(ext)s");
  
  const args = [
    "-x",
    "--audio-format", format,
    "-o", outputTemplate,
    "--no-warnings",
    "--no-color",
    "--print", "after_move:filepath"
  ];

  if (quality && quality !== "0") {
    args.push("--audio-quality", quality);
  }

  args.push(url);

  console.log(`⏳ Descargando: ${url}`);

  let output = "";
  let filePath = null;

  const process = execFile("yt-dlp", args, { 
    maxBuffer: 50 * 1024 * 1024,
    timeout: 10 * 60 * 1000 
  }, (error, stdout, stderr) => {
    
    if (error) {
      console.error("❌ Error en descarga:", error.message);
      console.error("Stderr:", stderr);
      return res.status(500).json({
        error: "No se pudo completar la descarga.",
        details: stderr || error.message,
        code: error.code
      });
    }

    // Extraer ruta del archivo del output
    const lines = stdout.split("\n").filter(l => l.trim());
    const lastLine = lines[lines.length - 1];
    
    if (!lastLine || !lastLine.includes("/")) {
      console.error("❌ No se encontró la ruta del archivo en output:", stdout);
      return res.status(500).json({
        error: "No se generó el archivo de audio.",
        details: "El archivo no fue creado correctamente."
      });
    }

    filePath = lastLine.trim();

    console.log(`📁 Archivo generado: ${filePath}`);

    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.error("❌ El archivo no existe:", filePath);
      return res.status(500).json({
        error: "El archivo fue creado pero no se puede acceder.",
        details: filePath
      });
    }

    // Obtener información del archivo
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    
    console.log(`✅ Enviando archivo: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    // Configurar headers para descarga
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Length", stat.size);

    // Enviar el archivo
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on("error", (err) => {
      console.error("❌ Error leyendo archivo:", err);
      res.status(500).json({ error: "Error al leer el archivo." });
    });

    fileStream.pipe(res);

    // Limpiar el archivo después de 5 minutos
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Archivo temporal eliminado: ${fileName}`);
        }
      } catch (e) {
        console.error(`Error eliminando archivo temporal: ${e.message}`);
      }
    }, 5 * 60 * 1000);
  });

  process.stdout?.on("data", (data) => {
    output += data.toString();
  });

  process.stderr?.on("data", (data) => {
    output += data.toString();
  });
});

// Endpoint para descargar múltiples URLs
app.post("/api/download-batch", (req, res) => {
  const { urls, format = "mp3", quality = "0" } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Debes proporcionar al menos una URL." });
  }

  if (urls.length > 10) {
    return res.status(400).json({ error: "Máximo 10 URLs por lote." });
  }

  let completed = 0;
  let failed = 0;
  const results = [];

  const downloadNext = (index) => {
    if (index >= urls.length) {
      return res.json({
        success: true,
        message: `Completado: ${completed} exitosas, ${failed} fallidas`,
        completed,
        failed,
        results
      });
    }

    const urlItem = urls[index].trim();
    if (!urlItem) {
      return downloadNext(index + 1);
    }

    const args = [
      "-x",
      "--audio-format", format,
      "-o", path.join(downloadsDir, "%(title)s.%(ext)s"),
      "--no-warnings",
      "--no-color"
    ];

    if (quality && quality !== "0") {
      args.push("--audio-quality", quality);
    }

    args.push(urlItem);

    execFile("yt-dlp", args, { maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (error) => {
      if (error) {
        failed++;
        results.push({ url: urlItem, status: "error", error: error.message });
        console.error(`❌ Error descargando ${urlItem}:`, error.message);
      } else {
        completed++;
        results.push({ url: urlItem, status: "success" });
        console.log(`✅ Descargada: ${urlItem}`);
      }
      downloadNext(index + 1);
    });
  };

  downloadNext(0);
});

// Endpoint para listar descargas
app.get("/api/list-downloads", (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    const fileInfo = files
      .map((file) => {
        try {
          const filePath = path.join(downloadsDir, file);
          const stat = fs.statSync(filePath);
          return {
            name: file,
            size: (stat.size / 1024 / 1024).toFixed(2) + " MB",
            modified: new Date(stat.mtime).toLocaleString("es-ES"),
            path: filePath
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .slice(0, 20);

    res.json({ files: fileInfo, total: files.length });
  } catch (error) {
    res.status(500).json({ error: "No se pudo leer la carpeta de descargas." });
  }
});

// Endpoint para descargar un archivo existente
app.get("/api/download-file/:filename", (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(downloadsDir, filename);

    // Validar que la ruta está dentro de la carpeta permitida
    if (!filePath.startsWith(downloadsDir)) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Archivo no encontrado." });
    }

    const stat = fs.statSync(filePath);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", stat.size);

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: "Error al descargar el archivo." });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Servir el frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 Servidor escuchando en puerto ${PORT}`);
  console.log(`📁 Carpeta de descargas: ${downloadsDir}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});

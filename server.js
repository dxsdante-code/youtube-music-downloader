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

// Endpoint para descargar una URL
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

  const args = [
    "-x",
    "--audio-format",
    format,
    "-o",
    path.join(downloadsDir, "%(title)s.%(ext)s"),
    "--no-warnings",
    "--quiet"
  ];

  if (quality && quality !== "0") {
    args.push("--audio-quality", quality);
  }

  args.push(url);

  let output = "";
  const timeoutDuration = 5 * 60 * 1000; // 5 minutos

  const process = execFile("yt-dlp", args, { 
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutDuration 
  }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error en descarga:", error.message);
      return res.status(500).json({
        error: "No se pudo completar la descarga.",
        details: stderr || error.message
      });
    }

    res.json({
      success: true,
      message: "Descarga completada correctamente.",
      output: stdout || output
    });
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
      "--audio-format",
      format,
      "-o",
      path.join(downloadsDir, "%(title)s.%(ext)s"),
      "--no-warnings",
      "--quiet"
    ];

    if (quality && quality !== "0") {
      args.push("--audio-quality", quality);
    }

    args.push(urlItem);

    execFile("yt-dlp", args, { maxBuffer: 20 * 1024 * 1024, timeout: 5 * 60 * 1000 }, (error) => {
      if (error) {
        failed++;
        results.push({ url: urlItem, status: "error", error: error.message });
        console.error(`Error descargando ${urlItem}:`, error.message);
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
            modified: new Date(stat.mtime).toLocaleString("es-ES")
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

// Endpoint para limpiar descargas antiguas
app.post("/api/cleanup", (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    let deleted = 0;

    files.forEach((file) => {
      try {
        const filePath = path.join(downloadsDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {
        console.error(`Error limpiando ${file}:`, e.message);
      }
    });

    res.json({ success: true, message: `${deleted} archivos eliminados.` });
  } catch (error) {
    res.status(500).json({ error: "Error en la limpieza." });
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

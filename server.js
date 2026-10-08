const express = require("express");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Crear carpeta de descargas si no existe
const downloadsDir = path.join(os.homedir(), "Downloads", "yt-dlp-music");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Endpoint para descargar una sola URL
app.post("/api/download", (req, res) => {
  const { url, format, audioOnly, quality } = req.body;

  if (!url) {
    return res.status(400).json({ error: "La URL es obligatoria." });
  }

  // Validar que sea una URL válida
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "URL inválida." });
  }

  let args = [];

  // Configurar formato y calidad
  if (audioOnly) {
    args.push("-x");
    args.push("--audio-format", format);
    if (quality && quality !== "best") {
      args.push("--audio-quality", quality);
    }
  } else {
    args.push("-f", "best[ext=mp4]");
  }

  // Configurar ruta de salida
  args.push("-o", path.join(downloadsDir, "%(title)s.%(ext)s"));
  args.push("--progress");
  args.push("--no-warnings");
  args.push(url);

  let output = "";
  let downloadedFile = "";

  const process = execFile("yt-dlp", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error("Error:", error);
      return res.status(500).json({
        error: "Error en la descarga",
        details: stderr || error.message,
        stdout: stdout
      });
    }

    res.json({
      success: true,
      message: "¡Descarga completada!",
      output: output || stdout,
      folder: downloadsDir
    });
  });

  // Capturar salida en tiempo real
  process.stdout.on("data", (data) => {
    output += data.toString();
    console.log("STDOUT:", data.toString());
  });

  process.stderr.on("data", (data) => {
    output += data.toString();
    console.log("STDERR:", data.toString());
  });

  // Enviar respuesta inicial
  res.on("finish", () => {
    // La respuesta ya fue enviada
  });
});

// Endpoint para descargar múltiples URLs
app.post("/api/download-batch", (req, res) => {
  const { urls, format, audioOnly, quality } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Debes proporcionar al menos una URL." });
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
        results,
        folder: downloadsDir
      });
    }

    const url = urls[index].trim();
    if (!url) {
      return downloadNext(index + 1);
    }

    let args = [];

    if (audioOnly) {
      args.push("-x");
      args.push("--audio-format", format);
      if (quality && quality !== "best") {
        args.push("--audio-quality", quality);
      }
    } else {
      args.push("-f", "best[ext=mp4]");
    }

    args.push("-o", path.join(downloadsDir, "%(title)s.%(ext)s"));
    args.push("--no-warnings");
    args.push(url);

    execFile("yt-dlp", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        failed++;
        results.push({ url, status: "error", error: error.message });
      } else {
        completed++;
        results.push({ url, status: "success", output: stdout });
      }
      downloadNext(index + 1);
    });
  };

  downloadNext(0);
});

// Endpoint para obtener información de la carpeta de descargas
app.get("/api/downloads-folder", (req, res) => {
  res.json({ folder: downloadsDir });
});

// Endpoint para listar descargas
app.get("/api/list-downloads", (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    const fileInfo = files.map((file) => {
      const filePath = path.join(downloadsDir, file);
      const stat = fs.statSync(filePath);
      return {
        name: file,
        size: (stat.size / 1024 / 1024).toFixed(2) + " MB",
        modified: stat.mtime.toLocaleString()
      };
    });
    res.json({ files: fileInfo, folder: downloadsDir });
  } catch (error) {
    res.status(500).json({ error: "No se pudo leer la carpeta de descargas." });
  }
});

// Servir el HTML principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎵 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Descargas guardadas en: ${downloadsDir}`);
});

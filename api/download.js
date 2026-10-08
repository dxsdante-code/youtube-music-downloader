const fs = require("fs");
const os = require("os");
const path = require("path");
const ffmpegPath = require("ffmpeg-static");
const youtubedl = require("youtube-dl-exec");

const allowedFormats = ["mp3", "m4a", "wav"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, format = "mp3", quality = "0" } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: "La URL es obligatoria." });
  }

  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ error: "Formato no soportado." });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "La URL no es válida." });
  }

  const tmpDir = path.join(os.tmpdir(), "yt-dlp-vercel");
  fs.mkdirSync(tmpDir, { recursive: true });

  const outputTemplate = path.join(tmpDir, "%(title)s.%(ext)s");

  try {
    const opts = {
      extractAudio: true,
      audioFormat: format,
      noWarnings: true,
      noCheckCertificate: true,
      ffmpegLocation: ffmpegPath,
      output: outputTemplate,
      noColor: true,
      addHeader: [
        "referer:https://www.youtube.com",
        "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      ],
      print: "after_move:filepath"
    };

    if (quality && quality !== "0") {
      opts.audioQuality = quality;
    }

    const result = await youtubedl(url, opts);
    const stdout = typeof result === "string" ? result : result?.stdout || "";
    const filePath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(500).json({
        error: "No se pudo generar el archivo de audio.",
        debug: stdout
      });
    }

    const buffer = fs.readFileSync(filePath);
    const mimeMap = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };

    res.setHeader("Content-Type", mimeMap[format] || "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`
    );

    res.send(buffer);

    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({
      error: "No se pudo completar la descarga.",
      details: error.message || "Error desconocido."
    });
  }
}

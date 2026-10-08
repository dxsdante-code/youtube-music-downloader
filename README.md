# 🎵 Descargador de Música de YouTube

Descargador de música desde YouTube, SoundCloud y cientos de plataformas usando yt-dlp y Node.js.

## 🚀 Características

- Descarga música de YouTube y otras plataformas
- Soporta múltiples formatos: MP3, M4A, WAV, OPUS
- Control de calidad de audio
- Descarga directa al navegador
- Interfaz web moderna y responsiva

## 📋 Requisitos

- Node.js 18+
- ffmpeg
- yt-dlp

## 🔧 Instalación Local

```bash
npm install
chmod +x render-build.sh
./render-build.sh
npm start
```

Luego abre `http://localhost:3000`

## 🌐 Despliegue en Render

1. Sube el proyecto a GitHub
2. Entra en https://dashboard.render.com
3. Crea un nuevo "Web Service"
4. Conecta tu repositorio
5. Configura:
   - **Build Command:** `chmod +x render-build.sh && ./render-build.sh`
   - **Start Command:** `npm start`
   - **Node Version:** 18

## 📝 Uso

1. Pega una URL válida (YouTube, SoundCloud, etc.)
2. Selecciona formato (MP3, M4A, WAV)
3. Elige calidad
4. Haz click en "Descargar"
5. El archivo se descargará automáticamente

## ⚖️ Licencia

MIT

## ⚠️ Nota

Respeta los derechos de autor. Úsalo solo para contenido que tengas permiso de descargar.

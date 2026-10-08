#!/usr/bin/env bash

echo "📦 Actualizando paquetes del sistema..."

# En Ubuntu/Debian
apt-get update
apt-get install -y python3-pip ffmpeg

# Instalar yt-dlp
pip3 install --upgrade yt-dlp

echo "✅ Instalación completada!"
yt-dlp --version
ffmpeg -version | head -1

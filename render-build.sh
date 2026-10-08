#!/usr/bin/env bash

set -e

echo "Instalando dependencias del sistema..."
apt-get update
apt-get install -y python3-pip ffmpeg

echo "Instalando yt-dlp..."
pip3 install --upgrade yt-dlp

echo "Verificando instalaciones..."
yt-dlp --version
ffmpeg -version | head -1

echo "✅ Todas las dependencias instaladas correctamente"

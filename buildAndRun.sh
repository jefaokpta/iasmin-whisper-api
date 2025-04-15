#!/usr/bin/env bash

echo "🚀 Buildando Iasmin Whisper API"

echo "🔄 Sincronizando com GitHub"
git pull

echo "📦 Instalando dependências"
npm install

echo "🛠️ Buildando o projeto"
npm run build

echo "🧹 Limpando logs antigos"
rm /var/log/iasmin-whisper-api.log

echo "🔄 Reiniciando serviço Iasmin Asterisk API"
systemctl restart iasmin-whisper-api

echo "✅ Iasmin Whisper API is rodando"

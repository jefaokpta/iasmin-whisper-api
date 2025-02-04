#!/usr/bin/env bash

echo "Building and running Iasmin Asterisk Manager"

git pull
npm run build
rm /var/log/iasmin-whisper-api.log
systemctl restart iasmin-whisper-api

echo "Iasmin Whisper API is running"
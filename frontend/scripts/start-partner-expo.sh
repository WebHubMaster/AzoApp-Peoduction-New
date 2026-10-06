#!/bin/sh
# Starts the Partner App Expo dev server (port 3002) with a public tunnel for Expo Go.
cd /app/frontend
export EXPO_NO_TELEMETRY=1
export CI=1
exec /usr/bin/node ./node_modules/.bin/expo start --port 3002 --tunnel

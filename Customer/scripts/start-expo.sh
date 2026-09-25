#!/bin/sh
# Starts the Customer App Expo dev server (port 3001) with a public tunnel for Expo Go QR/URL.
cd /app/Customer
export CI=1
exec /usr/bin/node ./node_modules/.bin/expo start --port 3001 --tunnel

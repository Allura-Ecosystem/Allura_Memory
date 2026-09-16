#!/bin/sh
set -eu

bun /app/scripts/generate-runtime-auth-manifest.ts
exec bun server.js

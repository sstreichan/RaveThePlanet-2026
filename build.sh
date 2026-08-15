#!/usr/bin/env sh
set -eu

# Build: bundle + minify JS/CSS (bun's built-in bundler), assemble into dist/
rm -rf dist
mkdir -p dist

bun build app.js --minify --target=browser --outdir dist/
bun build style.css --minify --outdir dist/

# Static assets: data.json is already compact, index.html is negligible — copy as-is
cp index.html dist/
cp data.json dist/

echo "Build complete → dist/"

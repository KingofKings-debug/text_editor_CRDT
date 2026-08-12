#!/bin/bash
# Compile C++ CRDT engine to WebAssembly
# Requires: Docker with emscripten/emsdk image

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$(cd "$SCRIPT_DIR/../../public" && pwd)"

echo "Compiling C++ CRDT Engine to WebAssembly..."

emcc -O3 --bind crdt_engine.cpp \
  -o crdt_wasm.js \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_NAME="createCrdtModule" \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1

# Copy .wasm to public for static serving
cp "$SCRIPT_DIR/crdt_wasm.wasm" "$PUBLIC_DIR/"

echo "Done -> crdt_wasm.js (in src/crdt/) + crdt_wasm.wasm (in public/)"

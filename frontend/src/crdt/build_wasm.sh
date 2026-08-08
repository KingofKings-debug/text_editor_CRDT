#!/bin/bash
# Shell script to compile crdt_engine.cpp to WebAssembly using Emscripten Docker container

echo "Compiling C++ CRDT Engine to WebAssembly..."

docker run --rm -v "$(pwd):/src" emscripten/emsdk \
  emcc -O3 --bind crdt_engine.cpp \
  -o crdt_wasm.js \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_NAME="createCrdtModule" \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1

echo "WebAssembly compilation completed successfully -> crdt_wasm.js & crdt_wasm.wasm"

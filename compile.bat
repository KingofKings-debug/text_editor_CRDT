@echo off
cd emsdk
call emsdk.bat activate latest
call emsdk_env.bat
cd ..\frontend\src\crdt
call emcc -O3 --bind crdt_engine.cpp -o crdt_wasm.js -s WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORT_NAME="createCrdtModule" -s MODULARIZE=1 -s EXPORT_ES6=1
copy /Y crdt_wasm.wasm ..\..\public\
echo Done compiling!

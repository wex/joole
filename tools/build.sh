#!/bin/sh
set -eu
if command -v emcc >/dev/null 2>&1; then
  make -C tools/qbsp3
else
  docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:latest make -C tools/qbsp3
fi

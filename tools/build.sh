#!/bin/sh
set -eu
if command -v emcc >/dev/null 2>&1; then
  make -C tools/qbsp3
  make -C tools/qvis3 all threaded
  make -C tools/qrad3 all threaded
else
  docker run --rm -v "$PWD:/src" -w /src emscripten/emsdk:latest sh -c "make -C tools/qbsp3 && make -C tools/qvis3 all threaded && make -C tools/qrad3 all threaded"
fi

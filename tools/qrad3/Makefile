EMCC ?= emcc
OUT ?= ../../public/wasm/qrad3.mjs
COMMON = ../qbsp3/common

SRCS = \
	qrad3src/lightmap.c qrad3src/patches.c qrad3src/qrad3.c qrad3src/trace.c \
	$(COMMON)/bspfile.c $(COMMON)/cmdlib.c $(COMMON)/mathlib.c \
	$(COMMON)/lbmlib.c $(COMMON)/polylib.c $(COMMON)/scriplib.c $(COMMON)/threads.c

all:
	$(EMCC) -O2 -I$(COMMON) -Iqrad3src \
		-Wno-implicit-function-declaration -Wno-format-security -Wno-int-conversion -fcommon \
		$(SRCS) -o $(OUT) -lm \
		-sENVIRONMENT='node,web,worker' -sMODULARIZE=1 -sEXPORT_NAME='createQrad3' \
		-sEXPORTED_FUNCTIONS='["_main"]' \
		-sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
		-sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sSTACK_SIZE=4194304


OUTT ?= ../../public/wasm/qrad3t.mjs

threaded:
	$(EMCC) -O2 -I$(COMMON) -Iqrad3src \
		-D__EMSCRIPTEN_THREADS -pthread \
		-Wno-implicit-function-declaration -Wno-format-security -Wno-int-conversion -fcommon \
		$(SRCS) -o $(OUTT) -lm \
		-sENVIRONMENT='node,web,worker' -sMODULARIZE=1 -sEXPORT_NAME='createQrad3t' \
		-sEXPORTED_FUNCTIONS='["_main"]' \
		-sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
		-sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sSTACK_SIZE=4194304 \
		-sINITIAL_MEMORY=67108864 -sPTHREAD_POOL_SIZE=8

clean:
	rm -f ../../public/wasm/qrad3.mjs ../../public/wasm/qrad3.wasm ../../public/wasm/qrad3t.mjs ../../public/wasm/qrad3t.wasm

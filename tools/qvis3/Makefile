EMCC ?= emcc
OUT ?= ../../workers/wasm/qvis3.mjs
COMMON = ../qbsp3/common

SRCS = \
	qvis3src/flow.c qvis3src/qvis3.c \
	$(COMMON)/bspfile.c $(COMMON)/cmdlib.c $(COMMON)/mathlib.c \
	$(COMMON)/polylib.c $(COMMON)/scriplib.c $(COMMON)/threads.c

all:
	$(EMCC) -O2 -I$(COMMON) -Iqvis3src \
		-Wno-implicit-function-declaration -Wno-format-security -Wno-int-conversion -fcommon \
		$(SRCS) -o $(OUT) -lm \
		-sENVIRONMENT='node,web,worker' -sMODULARIZE=1 -sEXPORT_NAME='createQvis3' \
		-sEXPORTED_FUNCTIONS='["_main"]' \
		-sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
		-sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sSTACK_SIZE=4194304

clean:
	rm -f ../../workers/wasm/qvis3.mjs ../../workers/wasm/qvis3.wasm

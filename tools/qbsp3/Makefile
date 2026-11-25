EMCC ?= emcc
OUT ?= ../../public/wasm/qbsp3.mjs

SRCS = \
	qbsp3/brushbsp.c qbsp3/csg.c qbsp3/faces.c qbsp3/glfile.c \
	qbsp3/leakfile.c qbsp3/map.c qbsp3/nodraw.c qbsp3/portals.c \
	qbsp3/prtfile.c qbsp3/qbsp3.c qbsp3/textures.c qbsp3/tree.c \
	qbsp3/writebsp.c common/bspfile.c common/cmdlib.c common/mathlib.c \
	common/polylib.c common/scriplib.c common/threads.c

all:
	$(EMCC) -O2 -Icommon -Iqbsp3 \
		-Wno-implicit-function-declaration -Wno-format-security -Wno-int-conversion \
		$(SRCS) -o $(OUT) -lm \
		-sENVIRONMENT='node,web,worker' -sMODULARIZE=1 -sEXPORT_NAME='createQbsp3' \
		-sEXPORTED_FUNCTIONS='["_main"]' \
		-sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
		-sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0

clean:
	rm -f ../../public/wasm/qbsp3.mjs ../../public/wasm/qbsp3.wasm

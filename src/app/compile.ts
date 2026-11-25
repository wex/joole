import type { CompileTool } from '@core/types/index';

/** The compile profile chosen in the editor state (fast, normal or final). */
export type CompileProfile = 'fast' | 'normal' | 'final';

export interface CompileStepIO {
  readonly tool: CompileTool;
  readonly args: readonly string[];
  readonly files: readonly { path: string; data: Uint8Array }[];
  readonly outputs: readonly string[];
}

export interface CompileStepResult {
  readonly files: readonly { path: string; data: Uint8Array }[];
  /** The captured stdout, when the runner provides it, for error detection. */
  readonly output?: string;
}

/** Runs one tool, exactly what the compile worker client does. */
export type CompileRunner = (step: CompileStepIO) => Promise<CompileStepResult>;

export interface PipelineResult {
  readonly bsp: Uint8Array;
  readonly prt: Uint8Array | null;
  readonly pts: Uint8Array | null;
  /** True when qbsp3 reported a leak: the .lin pointfile then holds the leak path. */
  readonly leaked: boolean;
  readonly steps: readonly CompileTool[];
}

/** The tools print a banner on fatal errors; the run must not continue. */
function checkStepOutput(tool: string, output: string | undefined): void {
  if (output && /\*+ ERROR \*+/i.test(output)) {
    const lines = output.split('\n');
    const at = lines.findIndex((line) => /\*+ ERROR \*+/.test(line));
    const detail = lines
      .slice(at + 1, at + 4)
      .join(' ')
      .trim();
    throw new Error(`${tool} failed: ${detail || 'see the log'}`);
  }
}

const Q2PREFIX = '/quake2/baseq2';

function baseName(mapName: string): string {
  return mapName.replace(/\.map$/i, '');
}

/**
 * The compile pipeline: qbsp3 turns the exported .map into a .bsp and .prt,
 * qvis3 adds visibility, qrad3 the lighting. The fast profile stops before
 * radiosity and runs vis in fast mode; final passes -extra to qrad3.
 * Every step runs in its own worker, so cancelling between steps does not
 * corrupt the chain.
 */
export async function runCompilePipeline(
  run: CompileRunner,
  profile: CompileProfile,
  mapName: string,
  mapText: string,
  textureWals: readonly { name: string; data: Uint8Array }[],
  colormap: Uint8Array | null,
): Promise<PipelineResult> {
  const base = baseName(mapName);
  const mapPath = `${Q2PREFIX}/maps/${base}.map`;
  const bspPath = `${Q2PREFIX}/maps/${base}.bsp`;
  const prtPath = `${Q2PREFIX}/maps/${base}.prt`;
  const ptsPath = `${Q2PREFIX}/maps/${base}.lin`;
  const walFiles = textureWals.map((wal) => ({
    path: `${Q2PREFIX}/textures/${wal.name}.wal`,
    data: wal.data,
  }));

  // qbsp3: the map plus the wal headers of every texture it uses.
  const qbsp = await run({
    tool: 'qbsp3',
    args: [mapPath],
    files: [{ path: mapPath, data: new TextEncoder().encode(mapText) }, ...walFiles],
    outputs: [bspPath, prtPath, ptsPath],
  });
  checkStepOutput('qbsp3', qbsp.output);
  const bsp = qbsp.files.find((f) => f.path === bspPath)?.data;
  if (!bsp) throw new Error('qbsp3 produced no .bsp');
  const pts = qbsp.files.find((f) => f.path === ptsPath)?.data ?? null;
  const prt = qbsp.files.find((f) => f.path === prtPath)?.data ?? null;
  const leaked = pts !== null;
  if (leaked) {
    // A leak stops the chain: vis cannot run on an unsealed map.
    return { bsp, prt, pts, leaked, steps: ['qbsp3'] };
  }

  // qvis3: reads the bsp and prt, rewrites the bsp in place.
  const visArgs = profile === 'fast' ? ['-fast', bspPath] : [bspPath];
  const vis = await run({
    tool: 'qvis3',
    args: visArgs,
    files: [{ path: bspPath, data: bsp }, ...(prt ? [{ path: prtPath, data: prt }] : [])],
    outputs: [bspPath],
  });
  checkStepOutput('qvis3', vis.output);
  const visedBsp = vis.files.find((f) => f.path === bspPath)?.data;
  if (!visedBsp) throw new Error('qvis3 produced no .bsp');

  if (profile === 'fast') {
    return { bsp: visedBsp, prt, pts, leaked, steps: ['qbsp3', 'qvis3'] };
  }

  // qrad3: the colormap is required for texture light colors.
  // qrad3 reads the .wal files again, for the light colors of textures.
  const radFiles = [{ path: bspPath, data: visedBsp }, ...walFiles];
  if (colormap) {
    radFiles.push({ path: `${Q2PREFIX}/pics/colormap.pcx`, data: colormap });
  }
  const radArgs = profile === 'final' ? ['-extra', bspPath] : [bspPath];
  const rad = await run({
    tool: 'qrad3',
    args: radArgs,
    files: radFiles,
    outputs: [bspPath],
  });
  checkStepOutput('qrad3', rad.output);
  const litBsp = rad.files.find((f) => f.path === bspPath)?.data;
  if (!litBsp) throw new Error('qrad3 produced no .bsp');
  return {
    bsp: litBsp,
    prt,
    pts,
    leaked,
    steps: ['qbsp3', 'qvis3', 'qrad3'],
  };
}

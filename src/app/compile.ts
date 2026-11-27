import type { CompileTool } from '@core/types/index';

/** VIS is optional; fast mode preserves the old fast-vis quick compile. */
export type CompileVisMode = 'off' | 'fast' | 'full';
/** Lighting is optional; final passes qrad3's -extra quality flag. */
export type CompileLightingMode = 'off' | 'normal' | 'final';

export interface CompileOptions {
  readonly vis: CompileVisMode;
  readonly lighting: CompileLightingMode;
}

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
  /** Captured stdout/stderr per tool, when the runner provides it. */
  readonly stepOutputs: Partial<Record<CompileTool, string>>;
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
 * The compile pipeline: qbsp3 always turns the exported .map into a .bsp and
 * .prt, while qvis3 and qrad3 are independent options. Lighting without VIS is
 * allowed: qrad3 treats missing visdata as all-visible, merely doing more work.
 * Every step runs in its own worker, so cancelling between steps does not
 * corrupt the chain.
 */
export async function runCompilePipeline(
  run: CompileRunner,
  options: CompileOptions,
  mapName: string,
  mapText: string,
  textureWals: readonly { name: string; data: Uint8Array }[],
  colormap: Uint8Array | null,
  onStage?: (tool: CompileTool) => void,
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
  const steps: CompileTool[] = [];
  const stepOutputs: Partial<Record<CompileTool, string>> = {};
  onStage?.('qbsp3');
  const qbsp = await run({
    tool: 'qbsp3',
    args: [mapPath],
    files: [{ path: mapPath, data: new TextEncoder().encode(mapText) }, ...walFiles],
    outputs: [bspPath, prtPath, ptsPath],
  });
  checkStepOutput('qbsp3', qbsp.output);
  if (qbsp.output !== undefined) stepOutputs.qbsp3 = qbsp.output;
  const bsp = qbsp.files.find((f) => f.path === bspPath)?.data;
  if (!bsp) throw new Error('qbsp3 produced no .bsp');
  const pts = qbsp.files.find((f) => f.path === ptsPath)?.data ?? null;
  const prt = qbsp.files.find((f) => f.path === prtPath)?.data ?? null;
  const leaked = pts !== null;
  steps.push('qbsp3');
  if (leaked) {
    // A leak stops the chain: vis cannot run on an unsealed map.
    return { bsp, prt, pts, leaked, steps, stepOutputs };
  }

  let currentBsp = bsp;
  if (options.vis !== 'off') {
    // qvis3: reads the bsp and prt, rewrites the bsp in place.
    onStage?.('qvis3');
    const visArgs = options.vis === 'fast' ? ['-fast', bspPath] : [bspPath];
    const vis = await run({
      tool: 'qvis3',
      args: visArgs,
      files: [{ path: bspPath, data: currentBsp }, ...(prt ? [{ path: prtPath, data: prt }] : [])],
      outputs: [bspPath],
    });
    checkStepOutput('qvis3', vis.output);
    if (vis.output !== undefined) stepOutputs.qvis3 = vis.output;
    const nextBsp = vis.files.find((f) => f.path === bspPath)?.data;
    if (!nextBsp) throw new Error('qvis3 produced no .bsp');
    currentBsp = nextBsp;
    steps.push('qvis3');
  }

  if (options.lighting === 'off') {
    return { bsp: currentBsp, prt, pts, leaked, steps, stepOutputs };
  }

  // qrad3: the colormap is required for texture light colors.
  // qrad3 reads the .wal files again, for the light colors of textures.
  const radFiles = [{ path: bspPath, data: currentBsp }, ...walFiles];
  if (colormap) {
    radFiles.push({ path: `${Q2PREFIX}/pics/colormap.pcx`, data: colormap });
  }
  const radArgs = options.lighting === 'final' ? ['-extra', bspPath] : [bspPath];
  onStage?.('qrad3');
  const rad = await run({
    tool: 'qrad3',
    args: radArgs,
    files: radFiles,
    outputs: [bspPath],
  });
  checkStepOutput('qrad3', rad.output);
  if (rad.output !== undefined) stepOutputs.qrad3 = rad.output;
  const litBsp = rad.files.find((f) => f.path === bspPath)?.data;
  if (!litBsp) throw new Error('qrad3 produced no .bsp');
  return {
    bsp: litBsp,
    prt,
    pts,
    leaked,
    steps: [...steps, 'qrad3'],
    stepOutputs,
  };
}

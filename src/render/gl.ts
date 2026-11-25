function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('could not create a shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compilation failed: ${log}`);
  }
  return shader;
}

/** Compiles and links a program; a failure throws with the info log. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

export type Uniforms<T extends string> = Readonly<Record<T, WebGLUniformLocation | null>>;

/** The locations of a program's uniforms by name. */
export function uniformLocations<T extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly T[],
): Uniforms<T> {
  const locations = {} as Record<T, WebGLUniformLocation | null>;
  for (const name of names) {
    locations[name] = gl.getUniformLocation(program, name);
  }
  return locations;
}

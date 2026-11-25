#version 300 es
// Brush faces of the 3D view. The vertex format is FACE_STRIDE in brushMesh.ts.
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aTexel;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in uint aIndex;

uniform mat4 uViewProjection;
// The size of the texture bound for the batch: the UVs are in texels.
uniform vec2 uTextureSize;
uniform highp usampler2D uState;

out vec2 vUv;
out float vShade;
flat out uint vSelected;

// Brightness from the face normal, so shapes stand out without lighting.
const vec3 SHADE_DIRECTION = vec3(0.32, 0.54, 0.78);

void main() {
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
  vUv = aTexel / uTextureSize;
  vShade = 0.75 + 0.25 * dot(normalize(aNormal), normalize(SHADE_DIRECTION));
  ivec2 size = textureSize(uState, 0);
  int i = int(aIndex);
  vSelected = texelFetch(uState, ivec2(i % size.x, i / size.x), 0).r & 1u;
}

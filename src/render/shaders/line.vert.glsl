#version 300 es
// Wide wireframe lines as instanced quads, because gl.lineWidth is limited to
// one pixel on most platforms. The instance format is LINE_STRIDE in
// brushMesh.ts.
layout(location = 0) in vec2 aCorner; // x: 0 at a, 1 at b; y: -1 or 1 across the line
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in uint aIndex;

uniform mat4 uViewProjection;
uniform vec2 uViewportSize;
uniform float uWidth;
// 0 draws the unselected lines and 1 the selected ones, so selection is on top.
uniform int uPass;
uniform bool uEntitiesOnly;
uniform highp usampler2D uState;
uniform vec4 uBrushColor;
uniform vec4 uEntityColor;
uniform vec4 uSelectColor;
uniform vec4 uInvalidColor;
uniform vec4 uHandleColor;
uniform vec4 uLeakColor;

out vec4 vColor;

const float NEAR_W = 1e-3;
const vec4 OUTSIDE = vec4(2.0, 2.0, 2.0, 1.0);

void main() {
  ivec2 size = textureSize(uState, 0);
  int i = int(aIndex);
  uvec4 texel = texelFetch(uState, ivec2(i % size.x, i / size.x), 0);
  uint state = texel.r;
  bool selected = (state & 1u) != 0u;
  bool entity = (state & 2u) != 0u;
  bool invalid = (state & 4u) != 0u;
  bool dimmed = (state & 8u) != 0u;
  bool leak = (state & 16u) != 0u;
  bool handle = (state & 64u) != 0u;
  vec4 a = uViewProjection * vec4(aA, 1.0);
  vec4 b = uViewProjection * vec4(aB, 1.0);
  vec4 classColor = vec4(vec3(texel.gba) / 255.0, 1.0);
  bool hasClassColor = entity && (texel.g + texel.b + texel.a) > 0u;
  vColor = handle ? uHandleColor : invalid ? uInvalidColor : selected ? uSelectColor : entity ? (hasClassColor ? classColor : uEntityColor) : uBrushColor;
  if (dimmed) {
    vColor = vec4(vColor.rgb * 0.35, vColor.a);
  }
  if (leak) {
    vColor = uLeakColor;
  }
  // Freed instances are zeroed, so a == b; they and filtered lines collapse.
  if (aA == aB || selected != (uPass == 1) || (uEntitiesOnly && !entity) ||
      (a.w < NEAR_W && b.w < NEAR_W)) {
    gl_Position = OUTSIDE;
    return;
  }
  // Clip the segment at the near plane, so lines behind the camera do not flip.
  if (a.w < NEAR_W) {
    a = mix(a, b, (NEAR_W - a.w) / (b.w - a.w));
  } else if (b.w < NEAR_W) {
    b = mix(b, a, (NEAR_W - b.w) / (a.w - b.w));
  }
  vec2 half_size = uViewportSize * 0.5;
  vec2 screenA = a.xy / a.w * half_size;
  vec2 screenB = b.xy / b.w * half_size;
  vec2 d = screenB - screenA;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  vec4 p = aCorner.x < 0.5 ? a : b;
  vec2 offset = (normal * aCorner.y + dir * (aCorner.x * 2.0 - 1.0)) * uWidth * 0.5;
  p.xy += offset / half_size * p.w;
  gl_Position = p;
}

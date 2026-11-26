#version 300 es
// Screen-space handle dots for vertex, edge and face editing: instanced
// quads of a fixed CSS-pixel size, so the hit target is visible at any zoom.
layout(location = 0) in vec2 aCorner; // -1..1 across the quad
layout(location = 1) in vec3 aCenter;
layout(location = 2) in uint aState; // 0 idle, 1 hover, 2 active

uniform mat4 uViewProjection;
uniform vec2 uViewportSize;
// The backing ratio: sizes are specified in CSS pixels.
uniform float uScale;
// The idle dot diameter in CSS pixels, from the Handle size setting.
uniform float uSize;

flat out uint vState;
out vec2 vCorner;
out float vHalfSize;

const vec4 OUTSIDE = vec4(2.0, 2.0, 2.0, 1.0);

void main() {
  vState = aState;
  vCorner = aCorner;
  vec4 c = uViewProjection * vec4(aCenter, 1.0);
  if (c.w < 1e-3) {
    gl_Position = OUTSIDE;
    return;
  }
  float size = aState == 0u ? uSize : uSize * 9.0 / 7.0;
  vHalfSize = size * 0.5 * uScale;
  vec2 half_viewport = uViewportSize * 0.5;
  vec2 screen = c.xy / c.w * half_viewport;
  screen += aCorner * vHalfSize;
  gl_Position = vec4(screen / half_viewport * c.w, c.z, c.w);
}

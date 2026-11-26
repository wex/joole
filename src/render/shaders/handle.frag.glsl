#version 300 es
precision highp float;

uniform vec4 uIdleColor;
uniform vec4 uHoverColor;
// The 1 device pixel border, vp-bg, so the dots stand out over wireframes.
uniform vec4 uBorderColor;

flat in uint vState;
in vec2 vCorner;
in float vHalfSize;

out vec4 outColor;

void main() {
  float edge = max(abs(vCorner.x), abs(vCorner.y)) * vHalfSize;
  vec4 fill = vState == 0u ? uIdleColor : uHoverColor;
  outColor = edge > vHalfSize - 1.0 ? uBorderColor : fill;
}

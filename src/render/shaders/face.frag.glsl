#version 300 es
precision highp float;

uniform sampler2D uTexture;
// The flat colour, or the tint of the texture; alpha is the face's opacity.
uniform vec4 uColor;
uniform bool uTextured;
uniform bool uShaded;
uniform vec4 uSelectColor;

in vec2 vUv;
in float vShade;
flat in uint vSelected;

out vec4 outColor;

void main() {
  vec3 color = uTextured ? texture(uTexture, vUv).rgb * uColor.rgb : uColor.rgb;
  if (uShaded) {
    color *= vShade;
  }
  // Bit 1 is the selection tint; bit 8 dims faces outside the entered scope.
  if ((vSelected & 1u) != 0u) {
    color = mix(color, uSelectColor.rgb, 0.5);
  }
  if ((vSelected & 8u) != 0u) {
    color *= 0.45;
  }
  outColor = vec4(color, uColor.a);
}

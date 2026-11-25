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
  if (vSelected != 0u) {
    color = mix(color, uSelectColor.rgb, 0.5);
  }
  outColor = vec4(color, uColor.a);
}

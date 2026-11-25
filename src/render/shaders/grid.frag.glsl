#version 300 es
precision highp float;

// The procedural grid of the 2D views.
uniform vec2 uViewportOrigin; // gl_FragCoord of the view's bottom-left pixel corner
uniform vec2 uWorldOrigin; // world coordinates (right, up) at that corner
uniform float uUnitsPerPixel;
uniform float uGridSize;
uniform float uMajorA; // every 8th grid line
uniform float uMajorB; // every 64 units
uniform vec4 uBackground;
uniform vec4 uMinorColor;
uniform vec4 uMajorColor;
uniform vec4 uAxisColor;

out vec4 outColor;

// 1 on the one pixel whose centre is nearest a line, half-open, so a line
// on a pixel boundary is drawn exactly once. The sample point is a quarter
// pixel off the centre (see main), so float rounding cannot drop such a line
// from both of its pixels, and the tie goes to the pixel the rasteriser picks
// for a brush line at the same place.
float onLine(float pixelsFromLine) {
  return pixelsFromLine >= -0.5 && pixelsFromLine < 0.5 ? 1.0 : 0.0;
}

// The coverage of lines `spacing` units apart, faded out when the lines are
// closer than 4 pixels to each other.
float lines(float world, float spacing) {
  float f = world / spacing;
  float pixels = spacing / uUnitsPerPixel;
  return onLine((f - floor(f + 0.5)) * pixels) * smoothstep(2.0, 4.0, pixels);
}

void main() {
  vec2 world = uWorldOrigin + (gl_FragCoord.xy + 0.25 - uViewportOrigin) * uUnitsPerPixel;
  vec3 color = uBackground.rgb;
  color = mix(color, uMinorColor.rgb, max(lines(world.x, uGridSize), lines(world.y, uGridSize)));
  float major = max(
    max(lines(world.x, uMajorA), lines(world.y, uMajorA)),
    max(lines(world.x, uMajorB), lines(world.y, uMajorB))
  );
  color = mix(color, uMajorColor.rgb, major);
  float axis = max(onLine(world.x / uUnitsPerPixel), onLine(world.y / uUnitsPerPixel));
  color = mix(color, uAxisColor.rgb, axis);
  outColor = vec4(color, 1.0);
}

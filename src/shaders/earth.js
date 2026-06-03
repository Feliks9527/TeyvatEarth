// 大气辉光 shader（菲涅尔边缘光，营造原神天空盒氛围）
export const atmosphereVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const atmosphereFragment = /* glsl */`
  uniform vec3 glowColor;
  uniform float intensity;
  uniform float power;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), power);
    gl_FragColor = vec4(glowColor, fresnel * intensity);
  }
`

// 地球表面 cel-shading：把光照量化成几档，并叠加菲涅尔边缘描边
export const earthVertex = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const earthFragment = /* glsl */`
  uniform sampler2D mapTex;
  uniform sampler2D borderTex;
  uniform float borderMix;
  uniform vec3 lightDir;       // 视空间光照方向
  uniform vec3 rimColor;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 base = texture2D(mapTex, vUv);
    vec4 bord = texture2D(borderTex, vUv);

    vec3 N = normalize(vNormal);
    vec3 L = normalize(lightDir);
    float ndl = dot(N, L);

    // 卡通分档光照
    float lit;
    if (ndl > 0.45)      lit = 1.0;
    else if (ndl > 0.0)  lit = 0.78;
    else if (ndl > -0.4) lit = 0.5;
    else                 lit = 0.32;

    vec3 col = base.rgb * lit;

    // 昼夜交界暖色过渡
    float term = smoothstep(-0.15, 0.15, ndl);
    col = mix(col * vec3(0.7, 0.75, 0.95), col * vec3(1.08, 1.02, 0.9), term);

    // 国界叠加
    col = mix(col, bord.rgb, bord.a * borderMix);

    // 菲涅尔边缘光（描边感）
    vec3 V = normalize(vViewPosition);
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);
    col += rimColor * fres * 0.6;

    gl_FragColor = vec4(col, 1.0);
  }
`

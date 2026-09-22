<script setup lang="ts">
/**
 * 360° 全景查看器（纯 WebGL，无第三方依赖）。
 *
 * 默认处理影石相机的「双鱼眼」(dual-fisheye) 原图：一帧内左右两个圆形鱼眼画面。
 * 片段着色器把球面视线方向实时反投影回两个鱼眼圆并采样、在重叠区做平滑混合，
 * 从而还原出可拖拽 / 缩放的 360° 全景，无需后端或 SDK 预先拼接。
 * 也支持已是等距柱状投影 (equirectangular) 的图（mode="equirect"）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    mode?: "dual-fisheye" | "equirect";
    /** 单镜头全视场角（度）。影石 X 系列双鱼眼每颗约 200°，可微调以对齐接缝 */
    lensFov?: number;
    /** 左右镜头是否互换（画面镜像/方向不对时置 true） */
    swapLenses?: boolean;
    /** 是否优先请求后端 web 优化版（/media/opt/），大幅减少下载体积 */
    optimized?: boolean;
    /** 优化版目标宽度（像素），后端按 JPEG 子采样取整 */
    optimizedWidth?: number;
  }>(),
  {
    mode: "dual-fisheye",
    lensFov: 200,
    swapLenses: false,
    optimized: true,
    optimizedWidth: 3840,
  },
);

const container = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const ready = ref(false);
const failed = ref("");
const autorotate = ref(false);

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2  u_viewport;
uniform vec3  u_right;
uniform vec3  u_up;
uniform vec3  u_forward;
uniform float u_tanHalfFov;
uniform vec2  u_res;
uniform float u_maxAngle;
uniform float u_overlap;
uniform float u_swap;
uniform int   u_mode;

vec2 fishUV(vec3 dir, float alpha, float sign) {
  float radius = u_res.y * 0.5;
  // 等距鱼眼：半径与夹角成正比；clamp 防止越界采样到圆外黑边
  float r = radius * min(alpha / u_maxAngle, 1.0);
  float s = max(sin(alpha), 1e-4);
  // 镜头画面右方向分量：前镜头(+Z)画面右=世界+x，后镜头(-Z)画面右=世界-x
  float cr = sign * dir.x;
  float cu = dir.y;           // 镜头画面上方向分量
  vec2 off = vec2(cr, -cu) * (r / s);
  float frontU = mix(0.25, 0.75, u_swap);
  float backU  = mix(0.75, 0.25, u_swap);
  float cu_ = sign > 0.0 ? frontU : backU;
  vec2 center = vec2(cu_ * u_res.x, 0.5 * u_res.y);
  return (center + off) / u_res;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / u_viewport - 0.5) * 2.0;
  vec3 dir = normalize(
    u_forward +
    ndc.x * u_tanHalfFov * (u_viewport.x / u_viewport.y) * u_right +
    ndc.y * u_tanHalfFov * u_up
  );

  if (u_mode == 1) {
    float u = atan(dir.x, dir.z) / 6.28318530718 + 0.5;
    float v = 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359;
    gl_FragColor = vec4(texture2D(u_tex, vec2(u, v)).rgb, 1.0);
    return;
  }

  float af = acos(clamp(dir.z, -1.0, 1.0));   // 与前镜头(+Z)夹角
  float ab = acos(clamp(-dir.z, -1.0, 1.0));  // 与后镜头(-Z)夹角
  vec3 colF = texture2D(u_tex, fishUV(dir, af, 1.0)).rgb;
  vec3 colB = texture2D(u_tex, fishUV(dir, ab, -1.0)).rgb;
  float t;
  if (af > u_maxAngle) t = 0.0;
  else if (ab > u_maxAngle) t = 1.0;
  else t = clamp(0.5 + (ab - af) / (2.0 * u_overlap), 0.0, 1.0);
  gl_FragColor = vec4(mix(colB, colF, t), 1.0);
}
`;

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let texture: WebGLTexture | null = null;
let raf = 0;
const uni: Record<string, WebGLUniformLocation | null> = {};

// 相机状态
let yaw = 0;
let pitch = 0;
let fov = 75;
let dragging = false;
let lastX = 0;
let lastY = 0;
let texW = 2;
let texH = 1;

const MAX_TEX = 4096;

function compile(type: number, source: string): WebGLShader {
  const sh = gl!.createShader(type)!;
  gl!.shaderSource(sh, source);
  gl!.compileShader(sh);
  if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
    throw new Error(gl!.getShaderInfoLog(sh) || "shader 编译失败");
  }
  return sh;
}

function setupGL() {
  const cv = canvas.value!;
  gl = (cv.getContext("webgl", { antialias: true }) ||
    cv.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) {
    failed.value = "当前浏览器不支持 WebGL，无法渲染 360 全景";
    return false;
  }
  program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    failed.value = gl.getProgramInfoLog(program) || "shader 链接失败";
    return false;
  }
  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const name of [
    "u_tex",
    "u_viewport",
    "u_right",
    "u_up",
    "u_forward",
    "u_tanHalfFov",
    "u_res",
    "u_maxAngle",
    "u_overlap",
    "u_swap",
    "u_mode",
  ]) {
    uni[name] = gl.getUniformLocation(program, name);
  }
  texture = gl.createTexture();
  return true;
}

/** 把 /media/xxx 改写成后端优化版地址 /media/opt/xxx?w=…；非 media 地址返回 null */
function optimizedUrl(src: string): string | null {
  if (!props.optimized) return null;
  try {
    const u = new URL(src, window.location.href);
    if (!u.pathname.startsWith("/media/")) return null;
    u.pathname = u.pathname.replace(/^\/media\//, "/media/opt/");
    u.searchParams.set("w", String(props.optimizedWidth));
    const cand = u.toString();
    return cand === src ? null : cand;
  } catch {
    return null;
  }
}

function loadTexture(src: string) {
  ready.value = false;
  failed.value = "";
  const opt = optimizedUrl(src);
  const candidates = opt && opt !== src ? [opt, src] : [src];
  attempt(candidates, 0);
}

/** 依次尝试候选地址：优化版失败（如后端未部署该接口）时回退原图 */
function attempt(candidates: string[], index: number) {
  const url = candidates[index];
  if (url === undefined) {
    failed.value = "全景图加载失败，请检查图片地址或跨域配置";
    return;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => uploadTexture(img);
  img.onerror = () => {
    if (index + 1 < candidates.length) attempt(candidates, index + 1);
    else failed.value = "全景图加载失败，请检查图片地址或跨域配置";
  };
  img.src = url;
}

function uploadTexture(img: HTMLImageElement) {
  if (!gl || !texture) return;
  // 超出多数 GPU 纹理上限时先等比降到 <= MAX_TEX 宽（优化版一般已小于该值）
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, MAX_TEX / w);
  w = Math.max(2, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  off.getContext("2d")!.drawImage(img, 0, 0, w, h);
  texW = w;
  texH = h;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  ready.value = true;
}

function resize() {
  const cv = canvas.value;
  if (!cv || !gl) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  gl.viewport(0, 0, cv.width, cv.height);
}

function u(name: string): WebGLUniformLocation | null {
  return uni[name] ?? null;
}

function render() {
  raf = requestAnimationFrame(render);
  if (!gl || !program || !ready.value) return;
  if (autorotate.value && !dragging) yaw += 0.0022;
  resize();
  const cv = canvas.value!;
  const cp = Math.cos(pitch);
  const fx = Math.sin(yaw) * cp;
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * cp;
  // right = normalize(forward x worldUp) = (fz, 0, -fx)
  let rx = fz;
  let rz = -fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up = forward x right（注意叉乘顺序，right x forward 会得到相反的 -up 导致画面上下颠倒）
  const ux = fy * rz;
  const uy = fz * rx - fx * rz;
  const uz = -fy * rx;
  gl.useProgram(program);
  gl.uniform2f(u("u_viewport"), cv.width, cv.height);
  gl.uniform3fv(u("u_right"), [rx, 0, rz]);
  gl.uniform3fv(u("u_up"), [ux, uy, uz]);
  gl.uniform3fv(u("u_forward"), [fx, fy, fz]);
  gl.uniform1f(u("u_tanHalfFov"), Math.tan(((fov / 2) * Math.PI) / 180));
  gl.uniform2f(u("u_res"), texW, texH);
  gl.uniform1f(u("u_maxAngle"), ((props.lensFov / 2) * Math.PI) / 180);
  gl.uniform1f(u("u_overlap"), (12 * Math.PI) / 180);
  gl.uniform1f(u("u_swap"), props.swapLenses ? 1 : 0);
  gl.uniform1i(u("u_mode"), props.mode === "equirect" ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(u("u_tex"), 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function onPointerDown(e: PointerEvent) {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  (e.target as Element).setPointerCapture?.(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  yaw -= dx * 0.0035;
  pitch += dy * 0.0035;
  const lim = Math.PI / 2 - 0.05;
  pitch = Math.max(-lim, Math.min(lim, pitch));
}
function onPointerUp() {
  dragging = false;
}
function onWheel(e: WheelEvent) {
  e.preventDefault();
  fov += e.deltaY * 0.05;
  fov = Math.max(30, Math.min(100, fov));
}
function resetView() {
  yaw = 0;
  pitch = 0;
  fov = 75;
}
function toggleFullscreen() {
  const el = container.value;
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen?.();
}

onMounted(() => {
  if (!setupGL()) return;
  const cv = canvas.value!;
  cv.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  cv.addEventListener("wheel", onWheel, { passive: false });
  loadTexture(props.src);
  raf = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  const cv = canvas.value;
  cv?.removeEventListener("pointerdown", onPointerDown);
  cv?.removeEventListener("wheel", onWheel);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  if (gl && texture) gl.deleteTexture(texture);
  if (gl && program) gl.deleteProgram(program);
});

watch(
  () => props.src,
  (s) => {
    if (s) loadTexture(s);
  },
);
</script>

<template>
  <div ref="container" class="pano">
    <canvas ref="canvas" class="pano-canvas" />
    <div class="pano-hud">
      <button class="pano-btn" title="放大" @click="fov = Math.max(30, fov - 10)">＋</button>
      <button class="pano-btn" title="缩小" @click="fov = Math.min(100, fov + 10)">－</button>
      <button class="pano-btn" title="复位视角" @click="resetView">⟲</button>
      <button
        class="pano-btn"
        :class="{ on: autorotate }"
        title="自动旋转"
        @click="autorotate = !autorotate"
      >
        ▶
      </button>
      <button class="pano-btn" title="全屏" @click="toggleFullscreen">⛶</button>
    </div>
    <p v-if="!ready && !failed" class="pano-tip">全景图加载中…</p>
    <p v-if="failed" class="pano-tip err">{{ failed }}</p>
    <p v-if="ready" class="pano-hint">拖拽旋转 · 滚轮缩放 · 双击复位</p>
  </div>
</template>

<style scoped>
.pano {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  background: #0b0e14;
  border-radius: 12px;
  overflow: hidden;
}
.pano-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  touch-action: none;
}
.pano-canvas:active {
  cursor: grabbing;
}
.pano-hud {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 6px;
}
.pano-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: rgba(20, 24, 32, 0.65);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.pano-btn:hover {
  background: rgba(45, 52, 66, 0.85);
}
.pano-btn.on {
  background: #4776ed;
}
.pano-tip,
.pano-hint {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #dfe6f3;
  background: rgba(15, 18, 24, 0.6);
  pointer-events: none;
}
.pano-tip {
  top: 50%;
  transform: translate(-50%, -50%);
}
.pano-tip.err {
  color: #ffb4b4;
}
.pano-hint {
  top: 10px;
}
</style>

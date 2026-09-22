<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Issue } from "../data/issues";
import type {
  BMapGLIcon,
  BMapGLLabel,
  BMapGLMap,
  BMapGLMarker,
  BMapGLNamespace,
  BMapGLPoint,
} from "../types/bmapgl";
import AppIcon from "./AppIcon.vue";
import { toBd09 } from "../utils/coord";

/**
 * 地图点位面板：优先使用百度地图 JS API（WebGL 版）渲染真实底图。
 * 没有配置密钥、离线或脚本被拦截时，自动回退到内置示意地图，保证 Demo 始终可用。
 * 对外接口保持不变：issues / selected 输入，select 事件输出。
 */
const props = defineProps<{ issues: Issue[]; selected: string | null }>();
const emit = defineEmits<{ select: [issue: Issue] }>();

const colors: Record<string, string> = {
  待分配: "#ed9750",
  待处理: "#8d9bad",
  处理中: "#4f7bf1",
  已完成: "#45a790",
};

/** 南京中心城区（GCJ-02），只作为地图初始视野 */
const INITIAL_CENTER: [number, number] = [118.7835, 32.0575];
const INITIAL_ZOOM = 14;
const FOCUS_ZOOM = 16;

type Mode = "loading" | "ready" | "fallback";

const mode = ref<Mode>("loading");
const failure = ref("");
const hostRef = ref<HTMLDivElement | null>(null);
/** 真实地图上的点位名称标签开关 */
const liveLabels = ref(false);
/** SDK 是否支持 Label，不支持时隐藏对应按钮 */
const labelsSupported = ref(true);
/** 示意地图（回退模式）的缩放与地名开关 */
const listZoom = ref(1);
const listLabels = ref(true);

let api: BMapGLNamespace | null = null;
let map: BMapGLMap | null = null;
let disposed = false;
let fitted = false;
/** 由列表点击触发选中时允许地图跟随平移；地图自身点击则不平移 */
let panOnSelect = true;
const markers = new Map<string, BMapGLMarker>();
let liveLabelOverlays: BMapGLLabel[] = [];

const labelsOn = computed(() =>
  mode.value === "ready" ? liveLabels.value : listLabels.value,
);
const canZoomIn = computed(() => mode.value === "ready" || listZoom.value < 1.6);
const canZoomOut = computed(() => mode.value === "ready" || listZoom.value > 0.8);

/* ---------- 回退模式：内置示意图点位投影 ---------- */
const positions = computed(() =>
  props.issues.map((issue) => ({
    issue,
    x: 65 + ((issue.longitude - 118.745) / 0.07) * 770,
    y: 610 - ((issue.latitude - 32.035) / 0.052) * 560,
  })),
);
const blocks = Array.from({ length: 63 }, (_, i) => ({
  x: 30 + (i % 9) * 99,
  y: 32 + Math.floor(i / 9) * 97,
  w: 65 + (i % 3) * 6,
  h: 62 + (i % 2) * 9,
}));

/* ---------- 标点图标：按状态着色，悬停/选中放大并加光晕 ---------- */
function pinSvg(color: string, done: boolean, active: boolean): string {
  const halo = active
    ? `<circle cx="17" cy="17" r="15" fill="${color}" opacity=".22"/>`
    : "";
  const glyph = done
    ? '<path d="M12.6 17.4l3.1 3.1 5.9-6.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="17" cy="17" r="5.4" fill="#fff" opacity=".95"/>';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46">' +
    halo +
    `<path d="M17 1.6C8.5 1.6 1.6 8.5 1.6 17c0 10.7 15.4 27.4 15.4 27.4S32.4 27.7 32.4 17C32.4 8.5 25.5 1.6 17 1.6Z" fill="${color}" stroke="#fff" stroke-width="3.2"/>` +
    glyph +
    "</svg>"
  );
}

function pinIcon(issue: Issue, active: boolean): BMapGLIcon {
  const color = colors[issue.progress] ?? "#8d9bad";
  const width = active ? 42 : 32;
  const height = Math.round((width * 46) / 34);
  const svg = pinSvg(color, issue.progress === "已完成", active);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const size = new api!.Size(width, height);
  return new api!.Icon(url, size, {
    anchor: new api!.Size(width / 2, height),
    imageSize: new api!.Size(width, height),
  });
}

function bdPoint(issue: Issue): BMapGLPoint | null {
  if (!api) return null;
  const [lng, lat] = toBd09(issue.longitude, issue.latitude);
  return new api.Point(lng, lat);
}

/* ---------- 地图渲染 ---------- */
function clearLiveLabels() {
  if (map) for (const label of liveLabelOverlays) map.removeOverlay(label);
  liveLabelOverlays = [];
}

function drawLiveLabels() {
  const sdk = api;
  const instance = map;
  if (!instance || !sdk) return;
  if (typeof sdk.Label !== "function") {
    labelsSupported.value = false;
    return;
  }
  clearLiveLabels();
  for (const issue of props.issues) {
    const point = bdPoint(issue);
    if (!point) continue;
    try {
      const label = new sdk.Label(issue.title, {
        position: point,
        offset: new sdk.Size(14, -34),
      });
      label.setStyle?.({
        color: "#3c4b5c",
        fontSize: "11px",
        lineHeight: "16px",
        padding: "2px 6px",
        backgroundColor: "#ffffffee",
        border: "1px solid #e2e8f0",
        borderRadius: "4px",
        whiteSpace: "nowrap",
      });
      instance.addOverlay(label);
      liveLabelOverlays.push(label);
    } catch {
      // 单条标签失败不影响整体地图
    }
  }
}

function renderMarkers() {
  if (!map || !api) return;
  for (const marker of markers.values()) map.removeOverlay(marker);
  markers.clear();
  clearLiveLabels();

  const points: BMapGLPoint[] = [];
  for (const issue of props.issues) {
    const point = bdPoint(issue);
    if (!point) continue;
    points.push(point);
    const marker = new api.Marker(point, {
      icon: pinIcon(issue, props.selected === issue.id),
      enableMassClear: false,
    });
    marker.addEventListener("click", () => {
      panOnSelect = false;
      emit("select", issue);
    });
    marker.addEventListener("mouseover", () => {
      if (props.selected !== issue.id) marker.setIcon(pinIcon(issue, true));
    });
    marker.addEventListener("mouseout", () => {
      if (props.selected !== issue.id) marker.setIcon(pinIcon(issue, false));
    });
    map.addOverlay(marker);
    markers.set(issue.id, marker);
  }

  if (liveLabels.value) drawLiveLabels();
  if (!fitted && points.length) {
    fitted = true;
    fitView();
  }
}

function fitView() {
  if (!map || !api) return;
  const points: BMapGLPoint[] = [];
  for (const issue of props.issues) {
    const point = bdPoint(issue);
    if (point) points.push(point);
  }
  if (!points.length) return;
  const only = points.length === 1 ? points[0] : undefined;
  if (only) {
    map.centerAndZoom(only, FOCUS_ZOOM);
    return;
  }
  try {
    map.setViewport(points, { margins: [70, 70, 70, 70] });
  } catch {
    const first = points[0];
    if (first) map.centerAndZoom(first, INITIAL_ZOOM);
  }
}

function syncSelection() {
  if (!map || !api) return;
  for (const issue of props.issues) {
    const marker = markers.get(issue.id);
    if (marker) marker.setIcon(pinIcon(issue, props.selected === issue.id));
  }
  const shouldPan = panOnSelect;
  panOnSelect = true;
  if (!shouldPan || !props.selected) return;
  const target = props.issues.find((issue) => issue.id === props.selected);
  const point = target ? bdPoint(target) : null;
  if (point) map.panTo(point);
}

function setFallback(message: string) {
  failure.value = message;
  mode.value = "fallback";
}

function waitForSdk(timeout = 6000): Promise<BMapGLNamespace | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (disposed) return resolve(null);
      if (window.BMapGL) return resolve(window.BMapGL);
      if (Date.now() - started > timeout) return resolve(null);
      window.setTimeout(poll, 120);
    };
    poll();
  });
}

onMounted(async () => {
  // 没配置密钥就不必等待脚本，直接使用内置示意地图
  if (!import.meta.env.VITE_BAIDU_MAP_AK) {
    setFallback("尚未配置百度地图密钥，当前展示内置示意地图。");
    return;
  }
  const sdk = await waitForSdk();
  if (disposed) return;
  if (!sdk) {
    setFallback(
      "实时地图加载失败（网络或密钥域名白名单限制），已切回内置示意地图。",
    );
    return;
  }
  const container = hostRef.value;
  if (!container) {
    setFallback("地图容器未就绪，已切回内置示意地图。");
    return;
  }
  api = sdk;
  try {
    const instance = new sdk.Map(container);
    const [lng, lat] = toBd09(INITIAL_CENTER[0], INITIAL_CENTER[1]);
    instance.centerAndZoom(new sdk.Point(lng, lat), INITIAL_ZOOM);
    instance.enableScrollWheelZoom(true);
    map = instance;
    mode.value = "ready";
    renderMarkers();
  } catch (error) {
    api = null;
    map = null;
    console.warn("[IssueMap] 百度地图初始化失败", error);
    setFallback("百度地图初始化失败，已切回内置示意地图。");
  }
});

onBeforeUnmount(() => {
  disposed = true;
  markers.clear();
  liveLabelOverlays = [];
  if (map) {
    try {
      map.clearOverlays();
      map.destroy?.();
    } catch {
      // 忽略销毁阶段的异常
    }
  }
  map = null;
  api = null;
});

watch(
  () => props.issues,
  () => {
    if (mode.value === "ready") renderMarkers();
  },
);
watch(
  () => props.selected,
  () => {
    if (mode.value === "ready") syncSelection();
  },
);

/* ---------- 工具条：真实地图与示意地图共用 ---------- */
function zoomIn() {
  if (mode.value === "ready" && map) map.zoomIn();
  else listZoom.value = Math.min(1.6, listZoom.value + 0.2);
}
function zoomOut() {
  if (mode.value === "ready" && map) map.zoomOut();
  else listZoom.value = Math.max(0.8, listZoom.value - 0.2);
}
function resetView() {
  if (mode.value === "ready") fitView();
  else listZoom.value = 1;
}
function toggleLabels() {
  if (mode.value === "ready") {
    liveLabels.value = !liveLabels.value;
    if (liveLabels.value) drawLiveLabels();
    else clearLiveLabels();
  } else {
    listLabels.value = !listLabels.value;
  }
}
</script>

<template>
  <div class="map-canvas" :class="{ 'is-live': mode === 'ready' }">
    <div v-if="mode !== 'fallback'" ref="hostRef" class="baidu-map"></div>
    <svg
      v-if="mode === 'fallback'"
      class="city-map"
      viewBox="0 0 930 690"
      role="group"
      aria-label="南京城区示意地图，问题点可点击"
    >
      <rect width="930" height="690" fill="#edf0ec" />
      <g
        :transform="`translate(${465 * (1 - listZoom)} ${345 * (1 - listZoom)}) scale(${listZoom})`"
      >
        <g fill="#e1e6df" stroke="#d9dfd7">
          <rect
            v-for="(b, i) in blocks"
            :key="i"
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            rx="8"
          />
        </g>
        <path
          d="M650-30C680 100 670 190 790 235S960 270 980 270V-30Z"
          fill="#c8e3e8"
        />
        <path
          d="M617-30C650 90 650 218 775 265S953 304 980 295"
          fill="none"
          stroke="#d6e6cd"
          stroke-width="34"
        />
        <path
          d="M-20 170Q100 90 220 153T430 142"
          fill="none"
          stroke="#cee3e5"
          stroke-width="20"
        />
        <g fill="#d3e3cd">
          <path d="M529 224h95l43 65-25 75H530Z" />
          <rect x="128" y="43" width="143" height="81" rx="30" />
          <path d="M731 434h140v126H762Z" />
        </g>
        <g fill="none" stroke="#fff" stroke-width="12">
          <path
            d="M0 248h930 M0 431h930 M0 620h930 M315 0v690 M513 0v690 M709 270v420 M118 160v530"
          />
          <path
            d="M0 338h930 M0 530h930 M415 0v690 M612 300v390 M812 300v390"
            stroke-width="7"
          />
        </g>
        <g fill="none" stroke="#e8d6ac" stroke-width="22">
          <path
            d="M-20 583 450 360 650 325 950 334 M410-20 437 176 461 377 488 720"
          />
        </g>
        <g fill="none" stroke="#fff4d6" stroke-width="15">
          <path
            d="M-20 583 450 360 650 325 950 334 M410-20 437 176 461 377 488 720"
          />
        </g>
        <g
          v-if="listLabels"
          font-family="system-ui, sans-serif"
          fill="#929d97"
          font-size="13"
          text-anchor="middle"
        >
          <text x="200" y="85" fill="#90a486">古林公园</text>
          <text
            x="768"
            y="105"
            fill="#86adb5"
            font-size="24"
            letter-spacing="8"
          >
            玄武湖
          </text>
          <text x="580" y="287" fill="#91a088">北极阁公园</text>
          <text x="810" y="499" fill="#91a088">明故宫绿地</text>
          <text
            x="208"
            y="285"
            font-size="23"
            fill="#b0b8b0"
            letter-spacing="8"
          >
            鼓楼区
          </text>
          <text
            x="739"
            y="401"
            font-size="23"
            fill="#b0b8b0"
            letter-spacing="8"
          >
            玄武区
          </text>
          <text x="190" y="242">北京西路</text>
          <text x="622" y="242">北京东路</text>
          <text x="325" y="425">广州路</text>
          <text x="652" y="424">珠江路</text>
          <text x="640" y="524">长江路</text>
          <text x="238" y="614">汉中路</text>
          <text x="348" y="124">南京大学</text>
          <text x="345" y="474">五台山</text>
          <text x="550" y="592">新街口</text>
          <text x="488" y="173" transform="rotate(82 488 173)">中央路</text>
        </g>
        <g
          v-for="p in positions"
          :key="p.issue.id"
          class="map-pin"
          role="button"
          tabindex="0"
          :aria-label="`${p.issue.title}，${p.issue.progress}`"
          :transform="`translate(${p.x} ${p.y})`"
          @click="emit('select', p.issue)"
          @keydown.enter="emit('select', p.issue)"
          @keydown.space.prevent="emit('select', p.issue)"
        >
          <circle
            v-if="selected === p.issue.id"
            r="30"
            :fill="colors[p.issue.progress]"
            opacity=".16"
          />
          <circle r="18" fill="white" class="pin-shadow" />
          <circle r="13" :fill="colors[p.issue.progress]" />
          <path
            v-if="p.issue.progress === '已完成'"
            d="m-5 0 3 3 7-7"
            fill="none"
            stroke="white"
            stroke-width="2"
          />
          <g v-else fill="white">
            <rect x="-1" y="-6" width="2" height="7" rx="1" />
            <circle cy="5" r="1.3" />
          </g>
        </g>
      </g>
    </svg>

    <p v-if="mode === 'loading'" class="map-loading">
      <span><i class="map-spinner"></i>正在加载实时地图…</span>
    </p>
    <p v-else-if="mode === 'fallback'" class="map-fallback-note">
      {{ failure }}
    </p>

    <div class="map-location">
      <span class="live-dot"></span> 南京市 · 中心城区
      <span class="muted"
        >/ {{ mode === "ready" ? "实时底图" : "示意地图" }}</span
      >
    </div>
    <div v-if="mode !== 'ready'" class="map-north">
      <span>N</span><span>↑</span>
    </div>
    <div class="map-tools">
      <button aria-label="放大地图" :disabled="!canZoomIn" @click="zoomIn">
        ＋</button
      ><button aria-label="缩小地图" :disabled="!canZoomOut" @click="zoomOut">
        −</button
      ><button aria-label="重置地图视野" @click="resetView">
        <AppIcon name="target" /></button
      ><button
        v-if="labelsSupported"
        aria-label="切换点位名称"
        :aria-pressed="labelsOn"
        @click="toggleLabels"
      >
        <AppIcon name="layers" />
      </button>
    </div>
    <div class="map-legend">
      <span v-for="(color, label) in colors" :key="label"
        ><i :style="{ background: color }"></i>{{ label }}</span
      >
    </div>
    <div v-if="mode === 'fallback'" class="map-disclaimer">
      演示底图 · 非真实地理边界
    </div>
  </div>
</template>

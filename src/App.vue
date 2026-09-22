<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AppIcon from "./components/AppIcon.vue";
import IssueMap from "./components/IssueMap.vue";
import PanoramaViewer from "./components/PanoramaViewer.vue";
import StatsCards from "./components/StatsCards.vue";
import { getIssue, listIssues, updateIssue } from "./api/issues";
import { apiBaseUrl, apiEnvironmentLabel } from "./config/api";
import {
  people,
  statuses,
  types,
  type Issue,
  type Status,
} from "./data/issues";
const notice = ref("");
const issues = ref<Issue[]>([]);
const loading = ref(true);
const saving = ref(false);
const loadError = ref("");
const query = ref("");
const typeFilter = ref("全部类型");
const statusFilter = ref("全部问题");
const activeView = ref("overview");
const selectedId = ref<string | null>(null);
const selected = computed(() =>
  issues.value.find((i) => i.id === selectedId.value),
);
const draftPerson = ref("");
const draftStatus = ref<Status>("待分配");
const dialog = ref<HTMLDialogElement>();
const photoDialog = ref<HTMLDialogElement>();
const panoEnabled = ref(true);
const detailError = ref("");
const filtered = computed(() =>
  issues.value.filter(
    (i) =>
      (statusFilter.value === "全部问题" ||
        i.progress === statusFilter.value) &&
      (typeFilter.value === "全部类型" || i.type === typeFilter.value) &&
      `${i.title} ${i.id} ${i.address} ${i.submitter} ${i.assignee}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
);
const counts = computed(() =>
  Object.fromEntries(
    statuses.map((s) => [
      s,
      issues.value.filter((i) => i.progress === s).length,
    ]),
  ),
);
const completion = computed(() =>
  issues.value.length
    ? Math.round(((counts.value["已完成"] || 0) / issues.value.length) * 100)
    : 0,
);
function tell(message: string) {
  notice.value = message;
}
watch(notice, (value) => {
  if (value) {
    const current = value;
    setTimeout(() => {
      if (notice.value === current) notice.value = "";
    }, 4500);
  }
});
function replaceIssue(issue: Issue) {
  const index = issues.value.findIndex((item) => item.id === issue.id);
  if (index >= 0) issues.value[index] = issue;
}
async function refreshIssues(showNotice = true) {
  loading.value = true;
  loadError.value = "";
  try {
    issues.value = await listIssues();
    if (selectedId.value && !issues.value.some((issue) => issue.id === selectedId.value)) {
      selectedId.value = null;
      dialog.value?.close();
    }
    if (showNotice) tell(`已从后端刷新 ${issues.value.length} 条问题。`);
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "加载问题列表失败";
    tell(loadError.value);
  } finally {
    loading.value = false;
  }
}
async function openIssue(issue: Issue) {
  selectedId.value = issue.id;
  draftPerson.value = issue.assignee;
  draftStatus.value = issue.progress;
  detailError.value = "";
  await nextTick();
  dialog.value?.showModal();
  try {
    const latest = await getIssue(issue.id);
    if (selectedId.value !== issue.id) return;
    replaceIssue(latest);
    draftPerson.value = latest.assignee;
    draftStatus.value = latest.progress;
  } catch (error) {
    tell(error instanceof Error ? error.message : "刷新问题详情失败");
  }
}
async function openPhoto() {
  const url = selected.value?.images[0];
  // 用优化版小图做比例探测，避免为判断格式整张下载 8K 原图
  panoEnabled.value = url ? await detectPano(optimizedMediaUrl(url, 2048)) : false;
  photoDialog.value?.showModal();
}
/** 把 /media/xxx 改写成后端 web 优化版 /media/opt/xxx?w=…，非 media 地址原样返回 */
function optimizedMediaUrl(value: string, width: number): string {
  try {
    const u = new URL(value, window.location.href);
    if (!u.pathname.startsWith("/media/") || u.pathname.startsWith("/media/opt/")) return value;
    u.pathname = u.pathname.replace(/^\/media\//, "/media/opt/");
    u.searchParams.set("w", String(width));
    return u.toString();
  } catch {
    return value;
  }
}
/** 优化版不可用（如后端未部署该接口）时回退原图，保证缩略图不坏 */
function fallbackToOriginal(event: Event) {
  const img = event.target as HTMLImageElement | null;
  const original = selected.value?.images[0];
  if (img && original && img.src !== new URL(original, window.location.href).toString()) {
    img.src = new URL(original, window.location.href).toString();
  }
}
function detectPano(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
      // 影石双鱼眼/等距柱状全景均为约 2:1 且分辨率较高
      resolve(img.naturalWidth >= 1500 && ratio > 1.8 && ratio < 2.2);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
async function saveIssue() {
  if (!selected.value) return;
  if (draftStatus.value !== "待分配" && !draftPerson.value) {
    detailError.value = "请先选择责任人，再设置处理进度。";
    return;
  }
  if (draftStatus.value === "待分配" && draftPerson.value) {
    detailError.value = "已选择责任人，请将进度设为待处理、处理中或已完成。";
    return;
  }
  saving.value = true;
  try {
    const updated = await updateIssue(selected.value.id, {
      assignee: draftPerson.value,
      progress: draftStatus.value,
      version: selected.value.version,
    });
    replaceIssue(updated);
    tell("更新成功，责任人与进度已同步到后端。");
    dialog.value?.close();
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : "保存处置安排失败";
  } finally {
    saving.value = false;
  }
}
function selectPerson() {
  if (draftPerson.value && draftStatus.value === "待分配")
    draftStatus.value = "待处理";
  if (!draftPerson.value) draftStatus.value = "待分配";
}
function setView(view: string) {
  activeView.value = view;
  statusFilter.value = view === "assign" ? "待分配" : "全部问题";
  query.value = "";
  typeFilter.value = "全部类型";
}
function exportIssues() {
  const lines = [
    [
      "问题编号",
      "问题标题",
      "提交人",
      "提交时间",
      "经度",
      "纬度",
      "图片",
      "问题类型",
      "详细描述",
      "责任人",
      "进度",
    ],
    ...filtered.value.map((i) => [
      i.id,
      i.title,
      i.submitter,
      i.submittedAt,
      i.longitude,
      i.latitude,
      i.images.join(";"),
      i.type,
      i.description,
      i.assignee,
      i.progress,
    ]),
  ];
  const csv =
    "\uFEFF" +
    lines
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              String(value)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "城市问题清单.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  tell(`已导出 ${filtered.value.length} 条问题。`);
}
const statusClass = (status: string) =>
  ({ 待分配: "orange", 待处理: "gray", 处理中: "blue", 已完成: "green" })[
    status
  ];
onMounted(() => refreshIssues(false));
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="setView('overview')"
        ><span class="brand-icon"><AppIcon name="building" :size="27" /></span
        ><span>城事通<small>城市治理协同平台</small></span></a
      >
      <p class="nav-label">工作空间</p>
      <nav aria-label="主导航">
        <button
          aria-label="综合概览"
          :class="{ active: activeView === 'overview' }"
          @click="setView('overview')"
        >
          <AppIcon name="grid" />综合概览</button
        ><button
          aria-label="问题管理"
          :class="{ active: activeView === 'list' }"
          @click="setView('list')"
        >
          <AppIcon name="list" />问题管理<span class="nav-count">{{
            issues.length
          }}</span></button
        ><button
          aria-label="责任分配"
          :class="{ active: activeView === 'assign' }"
          @click="setView('assign')"
        >
          <AppIcon name="user" />责任分配<span class="nav-dot"></span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="account">
          <span class="avatar">管</span>
          <div><strong>城市管理中心</strong><small>政府管理员</small></div>
        </div>
      </div>
    </aside>
    <div class="main-shell">
      <header class="topbar">
        <div>
          工作空间 <span>/</span>
          <strong>{{
            activeView === "overview"
              ? "综合概览"
              : activeView === "list"
                ? "问题管理"
                : "责任分配"
          }}</strong>
        </div>
        <div class="topbar-right">
          <AppIcon name="building" :size="16" /><span
            >南京市 · 城市管理中心</span
          >
        </div>
      </header>
      <main>
        <section class="page-heading">
          <div>
            <div class="eyebrow">CITY GOVERNANCE WORKSPACE</div>
            <h1>
              {{
                activeView === "overview"
                  ? "城市问题，一图掌握"
                  : activeView === "list"
                    ? "问题管理"
                    : "责任分配"
              }}<span class="heading-tag">协同处置</span>
            </h1>
            <p>
              {{
                activeView === "assign"
                  ? "及时分派每一条上报，让责任落实到人。"
                  : "汇聚城市上报，连接处置责任，让每一件小事都有着落。"
              }}
            </p>
          </div>
          <div class="heading-actions">
            <button class="button secondary" :disabled="loading" @click="refreshIssues()">
              <AppIcon name="clock" :size="17" />{{ loading ? "刷新中" : "刷新数据" }}
            </button>
            <button class="button secondary" :disabled="!issues.length" @click="exportIssues">
              <AppIcon name="download" :size="17" />导出问题清单
            </button>
          </div>
        </section>
        <StatsCards
          v-model="statusFilter"
          :total="issues.length"
          :counts="counts"
          :completion="completion"
        />
        <section class="workbench">
          <div class="workbench-toolbar">
            <div class="section-title">
              <span class="title-line"></span>
              <h2>问题协同中心</h2>
              <span class="subtle-badge">{{ filtered.length }} 个问题</span>
            </div>
            <span class="sync-label" :title="apiBaseUrl"
              ><span class="live-dot"></span>
              {{ loading ? "正在同步" : loadError ? "连接异常" : "后端实时数据" }}</span
            >
          </div>
          <div class="filters">
            <label class="search-field"
              ><AppIcon name="search" :size="18" /><input
                v-model="query"
                placeholder="搜索问题、地点、编号或责任人"
                aria-label="搜索问题" /><button
                v-if="query"
                aria-label="清空搜索"
                @click="query = ''"
              >
                <AppIcon name="close" :size="14" /></button></label
            ><select v-model="typeFilter" aria-label="问题类型">
              <option>全部类型</option>
              <option v-for="t in types" :key="t">{{ t }}</option></select
            ><select v-model="statusFilter" aria-label="问题进度">
              <option>全部问题</option>
              <option v-for="s in statuses" :key="s">{{ s }}</option></select
            ><button
              class="reset-filter"
              @click="
                query = '';
                typeFilter = '全部类型';
                statusFilter = '全部问题';
              "
            >
              重置筛选
            </button>
          </div>
          <div
            class="workspace-content"
            :class="{ 'list-view': activeView === 'list' }"
          >
            <div v-if="activeView !== 'list'" class="map-panel">
              <IssueMap
                :issues="filtered"
                :selected="selectedId"
                @select="openIssue"
              />
              <div class="map-footer">
                <AppIcon name="pin" :size="15" /><span
                  >点击地图点位，查看问题详情与处置进度</span
                >
              </div>
            </div>
            <section class="issue-list-panel">
              <div class="list-heading">
                <h3>
                  问题列表 <span>{{ filtered.length }}</span>
                </h3>
                <span>提交时间 ↓</span>
              </div>
              <div class="issue-list">
                <button
                  v-for="issue in filtered"
                  :key="issue.id"
                  class="issue-card"
                  :class="{ selected: selectedId === issue.id }"
                  @click="openIssue(issue)"
                >
                  <div class="issue-card-top">
                    <span class="issue-type">{{ issue.type }}</span
                    ><span class="status" :class="statusClass(issue.progress)"
                      ><i></i>{{ issue.progress }}</span
                    >
                  </div>
                  <h3>{{ issue.title }}</h3>
                  <p class="issue-address">
                    <AppIcon name="pin" :size="13" />{{ issue.address }}
                  </p>
                  <div class="issue-card-bottom">
                    <span>{{ issue.submittedAt.slice(5) }}</span
                    ><span v-if="issue.assignee" class="assignee-name"
                      ><span class="tiny-avatar">{{ issue.assignee[0] }}</span
                      >{{ issue.assignee.split(" · ")[0] }}</span
                    ><span v-else class="assign-link"
                      >分配责任人 <AppIcon name="arrow" :size="13"
                    /></span>
                  </div>
                </button>
                <div v-if="loading" class="empty-state">
                  <AppIcon name="clock" :size="36" />
                  <h3>正在加载问题数据</h3>
                  <p>正在连接 {{ apiBaseUrl }}</p>
                </div>
                <div v-else-if="loadError && !issues.length" class="empty-state">
                  <AppIcon name="close" :size="36" />
                  <h3>暂时无法连接后端</h3>
                  <p>{{ loadError }}</p>
                  <button class="button secondary" @click="refreshIssues()">重新连接</button>
                </div>
                <div v-else-if="!filtered.length" class="empty-state">
                  <AppIcon name="search" :size="36" />
                  <h3>没有符合条件的问题</h3>
                  <p>试试其他关键词，或重置筛选条件。</p>
                  <button
                    class="button secondary"
                    @click="
                      query = '';
                      typeFilter = '全部类型';
                      statusFilter = '全部问题';
                    "
                  >
                    显示全部问题
                  </button>
                </div>
              </div>
              <div class="list-footer">点击卡片查看详情与处置进度</div>
            </section>
          </div>
        </section>
        <footer class="page-footer">
          <span>城事通 · 城市治理协同平台</span
          ><span>已连接 {{ apiEnvironmentLabel }} · {{ apiBaseUrl }}</span>
        </footer>
      </main>
    </div>
    <dialog
      ref="dialog"
      class="detail-dialog"
      aria-label="问题详情"
      @click="
        (e) => {
          if (e.target === dialog) dialog?.close();
        }
      "
    >
      <template v-if="selected"
        ><div class="detail-header">
          <div>
            <span class="eyebrow">ISSUE DETAILS</span>
            <h2>问题详情</h2>
          </div>
          <button
            class="icon-button"
            aria-label="关闭详情"
            @click="dialog?.close()"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <div class="detail-body">
          <div class="detail-id">
            {{ selected.id
            }}<span class="status" :class="statusClass(selected.progress)">{{
              selected.progress
            }}</span>
          </div>
          <h2 class="detail-title">{{ selected.title }}</h2>
          <p class="issue-address">
            <AppIcon name="pin" :size="15" />{{ selected.address }}
          </p>
          <dl class="detail-grid">
            <div>
              <dt>问题类型</dt>
              <dd>{{ selected.type }}</dd>
            </div>
            <div>
              <dt>提交人</dt>
              <dd>{{ selected.submitter }}</dd>
            </div>
            <div>
              <dt>提交时间</dt>
              <dd>{{ selected.submittedAt }}</dd>
            </div>
            <div>
              <dt>经度 / 纬度</dt>
              <dd>
                {{ selected.longitude.toFixed(6) }} /
                {{ selected.latitude.toFixed(6) }}
              </dd>
            </div>
          </dl>
          <h3 class="detail-section-title">问题描述</h3>
          <p class="description">{{ selected.description }}</p>
          <h3 class="detail-section-title">
            现场图片 <span>{{ selected.images.length }} 张</span>
          </h3>
          <button
            v-if="selected.images.length"
            class="photo-button"
            aria-label="查看现场 360 全景"
            @click="openPhoto"
          >
            <img
              :src="optimizedMediaUrl(selected.images[0]!, 1024)"
              @error="fallbackToOriginal"
              alt="问题现场照片"
            /><span>360° 全景 ↗</span>
          </button>
          <p v-else class="muted">暂无现场图片</p>
          <div class="dispatch-box">
            <h3><AppIcon name="user" :size="18" />处置安排</h3>
            <label
              >责任人<select v-model="draftPerson" @change="selectPerson">
                <option value="">请选择责任人</option>
                <option v-for="person in people" :key="person">
                  {{ person }}
                </option>
              </select></label
            ><label
              >处理进度<select v-model="draftStatus">
                <option v-for="s in statuses" :key="s">{{ s }}</option>
              </select></label
            >
            <p v-if="detailError" class="form-error" role="alert">
              {{ detailError }}
            </p>
            <p v-else class="dispatch-note">
              分配后可持续更新进度，形成处置闭环。
            </p>
          </div>
        </div>
        <div class="detail-actions">
          <button class="button secondary" @click="dialog?.close()">取消</button
          ><button class="button primary" :disabled="saving" @click="saveIssue">
            <AppIcon name="check" :size="17" />{{ saving ? "保存中" : "保存处置安排" }}
          </button>
        </div></template
      >
    </dialog>
    <dialog ref="photoDialog" class="photo-dialog" aria-label="现场图片预览">
      <button
        class="icon-button"
        aria-label="关闭图片"
        @click="photoDialog?.close()"
      >
        <AppIcon name="close" /></button
      >
      <div class="photo-stage">
        <PanoramaViewer
          v-if="panoEnabled && selected?.images[0]"
          :src="selected.images[0]"
        />
        <img
          v-else-if="selected?.images[0]"
          :src="selected.images[0]"
          alt="问题现场照片"
        />
      </div>
      <div class="photo-bar">
        <p>问题现场图片</p>
        <button class="button secondary" @click="panoEnabled = !panoEnabled">
          {{ panoEnabled ? "切换平面原图" : "切换 360° 全景" }}
        </button>
      </div>
    </dialog>
    <div v-if="notice" class="toast" role="status">
      <AppIcon name="check" :size="18" />{{ notice }}
    </div>
  </div>
</template>

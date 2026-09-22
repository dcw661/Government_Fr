<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

/**
 * 问题统计卡片（纯展示组件）。
 * 四张卡片同时充当快捷筛选入口：点击后通过 v-model 把选中的进度回写给父级。
 */
defineProps<{
  total: number;
  counts: Record<string, number>;
  completion: number;
  modelValue: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <section class="stats" aria-label="问题统计">
    <button
      class="stat-card"
      :class="{ chosen: modelValue === '全部问题' }"
      @click="emit('update:modelValue', '全部问题')"
    >
      <div>
        <span>上报问题总数</span
        ><strong>{{ total }}<small>件</small></strong>
        <p><span class="mini-dot blue-bg"></span> 全部已收录问题</p>
      </div>
      <span class="stat-icon blue"><AppIcon name="layers" :size="23" /></span>
    </button>
    <button
      class="stat-card"
      :class="{ chosen: modelValue === '待分配' }"
      @click="emit('update:modelValue', '待分配')"
    >
      <div>
        <span>待分配</span
        ><strong>{{ counts["待分配"] }}<small>件</small></strong>
        <p class="orange-text">需要安排责任人 ↗</p>
      </div>
      <span class="stat-icon orange"><AppIcon name="user" :size="23" /></span>
    </button>
    <button
      class="stat-card"
      :class="{ chosen: modelValue === '处理中' }"
      @click="emit('update:modelValue', '处理中')"
    >
      <div>
        <span>处理中</span
        ><strong>{{ counts["处理中"] }}<small>件</small></strong>
        <p><span class="mini-dot blue-bg"></span> 正在有序推进</p>
      </div>
      <span class="stat-icon blue"><AppIcon name="clock" :size="23" /></span>
    </button>
    <button
      class="stat-card"
      :class="{ chosen: modelValue === '已完成' }"
      @click="emit('update:modelValue', '已完成')"
    >
      <div>
        <span>已完成</span
        ><strong>{{ counts["已完成"] }}<small>件</small></strong>
        <p class="green-text">问题办结率 {{ completion }}%</p>
      </div>
      <span class="stat-icon green"><AppIcon name="check" :size="23" /></span>
    </button>
  </section>
</template>

<!--
  NumberPad.vue — Reusable numpad for qty, rate, discount
-->
<template>
  <div class="numpad">
    <div class="numpad__display">
      <span class="numpad__label">{{ label }}</span>
      <span class="numpad__value">{{ displayValue }}</span>
    </div>

    <div class="numpad__mode-tabs">
      <button
        v-for="mode in modes"
        :key="mode.key"
        class="numpad__mode-btn"
        :class="{ active: activeMode === mode.key }"
        @click="setMode(mode.key)"
      >{{ mode.label }}</button>
    </div>

    <div class="numpad__grid">
      <button
        v-for="key in keys"
        :key="key"
        class="numpad__key"
        :class="{ 'numpad__key--wide': key === 'backspace' }"
        @click="handleKey(key)"
      >
        <template v-if="key === 'backspace'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
            <line x1="18" y1="9" x2="12" y2="15"/>
            <line x1="12" y1="9" x2="18" y2="15"/>
          </svg>
        </template>
        <template v-else>{{ key }}</template>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = withDefaults(defineProps<{
  modes?: Array<{ key: string; label: string }>;
  initialMode?: string;
}>(), {
  modes: () => [
    { key: 'qty', label: 'Qty' },
    { key: 'discount', label: 'Disc %' },
    { key: 'rate', label: 'Rate' },
  ],
  initialMode: 'qty',
});

const emit = defineEmits<{
  (e: 'update', mode: string, value: string): void;
}>();

const keys = ['1','2','3','4','5','6','7','8','9','.','0','backspace'];
const activeMode = ref(props.initialMode);
const inputBuffer = ref('0');

const label = computed(() => {
  return props.modes.find(m => m.key === activeMode.value)?.label || '';
});

const displayValue = computed(() => inputBuffer.value);

function setMode(mode: string) {
  activeMode.value = mode;
  inputBuffer.value = '0';
}

function handleKey(key: string) {
  if (key === 'backspace') {
    if (inputBuffer.value.length <= 1) {
      inputBuffer.value = '0';
    } else {
      inputBuffer.value = inputBuffer.value.slice(0, -1);
    }
  } else if (key === '.') {
    if (!inputBuffer.value.includes('.')) {
      inputBuffer.value += '.';
    }
    return;
  } else {
    if (inputBuffer.value === '0') {
      inputBuffer.value = key;
    } else {
      inputBuffer.value += key;
    }
  }
  emit('update', activeMode.value, inputBuffer.value);
}

// Reset when mode changes externally
watch(() => props.initialMode, (m) => {
  activeMode.value = m;
  inputBuffer.value = '0';
});
</script>

<style scoped>
.numpad {
  background: var(--pos-surface);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--pos-border);
}
.numpad__display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--pos-bg);
  border-radius: 8px;
  padding: 8px 14px;
  border: 1px solid var(--pos-border);
}
.numpad__label {
  font-size: 12px;
  color: var(--pos-text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.numpad__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--pos-accent);
  font-variant-numeric: tabular-nums;
}
.numpad__mode-tabs {
  display: flex;
  gap: 6px;
}
.numpad__mode-btn {
  flex: 1;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid var(--pos-border);
  background: transparent;
  color: var(--pos-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.numpad__mode-btn.active {
  background: var(--pos-accent);
  color: #fff;
  border-color: var(--pos-accent);
}
.numpad__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.numpad__key {
  background: var(--pos-bg);
  border: 1px solid var(--pos-border);
  border-radius: 8px;
  padding: 14px;
  font-size: 18px;
  font-weight: 600;
  color: var(--pos-text);
  cursor: pointer;
  transition: all 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
}
.numpad__key:hover {
  background: var(--pos-surface-hover);
  border-color: var(--pos-accent);
  color: var(--pos-accent);
}
.numpad__key:active {
  transform: scale(0.96);
}
.numpad__key--wide {
  background: var(--pos-surface-hover);
}
</style>

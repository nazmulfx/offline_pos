// useTheme.ts — Robust dark/light theme toggle
import { ref } from 'vue';

const STORAGE_KEY = 'pos-theme';
export const isDark = ref(false);

function apply() {
  if (isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
  }
}

export function toggleTheme() {
  isDark.value = !isDark.value;
  localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light');
  apply();
}

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    isDark.value = saved === 'dark';
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  apply();
}

export function useTheme() {
  return { isDark, toggleTheme };
}

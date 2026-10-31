<script setup lang="ts">
import { computed, useId, ref, watch } from 'vue';
const props = defineProps<{
  product: { id: number; name: string; categoryId: number; imageUrl?: string };
  hero?: boolean;
}>();
const failed = ref(false);
watch(
  () => props.product.imageUrl,
  () => (failed.value = false),
);
const uid = useId().replaceAll(':', '');
const palette = [
  ['#df7090', '#f4abc0', '#ffe8eb'],
  ['#7a8b56', '#bbc898', '#ecf0df'],
  ['#c2a274', '#e1cb9f', '#f6efdf'],
  ['#a87551', '#c99c73', '#f3e6db'],
  ['#bf8e49', '#e4b975', '#f8ebd4'],
  ['#79564b', '#b18975', '#efe2d9'],
  ['#9c81b4', '#c8b1da', '#eee4f4'],
  ['#6f9c8e', '#b3d3c3', '#e5f0e9'],
];
const colors = computed(() => palette[(props.product.id - 1) % palette.length]);
const type = computed(() =>
  props.product.categoryId === 2 ? 'powder' : props.product.categoryId === 3 ? 'jar' : 'bottle',
);
</script>
<template>
  <img
    v-if="product.imageUrl && !failed"
    :src="product.imageUrl"
    :alt="product.name"
    class="product-image"
    @error="failed = true"
  />
  <svg
    v-else
    class="product-art"
    viewBox="0 0 320 300"
    role="img"
    :aria-label="product.name + ' package illustration'"
  >
    <defs>
      <linearGradient :id="uid + 'glass'" x1="0" x2="1">
        <stop stop-color="#fff" stop-opacity=".7" />
        <stop offset=".18" :stop-color="colors[1]" />
        <stop offset=".65" :stop-color="colors[0]" />
        <stop offset=".87" :stop-color="colors[1]" />
        <stop offset="1" :stop-color="colors[0]" />
      </linearGradient>
      <linearGradient :id="uid + 'paper'" x1="0" x2="1">
        <stop :stop-color="colors[1]" />
        <stop offset=".45" :stop-color="colors[2]" />
        <stop offset="1" :stop-color="colors[1]" />
      </linearGradient>
      <filter :id="uid + 'shadow'" x="-50%" width="200%" y="-30%" height="180%">
        <feDropShadow dx="7" dy="12" stdDeviation="7" flood-color="#6d354a" flood-opacity=".15" />
      </filter>
    </defs>
    <ellipse cx="163" cy="265" rx="66" ry="9" fill="#6d354a" opacity=".08" />
    <g
      :filter="`url(#${uid}shadow)`"
      :transform="type === 'bottle' ? 'rotate(-7 160 160)' : 'rotate(5 160 160)'"
    >
      <template v-if="type === 'bottle'">
        <path
          d="M142 55 L142 86 Q141 97 126 108 Q116 117 116 132 L116 247 Q116 257 128 259 L192 259 Q204 257 204 247 L204 132 Q204 117 194 108 Q179 97 178 86 L178 55Z"
          :fill="`url(#${uid}glass)`"
          stroke="#fff"
          stroke-opacity=".5"
        />
        <rect x="139" y="39" width="42" height="31" rx="5" fill="#67414a" />
        <path
          d="M144 45v20m6-20v20m6-20v20m6-20v20m6-20v20m6-20v20"
          stroke="#8f656f"
          stroke-width="2"
        />
        <path d="M123 132 Q160 139 197 132 L197 222 Q160 229 123 222Z" fill="#fffaf2" />
        <text
          x="160"
          y="153"
          text-anchor="middle"
          fill="#5e3947"
          font-size="16"
          font-family="Georgia"
          font-weight="bold"
        >
          SistaBrew
          <tspan font-size="7" dy="-5">✦</tspan>
        </text>
        <path d="M137 161h46" stroke="#cdb4b7" />
        <text
          x="160"
          y="181"
          text-anchor="middle"
          :fill="colors[0]"
          font-size="12"
          font-family="Georgia"
        >
          {{ product.name.split(' ')[0] }}
        </text>
        <text
          x="160"
          y="195"
          text-anchor="middle"
          :fill="colors[0]"
          font-size="12"
          font-family="Georgia"
        >
          {{ product.name.split(' ').slice(1).join(' ') }}
        </text>
        <text x="160" y="214" text-anchor="middle" fill="#9c8186" font-size="6" letter-spacing="2">
          CRAFT SYRUP · 750 ML
        </text>
        <path
          d="M125 121v119"
          stroke="white"
          stroke-opacity=".3"
          stroke-width="4"
          stroke-linecap="round"
        />
      </template>
      <template v-else-if="type === 'powder'">
        <path
          d="M104 78 Q160 84 216 78 L209 115 L223 249 Q221 260 209 261 L110 261 Q98 260 97 249 L111 115Z"
          :fill="`url(#${uid}paper)`"
          :stroke="colors[1]"
        />
        <path d="M107 87h106m-105 5h105" :stroke="colors[0]" stroke-width="2" opacity=".5" />
        <path d="M115 118h91v111h-91z" fill="#fffaf2" opacity=".95" />
        <text
          x="160"
          y="143"
          text-anchor="middle"
          fill="#5e3947"
          font-size="19"
          font-family="Georgia"
          font-weight="bold"
        >
          SistaBrew
          <tspan font-size="8" dy="-6">✦</tspan>
        </text>
        <text
          x="160"
          y="169"
          text-anchor="middle"
          :fill="colors[0]"
          font-family="Georgia"
          font-size="14"
        >
          {{ product.name.split(' ')[0] }}
        </text>
        <text
          x="160"
          y="187"
          text-anchor="middle"
          :fill="colors[0]"
          font-family="Georgia"
          font-size="14"
        >
          {{ product.name.split(' ').slice(1).join(' ') }}
        </text>
        <path d="M145 203q15-21 30 0q-15 12-30 0" :fill="colors[1]" />
        <text
          x="160"
          y="219"
          text-anchor="middle"
          fill="#9c8186"
          font-size="6"
          letter-spacing="1.8"
        >
          THE DAILY BLEND · {{ product.id === 2 ? '250 G' : '500 G' }}
        </text>
        <path d="M105 248h110" :stroke="colors[0]" opacity=".25" />
      </template>
      <template v-else>
        <rect x="105" y="105" width="110" height="154" rx="18" :fill="`url(#${uid}glass)`" />
        <rect x="101" y="90" width="118" height="27" rx="6" fill="#67414a" />
        <path
          d="M109 95v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16m8-16v16"
          stroke="#8f656f"
        />
        <rect x="112" y="139" width="96" height="93" rx="2" fill="#fffaf2" />
        <text
          x="160"
          y="162"
          text-anchor="middle"
          fill="#5e3947"
          font-size="18"
          font-family="Georgia"
          font-weight="bold"
        >
          SistaBrew✦
        </text>
        <text
          x="160"
          y="184"
          text-anchor="middle"
          :fill="colors[0]"
          font-size="12"
          font-family="Georgia"
        >
          {{ product.name.split(' ').slice(0, -1).join(' ') }}
        </text>
        <text
          x="160"
          y="200"
          text-anchor="middle"
          :fill="colors[0]"
          font-size="12"
          font-family="Georgia"
        >
          {{ product.name.split(' ').slice(-1).join(' ') }}
        </text>
        <text
          x="160"
          y="220"
          text-anchor="middle"
          fill="#9c8186"
          font-size="6"
          letter-spacing="1.5"
        >
          THE FINISHING TOUCH · 500 G
        </text>
      </template>
    </g>
    <g v-if="product.id === 1" transform="translate(229 229) rotate(18)">
      <path d="M-17-3Q-19 11 0 29Q20 10 17-3Q0-14-17-3" fill="#ce5b79" />
      <path d="M-13-6l10 4 3-13 4 12 11-6-6 13-10-3-9 2z" fill="#7e9463" />
      <path d="M-8 7l1 3m11-3 1 3m-7 7 1 3m10-9 1 3" stroke="#f9d8b0" stroke-width="2" />
    </g>
    <g v-if="product.id === 2" transform="translate(233 243)">
      <ellipse rx="26" ry="12" fill="#f8f5e8" />
      <ellipse cy="-3" rx="22" ry="9" fill="#8d9d64" />
      <path d="M-14-5q16-12 29 0" stroke="#adbc82" fill="none" />
    </g>
    <g v-if="product.id === 4" fill="#6f4536">
      <circle cx="237" cy="250" r="8" />
      <circle cx="251" cy="245" r="7" />
      <circle cx="249" cy="258" r="7" />
    </g>
  </svg>
</template>

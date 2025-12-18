<script setup lang="ts">
/**
 * MermaidDiagram.vue
 * Mermaid 다이어그램 렌더링 컴포넌트
 * 
 * 주요 기능:
 * - Mermaid 다이어그램 SVG 렌더링
 * - 줌/팬 인터랙션
 * - 코드 뷰어
 * - 클래스 노드 클릭 이벤트
 */

import { ref, watch, onMounted, computed, nextTick } from 'vue'
import mermaid from 'mermaid'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  diagram: string
}

interface DragState {
  x: number
  y: number
}

// ============================================================================
// 상수 정의
// ============================================================================

const MIN_SCALE = 0.2
const MAX_SCALE = 8
const ZOOM_STEP = 0.2
const ZOOM_WHEEL_STEP = 0.1

/** Mermaid 테마 설정 */
const MERMAID_CONFIG = {
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      // 실제 다이어그램 요소(박스/선/텍스트) 대비를 확실히 올리는 팔레트
      primaryColor: '#c7ddff',          // 박스 헤더/강조 배경
      primaryTextColor: '#0f172a',      // 텍스트(더 진하게)
      primaryBorderColor: '#1d4ed8',    // 박스 테두리(확실)
      lineColor: '#334155',            // 관계선(확실)
      secondaryColor: '#eaf2ff',        // 보조 배경
      tertiaryColor: '#f3f7ff',         // 보조 배경2
      background: '#ffffff',
      mainBkg: '#ffffff',
      nodeBkg: '#eef6ff',              // 노드 박스 바디 배경
      nodeBorder: '#1d4ed8',            // 노드 테두리
      clusterBkg: '#eef2ff',
      clusterBorder: '#475569',
      titleColor: '#0f172a',
      edgeLabelBackground: '#ffffff'
    },
  securityLevel: 'loose' as const
}

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<Props>()

const emit = defineEmits<{
  'class-click': [className: string]
}>()

// ============================================================================
// 상태
// ============================================================================

// DOM 참조
const containerRef = ref<HTMLElement>()

// 렌더링 상태
const svgContent = ref('')
const isRendering = ref(false)
const error = ref<string | null>(null)

// UI 상태
const showCode = ref(false)

// 줌/팬 상태
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref<DragState>({ x: 0, y: 0 })

// ============================================================================
// Computed
// ============================================================================

/**
 * 마크다운 코드펜스가 제거된 클린 다이어그램 코드
 */
const cleanDiagram = computed(() => {
  return props.diagram
    .replace(/```mermaid\n?/g, '')
    .replace(/```\n?/g, '')
    .trim()
})

/**
 * 다이어그램 뷰 트랜스폼 스타일
 */
const diagramTransform = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  transformOrigin: 'center center'
}))

/**
 * 줌 퍼센트 문자열
 */
const zoomPercent = computed(() => Math.round(scale.value * 100))

// ============================================================================
// 렌더링
// ============================================================================

/**
 * Mermaid 초기화
 */
function initMermaid(): void {
  mermaid.initialize(MERMAID_CONFIG)
}

/**
 * 다이어그램 렌더링
 */
async function renderDiagram(): Promise<void> {
  if (!cleanDiagram.value) {
    svgContent.value = ''
    return
  }
  
  isRendering.value = true
  error.value = null
  
  await nextTick()
  
  try {
    const id = `mermaid-${Date.now()}`
    const { svg } = await mermaid.render(id, cleanDiagram.value)
    svgContent.value = svg
    
    await nextTick()
      bindClickEvents()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Mermaid 렌더링 오류'
    console.error('[Mermaid] Rendering error:', e)
  } finally {
    isRendering.value = false
  }
}

/**
 * 클래스 노드 클릭 이벤트 바인딩
 */
function bindClickEvents(): void {
  if (!containerRef.value) return
  
  const classNodes = containerRef.value.querySelectorAll('.classGroup, .node')
  
  classNodes.forEach((node) => {
    const element = node as HTMLElement
    
    element.addEventListener('click', (e) => {
      e.preventDefault()
      const text = node.querySelector('.classTitle, .nodeLabel')?.textContent
      if (text) {
        emit('class-click', text.trim())
      }
    })
    
    element.style.cursor = 'pointer'
  })
}

// ============================================================================
// 줌/팬 핸들러
// ============================================================================

/**
 * 마우스 휠 줌
 */
function handleWheel(e: WheelEvent): void {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP
  scale.value = clampScale(scale.value + delta)
}

/**
 * 드래그 시작
 */
function handleMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return // 좌클릭만
  
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - translateX.value,
    y: e.clientY - translateY.value
  }
}

/**
 * 드래그 중
 */
function handleMouseMove(e: MouseEvent): void {
  if (!isDragging.value) return
  
  translateX.value = e.clientX - dragStart.value.x
  translateY.value = e.clientY - dragStart.value.y
}

/**
 * 드래그 종료
 */
function handleMouseUp(): void {
  isDragging.value = false
}

/**
 * 스케일 값 클램핑
 */
function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value))
}

// ============================================================================
// 액션
// ============================================================================

/**
 * 줌 인
 */
function zoomIn(): void {
  scale.value = clampScale(scale.value + ZOOM_STEP)
}

/**
 * 줌 아웃
 */
function zoomOut(): void {
  scale.value = clampScale(scale.value - ZOOM_STEP)
}

/**
 * 줌/위치 리셋
 */
function resetZoom(): void {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

/**
 * 코드 복사
 */
async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(cleanDiagram.value)
    alert('코드가 복사되었습니다')
  } catch {
    alert('복사 실패')
  }
}

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  initMermaid()
  if (props.diagram) {
  renderDiagram()
  }
})

// ============================================================================
// 워처
// ============================================================================

watch(() => props.diagram, async () => {
  resetZoom()
  await renderDiagram()
}, { immediate: true })
</script>

<template>
  <div class="mermaid-diagram">
    <!-- 툴바 -->
    <div class="diagram-toolbar">
      <button 
        class="btn btn--secondary btn--sm"
        :class="{ active: !showCode }"
        @click="showCode = false"
      >
        📊 다이어그램
      </button>
      <button 
        class="btn btn--secondary btn--sm"
        :class="{ active: showCode }"
        @click="showCode = true"
      >
        📝 코드
      </button>
      <button 
        class="btn btn--secondary btn--sm"
        @click="copyCode"
      >
        📋 복사
      </button>
      
      <!-- 줌 컨트롤 -->
      <div v-show="!showCode" class="zoom-controls">
        <button class="btn btn--secondary btn--sm" @click="zoomOut" title="축소">−</button>
        <span class="zoom-level">{{ zoomPercent }}%</span>
        <button class="btn btn--secondary btn--sm" @click="zoomIn" title="확대">+</button>
        <button class="btn btn--secondary btn--sm" @click="resetZoom" title="리셋">⟲</button>
      </div>
    </div>
    
    <!-- 컨텐츠 영역 -->
    <div class="diagram-content">
      <!-- 다이어그램 뷰 -->
      <div 
        v-show="!showCode"
        class="diagram-wrapper"
        :class="{ dragging: isDragging }"
        @wheel="handleWheel"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
      >
        <div 
          ref="containerRef"
        class="diagram-view"
          :style="diagramTransform"
        v-html="svgContent"
        />
      </div>
      
      <!-- 코드 뷰 -->
      <div v-show="showCode" class="code-view">
        <pre><code>{{ cleanDiagram }}</code></pre>
      </div>
      
      <!-- 로딩 -->
      <div v-if="isRendering" class="overlay-view">
        <span class="overlay-icon">⏳</span>
        <p>다이어그램 렌더링 중...</p>
      </div>
      
      <!-- 에러 -->
      <div v-if="error && !isRendering" class="overlay-view error">
        <span class="overlay-icon">⚠️</span>
        <p>{{ error }}</p>
      </div>
      
      <!-- 빈 상태 -->
      <div v-if="!svgContent && !isRendering && !error && !showCode" class="overlay-view">
        <span class="overlay-icon">📊</span>
        <p>다이어그램이 없습니다</p>
      </div>
    </div>
    
    <!-- 힌트 -->
    <div class="diagram-hint">
      💡 마우스 휠로 줌, 드래그로 이동 | 클래스 클릭 시 확장
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 레이아웃
// ============================================================================

.mermaid-diagram {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

// ============================================================================
// 툴바
// ============================================================================

.diagram-toolbar {
  display: flex;
  gap: var(--spacing-sm);
  padding: 8px 12px;
  flex-wrap: wrap;
  align-items: center;
  flex-shrink: 0;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  
  .btn.active {
    background: var(--color-accent-primary);
    color: var(--color-bg-primary);
  }
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding-left: var(--spacing-sm);
  border-left: 1px solid var(--color-border);
  
  .zoom-level {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    min-width: 40px;
    text-align: center;
  }
}

// ============================================================================
// 컨텐츠 영역
// ============================================================================

.diagram-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  // 너무 흰색이면 경계가 안 보여서 아주 연한 톤을 깔아 가독성 개선
  // 요청: 더 진하게(영역 구분 확실)
  // 바깥 배경은 제거 (다이어그램 요소 색상만으로 가독성 확보)
  background: #ffffff;
  min-height: 0;
  position: relative;
}

// ============================================================================
// 다이어그램 뷰
// ============================================================================

.diagram-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  // 바깥(캔버스) 배경색/그리드는 제거
  background: #ffffff;
  border: none;
  
  &.dragging {
    cursor: grabbing;
  }
}

.diagram-view {
  display: inline-block;
  padding: 22px;
  transition: transform 0.05s ease-out;
  background: #ffffff;
  border: 1px solid rgba(51, 65, 85, 0.55);
  border-radius: 8px;
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.12),
    0 2px 10px rgba(15, 23, 42, 0.08);
  
  :deep(svg) {
    display: block;
    max-width: none;
    height: auto;
  }
  
  :deep(.classGroup),
  :deep(.node) {
    cursor: pointer;
    transition: opacity 0.2s;
    
    &:hover {
      opacity: 0.8;
    }
  }

  // ==========================================================================
  // Mermaid SVG 요소 스타일 강화(가독성)
  // - Mermaid themeVariables가 적용이 약한 케이스를 CSS로 보강
  // ==========================================================================

  // 클래스/노드 박스 배경/테두리
  :deep(.classGroup rect),
  :deep(.node rect),
  :deep(.node polygon),
  :deep(.node path) {
    fill: #eef6ff !important;
    stroke: #1d4ed8 !important;
    stroke-width: 1.4px !important;
  }

  // 클래스 제목 영역이 따로 렌더링되는 경우(버전에 따라 다름)
  :deep(.classGroup .title),
  :deep(.classGroup .classTitle),
  :deep(.node .label),
  :deep(.nodeLabel) {
    fill: #0f172a !important;
    color: #0f172a !important;
    font-weight: 700 !important;
  }

  // 일반 텍스트(속성/메서드)
  :deep(text) {
    fill: #0f172a !important;
  }

  // 관계선/화살표
  :deep(.edgePath path),
  :deep(.relation line),
  :deep(.relation path),
  :deep(.edge path) {
    stroke: #334155 !important;
    stroke-width: 1.6px !important;
    opacity: 0.95 !important;
  }

  // 화살표 마커(삼각형)
  :deep(marker path) {
    fill: #334155 !important;
    stroke: #334155 !important;
  }

  // 관계 라벨 배경(겹치는 곳 가독성)
  :deep(.edgeLabel rect),
  :deep(.labelBkg) {
    fill: rgba(255, 255, 255, 0.92) !important;
    stroke: rgba(51, 65, 85, 0.35) !important;
  }
}

// ============================================================================
// 코드 뷰
// ============================================================================

.code-view {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 16px;
  // 코드 탭도 바깥 배경색 제거
  background: #ffffff;
  
  pre {
    margin: 0;
    padding: 16px;
    background: #ffffff;
    border: 1px solid rgba(51, 65, 85, 0.55);
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre;
    overflow-x: auto;
  }
  
  code {
    color: #334155;
  }
}

// ============================================================================
// 오버레이 뷰 (로딩, 에러, 빈 상태)
// ============================================================================

.overlay-view {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  
  .overlay-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }
  
  p {
    font-size: 14px;
    color: #64748b;
  }
  
  &.error p {
    color: #ef4444;
  }
}

// ============================================================================
// 힌트
// ============================================================================

.diagram-hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

// ============================================================================
// 버튼
// ============================================================================

.btn--sm {
  padding: 4px 10px;
  font-size: 12px;
}

// ============================================================================
// 애니메이션
// ============================================================================

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.overlay-view .overlay-icon {
  animation: pulse 1.5s infinite;
}
</style>

<script setup lang="ts">
/**
 * VueFlowClassDiagram.vue
 * VueFlow 기반 UML 클래스 다이어그램 컴포넌트
 * 
 * 주요 기능:
 * - Neo4j 데이터를 기반으로 UML 클래스 다이어그램 렌더링
 * - 깊이 기반 노드 필터링
 * - 클래스 노드 확장 기능
 * - 드래그/줌 인터랙션
 */

import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, NodeMouseEvent } from '@vue-flow/core'
import type { GraphNode, GraphLink } from '@/types'
import {
  buildClassDiagramData,
  findNodeIdsByClassNames,
  ARROW_STYLES,
  VISIBILITY_MAP,
  type UmlClass,
  type ClassDiagramData
} from '@/utils/classDiagram'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  /** 전체 그래프 노드 */
  graphNodes: GraphNode[]
  /** 전체 그래프 링크 */
  graphLinks: GraphLink[]
  /** 선택된 클래스 정보 */
  selectedClasses: Array<{ className: string; directory: string }>
  /** 탐색 깊이 */
  depth: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 3
})

const emit = defineEmits<{
  /** 클래스 노드 클릭 */
  (e: 'class-click', className: string, directory: string): void
  /** 클래스 노드 더블클릭 (확장) */
  (e: 'class-expand', className: string, directory: string): void
}>()

// ============================================================================
// VueFlow 설정
// ============================================================================

const { fitView, zoomIn, zoomOut } = useVueFlow()

// ============================================================================
// 상태
// ============================================================================

/** VueFlow 노드 */
const nodes = ref<Node[]>([])

/** VueFlow 엣지 */
const edges = ref<Edge[]>([])

/** 선택된 노드 ID */
const selectedNodeId = ref<string | null>(null)

/** 다이어그램 데이터 */
const diagramData = ref<ClassDiagramData | null>(null)

// ============================================================================
// Computed
// ============================================================================

/** 다이어그램이 비어있는지 */
const isEmpty = computed(() => nodes.value.length === 0)

// ============================================================================
// 유틸리티 함수 - 노드 레이아웃
// ============================================================================

/**
 * 계층적 레이아웃 계산 (상속 관계 기반)
 * - 부모 클래스가 위에, 자식 클래스가 아래에 배치
 * - 같은 레벨의 클래스는 가로로 배치
 */
function calculateHierarchicalLayout(
  classes: UmlClass[],
  relationships: Array<{ source: string; target: string; type: string }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  
  const nodeWidth = 320
  const nodeHeight = 280
  const gapX = 60
  const gapY = 80
  
  // 상속/구현 관계로 레벨 계산
  const childToParent = new Map<string, string[]>()
  const parentToChildren = new Map<string, string[]>()
  
  for (const rel of relationships) {
    if (rel.type === 'EXTENDS' || rel.type === 'IMPLEMENTS') {
      // source가 자식, target이 부모
      const parents = childToParent.get(rel.source) || []
      parents.push(rel.target)
      childToParent.set(rel.source, parents)
      
      const children = parentToChildren.get(rel.target) || []
      children.push(rel.source)
      parentToChildren.set(rel.target, children)
    }
  }
  
  // 루트 노드 찾기 (부모가 없는 노드)
  const classIds = new Set(classes.map(c => c.id))
  const roots: string[] = []
  const nonRoots = new Set<string>()
  
  for (const cls of classes) {
    const parents = childToParent.get(cls.id) || []
    const hasParentInDiagram = parents.some(p => classIds.has(p))
    if (!hasParentInDiagram) {
      roots.push(cls.id)
    } else {
      nonRoots.add(cls.id)
    }
  }
  
  // BFS로 레벨 할당
  const levels = new Map<string, number>()
  const queue: { id: string; level: number }[] = roots.map(id => ({ id, level: 0 }))
  const visited = new Set<string>()
  
  while (queue.length > 0) {
    const { id, level } = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    levels.set(id, level)
    
    const children = parentToChildren.get(id) || []
    for (const child of children) {
      if (classIds.has(child) && !visited.has(child)) {
        queue.push({ id: child, level: level + 1 })
      }
    }
  }
  
  // 방문하지 못한 노드들 (독립 노드) 처리
  for (const cls of classes) {
    if (!levels.has(cls.id)) {
      levels.set(cls.id, 0)
    }
  }
  
  // 레벨별로 노드 그룹화
  const levelGroups = new Map<number, string[]>()
  for (const [id, level] of levels) {
    const group = levelGroups.get(level) || []
    group.push(id)
    levelGroups.set(level, group)
  }
  
  // 위치 계산
  const maxLevel = Math.max(...Array.from(levelGroups.keys()))
  
  for (let level = 0; level <= maxLevel; level++) {
    const group = levelGroups.get(level) || []
    const totalWidth = group.length * nodeWidth + (group.length - 1) * gapX
    const startX = -totalWidth / 2
    
    group.forEach((id, index) => {
      positions.set(id, {
        x: startX + index * (nodeWidth + gapX),
        y: level * (nodeHeight + gapY)
      })
    })
  }
  
  return positions
}

/**
 * 노드 높이 계산 (필드/메서드 수에 따라)
 */
function calculateNodeHeight(umlClass: UmlClass): number {
  const headerHeight = 56  // 헤더 (스테레오타입 + 클래스명)
  const sectionPadding = 8 // 섹션 패딩
  const memberHeight = 22  // 멤버 한 줄 높이
  const dividerHeight = 2  // 구분선
  const minSectionHeight = 24 // 빈 섹션 최소 높이
  
  // 필드 섹션 높이
  const fieldCount = Math.min(umlClass.fields.length, 8)
  const fieldsHeight = fieldCount > 0 
    ? (fieldCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  // 메서드 섹션 높이
  const methodCount = Math.min(umlClass.methods.length, 8)
  const methodsHeight = methodCount > 0 
    ? (methodCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  return headerHeight + fieldsHeight + methodsHeight + 20
}

// ============================================================================
// 유틸리티 함수 - 포맷팅 (UML 클래스 다이어그램 표준)
// 참고: https://brownbears.tistory.com/577
// ============================================================================

/**
 * 접근제어자 기호 변환
 * + public, - private, # protected, ~ default
 */
function formatVisibility(visibility: string): string {
  return VISIBILITY_MAP[visibility] || VISIBILITY_MAP['private']
}

/**
 * 필드 문자열 생성 (UML 표준: {접근제어자}{필드명}: {타입})
 */
function formatField(field: { name: string; type: string; visibility: string }): string {
  const vis = VISIBILITY_MAP[field.visibility] || '-'
  return field.type ? `${vis}${field.name}: ${field.type}` : `${vis}${field.name}`
}

/**
 * 파라미터 목록 문자열 생성
 */
function formatParams(params: Array<{ name: string; type: string }>): string {
  if (!params || params.length === 0) return ''
  return params
    .map(p => {
      if (p.type && p.name) return `${p.name}: ${p.type}`
      return p.name || p.type || ''
    })
    .filter(Boolean)
    .join(', ')
}

/**
 * 메서드 전체 문자열 생성 (툴팁용)
 */
function formatMethodFull(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  const vis = VISIBILITY_MAP[method.visibility] || '+'
  const params = formatParams(method.parameters)
  
  if (method.isConstructor) {
    return `${vis}${method.name}(${params})`
  }
  return `${vis}${method.name}(${params}): ${method.returnType}`
}

/**
 * 메서드 문자열 생성 (UML 표준: {접근제어자}{메서드명}({파라미터}): {반환타입})
 */
function formatMethod(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  return formatMethodFull(method)
}

// ============================================================================
// 다이어그램 생성
// ============================================================================

/**
 * 다이어그램 데이터 생성 및 VueFlow 노드/엣지 변환
 */
function buildDiagram(): void {
  if (!props.selectedClasses.length || !props.graphNodes.length) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 1. 선택된 클래스의 노드 ID 찾기
  const selectedNodeIds = findNodeIdsByClassNames(
    props.graphNodes,
    props.selectedClasses
  )
  
  if (selectedNodeIds.length === 0) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 2. 클래스 다이어그램 데이터 생성
  const data = buildClassDiagramData(
    props.graphNodes,
    props.graphLinks,
    selectedNodeIds,
    props.depth
  )
  
  diagramData.value = data
  
  // 3. 계층적 레이아웃 계산 (상속 관계 기반)
  const positions = calculateHierarchicalLayout(data.classes, data.relationships)
  
  // 4. VueFlow 노드 생성
  nodes.value = data.classes.map(cls => {
    const pos = positions.get(cls.id) || { x: 0, y: 0 }
    const isSelected = props.selectedClasses.some(
      s => s.className === cls.className && s.directory === cls.directory
    )
    
    return {
      id: cls.id,
      type: 'classNode',
      position: pos,
      data: {
        umlClass: cls,
        isExpanded: isSelected,
        isSelected,
        // UML 포맷팅 함수들
        formatVisibility,
        formatField,
        formatParams,
        formatMethod,
        formatMethodFull
      },
      style: {
        width: '300px',
        height: `${calculateNodeHeight(cls)}px`
      }
    }
  })
  
  // 5. VueFlow 엣지 생성
  edges.value = data.relationships.map(rel => {
    const style = ARROW_STYLES[rel.type] || ARROW_STYLES.ASSOCIATION
    
    return {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      type: 'smoothstep',
      animated: rel.type === 'DEPENDENCY',
      label: rel.label || '',
      labelStyle: { fontSize: 10, fill: '#6b7280' },
      style: style.style,
      markerEnd: {
        type: style.markerEnd as 'arrow' | 'arrowclosed',
        color: style.style.includes('#4f46e5') ? '#4f46e5' 
             : style.style.includes('#059669') ? '#059669'
             : style.style.includes('#dc2626') ? '#dc2626'
             : '#6b7280'
      },
      data: { relationship: rel }
    }
  })
  
  // 6. 뷰 맞추기
  nextTick(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  })
}

// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 노드 클릭 핸들러
 */
function onNodeClick(event: NodeMouseEvent): void {
  const nodeId = event.node.id
  selectedNodeId.value = nodeId
  
  const umlClass = (event.node.data as any)?.umlClass as UmlClass
  if (umlClass) {
    emit('class-click', umlClass.className, umlClass.directory)
  }
}

/**
 * 노드 더블클릭 핸들러 (확장)
 */
function onNodeDoubleClick(event: NodeMouseEvent): void {
  const umlClass = (event.node.data as any)?.umlClass as UmlClass
  if (umlClass) {
    emit('class-expand', umlClass.className, umlClass.directory)
  }
}

// ============================================================================
// 워처
// ============================================================================

// props 변경 시 다이어그램 재생성
watch(
  () => [props.selectedClasses, props.depth, props.graphNodes.length],
  () => {
    buildDiagram()
  },
  { deep: true, immediate: true }
)

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  buildDiagram()
})
</script>

<template>
  <div class="vueflow-class-diagram">
    <!-- 빈 상태 -->
    <div v-if="isEmpty" class="empty-state">
      <div class="empty-icon">📊</div>
      <h3>클래스를 선택하세요</h3>
      <p>검색창에서 클래스를 검색하고 선택하면<br>UML 다이어그램이 표시됩니다</p>
    </div>
    
    <!-- VueFlow 다이어그램 -->
    <VueFlow 
      v-else
      :nodes="nodes"
      :edges="edges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
    >
      <!-- 배경 -->
      <Background pattern-color="#e2e8f0" :gap="20" />
      
      <!-- 컨트롤 -->
      <Controls position="bottom-right" />
      
      <!-- 미니맵 -->
      <MiniMap 
        position="bottom-left"
        :node-stroke-width="3"
        pannable
        zoomable
      />
      
      <!-- 커스텀 클래스 노드 (UML 클래스 다이어그램 표준) -->
      <!-- 
        UML 클래스 다이어그램 표기법:
        - 접근제어자: + (public), - (private), # (protected), ~ (default)
        - 속성: {접근제어자} {필드명}: {타입}
        - 메서드: {접근제어자} {메서드명}({파라미터타입}): {반환타입}
        - 스테레오타입: «interface», «abstract», «enumeration»
        - 밑줄: static, {readonly}: final
        참고: https://brownbears.tistory.com/577
      -->
      <template #node-classNode="{ data }">
        <div 
          class="class-node"
          :class="{
            'is-interface': data.umlClass.classType === 'interface',
            'is-enum': data.umlClass.classType === 'enum',
            'is-abstract': data.umlClass.isAbstract,
            'is-selected': data.isSelected
          }"
        >
          <!-- 헤더 (클래스명 + 스테레오타입) -->
          <div class="class-header">
            <div class="stereotype" v-if="data.umlClass.classType !== 'class' || data.umlClass.isAbstract">
              {{ data.umlClass.classType === 'interface' ? '«interface»' : 
                 data.umlClass.classType === 'enum' ? '«enumeration»' : 
                 data.umlClass.isAbstract ? '«abstract»' : '' }}
            </div>
            <div class="class-name" :class="{ 'italic': data.umlClass.isAbstract }">
              {{ data.umlClass.className }}
            </div>
          </div>
          
          <!-- 속성(필드) 섹션 -->
          <div class="class-section fields">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.fields.length > 0">
              <div 
                v-for="(field, idx) in data.umlClass.fields.slice(0, 8)" 
                :key="'f-' + idx"
                class="member field-member"
                :title="`${field.visibility} ${field.type} ${field.name}`"
              >
                <span class="visibility">{{ data.formatVisibility(field.visibility) }}</span>
                <span class="member-name">{{ field.name }}</span>
                <span class="member-type" v-if="field.type">: {{ field.type }}</span>
              </div>
              <div v-if="data.umlClass.fields.length > 8" class="more">
                ... +{{ data.umlClass.fields.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 메서드 섹션 -->
          <div class="class-section methods">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.methods.length > 0">
              <div 
                v-for="(method, idx) in data.umlClass.methods.slice(0, 8)" 
                :key="'m-' + idx"
                class="member method-member"
                :class="{ 'constructor': method.isConstructor }"
                :title="data.formatMethodFull(method)"
              >
                <span class="visibility">{{ data.formatVisibility(method.visibility) }}</span>
                <span class="member-name">{{ method.name }}</span>
                <span class="params">({{ data.formatParams(method.parameters) }})</span>
                <span class="return-type" v-if="!method.isConstructor">: {{ method.returnType }}</span>
              </div>
              <div v-if="data.umlClass.methods.length > 8" class="more">
                ... +{{ data.umlClass.methods.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 확장 힌트 -->
          <div class="expand-hint">더블클릭하여 확장</div>
        </div>
      </template>
    </VueFlow>
    
    <!-- 범례 -->
    <div class="legend" v-if="!isEmpty">
      <div class="legend-title">관계 타입</div>
      <div class="legend-items">
        <div class="legend-item">
          <span class="line extends"></span>
          <span>상속 (extends)</span>
        </div>
        <div class="legend-item">
          <span class="line implements"></span>
          <span>구현 (implements)</span>
        </div>
        <div class="legend-item">
          <span class="line composition"></span>
          <span>합성 (composition)</span>
        </div>
        <div class="legend-item">
          <span class="line aggregation"></span>
          <span>집합 (aggregation)</span>
        </div>
        <div class="legend-item">
          <span class="line association"></span>
          <span>연관 (association)</span>
        </div>
        <div class="legend-item">
          <span class="line dependency"></span>
          <span>의존 (dependency)</span>
        </div>
      </div>
    </div>
    
    <!-- 통계 -->
    <div class="diagram-stats" v-if="diagramData">
      <span>클래스 {{ diagramData.classes.length }}개</span>
      <span>관계 {{ diagramData.relationships.length }}개</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 컨테이너
// ============================================================================

.vueflow-class-diagram {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f8fafc;
}

// ============================================================================
// 빈 상태
// ============================================================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #64748b;
  
  .empty-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 16px;
    color: #475569;
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  p {
    font-size: 13px;
    line-height: 1.6;
  }
}

// ============================================================================
// 클래스 노드 (UML 클래스 다이어그램 표준 디자인)
// 참고: https://brownbears.tistory.com/577
// ============================================================================

// 머메이드 스타일 클래스 노드
.class-node {
  background: #ffffde;
  border: 1px solid #333333;
  border-radius: 0;
  min-width: 180px;
  max-width: 320px;
  font-size: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  position: relative;
  
  &:hover {
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
    transform: translate(-1px, -1px);
    
    .expand-hint {
      opacity: 1;
    }
  }
  
  // 인터페이스: 파란 배경
  &.is-interface {
    background: #e6f3ff;
    border-color: #0066cc;
    
    .class-header {
      background: #cce5ff;
      border-color: #0066cc;
    }
  }
  
  // Enum: 연두색 배경
  &.is-enum {
    background: #e6ffe6;
    border-color: #339933;
    
    .class-header {
      background: #ccffcc;
      border-color: #339933;
    }
  }
  
  // 추상 클래스: 이탤릭
  &.is-abstract {
    .class-name {
      font-style: italic;
    }
  }
  
  // 선택된 클래스
  &.is-selected {
    border-width: 2px;
    box-shadow: 0 0 0 3px rgba(255, 165, 0, 0.4);
  }
}

// 머메이드 스타일 헤더 영역
.class-header {
  background: #ffecb3;
  color: #333333;
  padding: 8px 12px;
  text-align: center;
  border-bottom: 1px solid #333333;
  
  .stereotype {
    font-size: 10px;
    color: #666666;
    margin-bottom: 2px;
  }
  
  .class-name {
    font-weight: 700;
    font-size: 13px;
    word-break: break-word;
    color: #000000;
    
    &.italic {
      font-style: italic;
    }
  }
}

// 머메이드 스타일 섹션
.class-section {
  padding: 4px 8px;
  min-height: 20px;
  background: #ffffde;
  
  &.methods {
    border-top: 1px solid #333333;
  }
  
  .section-divider {
    display: none;
  }
  
  .empty-section {
    text-align: center;
    color: #888888;
    font-size: 10px;
    padding: 2px 0;
  }
}

// 머메이드 스타일 멤버
.member {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  color: #333333;
  padding: 2px 4px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
  
  // 접근제어자 기호
  .visibility {
    display: inline-block;
    width: 12px;
    font-weight: 700;
    color: #e74c3c;
  }
  
  // 멤버 이름
  .member-name {
    font-weight: 500;
    color: #000000;
  }
  
  // 타입
  .member-type {
    color: #2980b9;
  }
  
  // 파라미터
  .params {
    color: #666666;
  }
  
  // 반환 타입
  .return-type {
    color: #2980b9;
  }
  
  // 생성자
  &.constructor {
    .member-name {
      color: #8e44ad;
    }
  }
}

// 필드 멤버 - private는 빨간색
.field-member .visibility {
  color: #e74c3c;
}

// 메서드 멤버 - public은 초록색
.method-member .visibility {
  color: #27ae60;
}

// 더보기
.more {
  font-size: 10px;
  color: #6b7280;
  font-style: italic;
  padding: 4px 4px 2px;
  text-align: center;
}

// 확장 힌트
.expand-hint {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 9px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}

// ============================================================================
// 범례
// ============================================================================

.legend {
  position: absolute;
  top: 16px;
  right: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
  
  .legend-title {
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .legend-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6b7280;
    
    .line {
      width: 24px;
      height: 2px;
      border-radius: 1px;
      
      &.extends {
        background: #4f46e5;
      }
      
      &.implements {
        background: #4f46e5;
        background: repeating-linear-gradient(
          90deg,
          #4f46e5 0px,
          #4f46e5 4px,
          transparent 4px,
          transparent 7px
        );
      }
      
      &.composition {
        background: #dc2626;
      }
      
      &.aggregation {
        background: #059669;
      }
      
      &.association {
        background: #6b7280;
      }
      
      &.dependency {
        background: repeating-linear-gradient(
          90deg,
          #9ca3af 0px,
          #9ca3af 3px,
          transparent 3px,
          transparent 6px
        );
      }
    }
  }
}

// ============================================================================
// 통계
// ============================================================================

.diagram-stats {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 12px;
  color: #64748b;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
  
  span {
    font-family: 'Consolas', 'Monaco', monospace;
  }
}

// ============================================================================
// VueFlow 커스터마이징
// ============================================================================

:deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

:deep(.vue-flow__controls) {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  
  button {
    background: white;
    border: none;
    
    &:hover {
      background: #f1f5f9;
    }
  }
}
</style>


<script setup lang="ts">
/**
 * NodeDetailPanel.vue
 * 노드 상세 정보 및 그래프 통계 패널
 * 
 * 주요 기능:
 * - 선택된 노드의 속성 표시
 * - 노드/관계 타입별 통계 표시
 */

import { computed, ref } from 'vue'
import type { GraphNode } from '@/types'
import { NODE_COLORS } from '@/config/graphStyles'

// ============================================================================
// 타입 정의
// ============================================================================

interface Stats {
  count: number
  color: string
}

interface Props {
  node: GraphNode | null
  nodeStats?: Map<string, Stats>
  relationshipStats?: Map<string, Stats>
  totalNodes?: number
  totalRelationships?: number
  displayedNodes?: number  // 실제 표시된 노드 수
  hiddenNodes?: number     // limit으로 숨겨진 노드 수
  isProcessing?: boolean
}

interface PropertyItem {
  key: string
  value: string
  isMultiLine: boolean
}

// ============================================================================
// 상수 정의
// ============================================================================

/** 숨길 속성 키 목록 */
const HIDDEN_KEYS = ['labels', 'user_id', 'project_name']

/** 긴 값 기준 (자수) */
const LONG_VALUE_THRESHOLD = 50

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  totalNodes: 0,
  totalRelationships: 0,
  displayedNodes: 0,
  hiddenNodes: 0,
  isProcessing: false
})


// ============================================================================
// 상태
// ============================================================================

/** 펼침 상태 관리 */
const expandedKeys = ref<Set<string>>(new Set())

// ============================================================================
// Computed - 노드 정보
// ============================================================================

/** 노드 타입 (Labels의 첫 번째 값) */
const nodeType = computed(() => props.node?.labels?.[0] || 'Unknown')

/** 노드 타입 색상 */
const nodeTypeColor = computed(() => {
  const type = nodeType.value
  return NODE_COLORS[type] || NODE_COLORS[type.toUpperCase()] || NODE_COLORS.DEFAULT
})

/** 속성 목록 */
const properties = computed<PropertyItem[]>(() => {
  if (!props.node?.properties) return []
  
  return Object.entries(props.node.properties)
    .filter(([key]) => !HIDDEN_KEYS.includes(key))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
      isMultiLine: typeof value === 'object' || String(value).includes('\n')
    }))
})


// ============================================================================
// Computed - 통계
// ============================================================================

/** 노드 통계 (개수 많은 순 정렬) */
const sortedNodeStats = computed(() => {
  if (!props.nodeStats) return []
  
  return Array.from(props.nodeStats.entries())
    .map(([label, stat]) => ({ label, ...stat }))
    .sort((a, b) => b.count - a.count)
})

/** 관계 통계 (개수 많은 순 정렬) */
const sortedRelStats = computed(() => {
  if (!props.relationshipStats) return []
  
  return Array.from(props.relationshipStats.entries())
    .map(([type, stat]) => ({ type, ...stat }))
    .sort((a, b) => b.count - a.count)
})

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 값이 긴지 확인
 */
function isLongValue(value: string): boolean {
  return value.length > LONG_VALUE_THRESHOLD || value.includes('\n')
}


// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 값 펼침/접기 토글
 */
function toggleExpand(key: string): void {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

</script>

<template>
  <div class="panel-content">
    <!-- ========== 노드 선택 시: 속성 표시 ========== -->
    <template v-if="node">
      <!-- 노드 타입 뱃지 -->
      <div class="type-badge-row">
        <span class="type-badge" :style="{ background: nodeTypeColor }">
          {{ nodeType }}
        </span>
      </div>
      
      <!-- Properties 테이블 -->
      <div class="props-table-wrapper">
        <table class="props-table">
          <thead>
            <tr>
              <th class="col-key">속성</th>
              <th class="col-value">값</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="prop in properties" :key="prop.key">
              <td class="cell-key">{{ prop.key }}</td>
              <td class="cell-value">
                <div 
                  class="value-container" 
                  :class="{ expanded: expandedKeys.has(prop.key) }"
                >
                  <div class="value-content">{{ prop.value }}</div>
                </div>
                <button 
                  v-if="isLongValue(prop.value)" 
                  class="show-toggle"
                  @click="toggleExpand(prop.key)"
                >
                  {{ expandedKeys.has(prop.key) ? '접기' : '전체 보기' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
    </template>
    
    <!-- ========== 노드 미선택 시: 통계 표시 ========== -->
    <template v-else>
      <div class="stats-wrapper">
        <!-- Node labels 섹션 -->
        <div class="stats-section">
          <div class="section-title">Node labels</div>
          <div class="badge-container">
            <span class="stat-badge total">* ({{ totalNodes }})</span>
            <span 
              v-for="stat in sortedNodeStats" 
              :key="stat.label"
              class="stat-badge"
              :style="{ background: stat.color }"
            >
              {{ stat.label }} ({{ stat.count }})
            </span>
          </div>
        </div>
        
        <!-- Relationship types 섹션 -->
        <div class="stats-section">
          <div class="section-title">Relationship types</div>
          <div class="badge-container">
            <span class="stat-badge total">* ({{ totalRelationships }})</span>
            <span 
              v-for="stat in sortedRelStats" 
              :key="stat.type"
              class="stat-badge rel"
              :style="{ background: stat.color }"
            >
              {{ stat.type }} ({{ stat.count }})
            </span>
          </div>
        </div>
        
        <!-- 요약 (하단 고정) -->
        <div class="display-summary">
          <div class="summary-main">
            <span class="summary-icon">📊</span>
            <span>{{ displayedNodes || totalNodes }} 노드, {{ totalRelationships }} 관계</span>
          </div>
          <div class="summary-detail" v-if="hiddenNodes > 0">
            <span class="hidden-badge">+{{ hiddenNodes }} 숨김</span>
            <span class="hint">더블클릭으로 확장</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 레이아웃
// ============================================================================

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 8px;
}

// ============================================================================
// 타입 뱃지
// ============================================================================

.type-badge-row {
  margin-bottom: 16px;
}

.type-badge {
  display: inline-block;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 4px;
  color: white;
}

// ============================================================================
// Properties 테이블
// ============================================================================

.props-table-wrapper {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
}

.props-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  
  thead {
    position: sticky;
    top: 0;
    z-index: 1;
    
    th {
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #e2e8f0;
      
      &.col-key {
        width: 110px;
        min-width: 110px;
        background: #f1f5f9;
        color: #475569;
      }
      
      &.col-value {
        width: auto;
        background: #f8fafc;
        color: #64748b;
      }
    }
  }
  
  tbody {
    tr {
      border-bottom: 1px solid #f1f5f9;
      
      &:last-child {
        border-bottom: none;
      }
    }
    
    td {
      padding: 12px 14px;
      vertical-align: top;
    }
  }
}

.cell-key {
  font-weight: 600;
  color: #334155;
  font-size: 12px;
  white-space: nowrap;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}

.cell-value {
  background: white;
}

// ============================================================================
// 값 컨테이너
// ============================================================================

.value-container {
  font-family: var(--font-mono);
  font-size: 12px;
  color: #0369a1;
  line-height: 1.6;
  
  .value-content {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.expanded .value-content {
    display: block;
    -webkit-line-clamp: unset;
    max-height: 300px;
    overflow-y: auto;
  }
}

.show-toggle {
  display: block;
  margin-top: 6px;
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  
  &:hover {
    text-decoration: underline;
  }
}


// ============================================================================
// 통계 섹션
// ============================================================================

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto; // 통계 섹션 스크롤 가능
  overflow-x: hidden;
  padding-right: 4px; // 스크롤바 공간 확보
  
  // 스크롤바 스타일링
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
    
    &:hover {
      background: #94a3b8;
    }
  }
}

.stats-section {
  margin-bottom: 20px;
  flex-shrink: 0; // 섹션이 축소되지 않도록
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 12px;
}

.badge-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 14px;
  color: white;
  
  &.total {
    background: #6b7280;
  }
  
  &.rel {
    background: #9ca3af;
  }
}

// ============================================================================
// 요약
// ============================================================================

.display-summary {
  margin-top: auto;
  padding: 12px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  position: sticky;
  bottom: 0;
  z-index: 10;
  
  .summary-main {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    
    .summary-icon {
      font-size: 16px;
    }
  }
  
  .summary-detail {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 11px;
    
    .hidden-badge {
      padding: 2px 8px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 10px;
      font-weight: 500;
    }
    
    .hint {
      color: #94a3b8;
    }
  }
}
</style>

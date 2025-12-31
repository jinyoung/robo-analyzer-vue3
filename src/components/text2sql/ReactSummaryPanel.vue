<template>
  <div class="summary-panel">
    <div class="status-banner">
      <div class="status-text">
        <span :class="['status-label', statusClass]">
          <span class="status-icon">{{ statusIcon }}</span>
          {{ statusLabel }}
        </span>
        <span v-if="currentStep" class="step-indicator">Step {{ currentStep }}</span>
      </div>
      <div class="status-meta">
        <div class="meta-item">
          <span>남은 호출: <strong>{{ remainingToolCalls }}</strong></span>
        </div>
        <div v-if="latestToolName" class="meta-item tool-name">
          <span>최근 도구: <strong>{{ latestToolName }}</strong></span>
        </div>
        <div v-if="sqlCompleteness" class="meta-item completeness">
          <span>완성도: <strong>{{ sqlCompleteness.confidence_level }}</strong></span>
        </div>
        <div v-if="warnings.length" class="meta-item warning">
          <span>경고: <strong>{{ warnings.length }}</strong>건</span>
        </div>
      </div>
    </div>

    <div class="sql-section" v-if="partialSql">
      <div class="section-header">
        <h3>현재 SQL 스냅샷</h3>
        <button class="btn-copy" type="button" @click="copyPartialSql">복사</button>
      </div>
      <div class="sql-content">
        <pre><code>{{ partialSql }}</code></pre>
      </div>
    </div>

    <div class="sql-section" v-if="finalSql">
      <div class="section-header final">
        <h3>최종 SQL</h3>
        <button class="btn-copy" type="button" @click="copyFinalSql">복사</button>
      </div>
      <div class="sql-content">
        <pre><code>{{ finalSql }}</code></pre>
      </div>
    </div>

    <div class="sql-section" v-if="validatedSql && validatedSql !== finalSql">
      <div class="section-header validated">
        <h3>검증된 SQL</h3>
        <button class="btn-copy" type="button" @click="copyValidatedSql">복사</button>
      </div>
      <div class="sql-content">
        <pre><code>{{ validatedSql }}</code></pre>
      </div>
    </div>

    <div class="warning-section" v-if="warnings.length">
      <h3>⚠️ 경고</h3>
      <ul>
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>

    <div class="metadata-section" v-if="collectedMetadata">
      <details>
        <summary>수집된 메타데이터 보기</summary>
        <pre><code>{{ collectedMetadata }}</code></pre>
      </details>
    </div>

    <div class="result-section" v-if="executionResult">
      <ResultTable :data="executionResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ResultTable from './ResultTable.vue'
import type { ReactExecutionResult, ReactStepModel } from '@/types'

const props = defineProps<{
  status: 'idle' | 'running' | 'needs_user_input' | 'completed' | 'error'
  partialSql: string | null
  finalSql: string | null
  validatedSql: string | null
  warnings: string[]
  executionResult: ReactExecutionResult | null
  collectedMetadata: string
  remainingToolCalls: number
  currentStep?: number
  isRunning?: boolean
  latestStep?: ReactStepModel | null
}>()

const statusLabel = computed(() => {
  switch (props.status) {
    case 'running': return '에이전트 실행 중'
    case 'needs_user_input': return '추가 입력 대기 중'
    case 'completed': return '완료'
    case 'error': return '오류 발생'
    default: return '대기'
  }
})

const statusClass = computed(() => {
  switch (props.status) {
    case 'running': return 'running'
    case 'needs_user_input': return 'waiting'
    case 'completed': return 'completed'
    case 'error': return 'error'
    default: return 'idle'
  }
})

const statusIcon = computed(() => {
  switch (props.status) {
    case 'running': return '⚡'
    case 'needs_user_input': return '💬'
    case 'completed': return '✓'
    case 'error': return '✕'
    default: return '○'
  }
})

const latestToolName = computed(() => props.latestStep?.tool_call?.name ?? null)
const sqlCompleteness = computed(() => props.latestStep?.sql_completeness ?? null)

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

function copyPartialSql() {
  if (props.partialSql) copyToClipboard(props.partialSql)
}

function copyFinalSql() {
  if (props.finalSql) copyToClipboard(props.finalSql)
}

function copyValidatedSql() {
  if (props.validatedSql) copyToClipboard(props.validatedSql)
}
</script>

<style scoped>
.summary-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  padding: 1rem 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.status-text {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
}

.status-icon {
  font-size: 1rem;
}

.status-label.idle {
  background: #f0f0f0;
  color: #666;
}

.status-label.running {
  background: #dbeafe;
  color: #1e40af;
  animation: pulse 2s ease-in-out infinite;
}

.status-label.waiting {
  background: #fef3c7;
  color: #92400e;
}

.status-label.completed {
  background: #d1fae5;
  color: #065f46;
}

.status-label.error {
  background: #fee2e2;
  color: #991b1b;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(30, 64, 175, 0.3); }
  50% { box-shadow: 0 0 0 4px rgba(30, 64, 175, 0); }
}

.step-indicator {
  padding: 0.35rem 0.75rem;
  background: #f0f4ff;
  border: 1px solid #667eea;
  border-radius: 12px;
  color: #667eea;
  font-weight: 600;
  font-size: 0.8rem;
}

.status-meta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.meta-item {
  font-size: 0.85rem;
  color: #6b7280;
  white-space: nowrap;
}

.meta-item strong {
  color: #1f2937;
  font-weight: 700;
}

.meta-item.warning {
  color: #f59e0b;
}

.meta-item.tool-name {
  color: #8b5cf6;
}

.meta-item.completeness {
  color: #10b981;
}

.sql-section {
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.section-header.final {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.section-header.validated {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.section-header h3 {
  margin: 0;
  color: white;
  font-size: 0.9rem;
  font-weight: 600;
}

.btn-copy {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.3);
}

.sql-content {
  background: #1e1e1e;
  padding: 1rem;
  max-height: 250px;
  overflow: auto;
}

.sql-content pre {
  margin: 0;
  color: #d4d4d4;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
}

.sql-content code {
  color: #9cdcfe;
}

.warning-section {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-left: 3px solid #f59e0b;
  padding: 1rem;
  border-radius: 10px;
}

.warning-section h3 {
  margin: 0 0 0.5rem 0;
  color: #92400e;
  font-size: 0.9rem;
}

.warning-section ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #78350f;
  font-size: 0.85rem;
}

.warning-section li {
  margin-bottom: 0.25rem;
}

.metadata-section details {
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.metadata-section summary {
  padding: 0.75rem 1rem;
  cursor: pointer;
  color: #667eea;
  font-weight: 600;
  font-size: 0.85rem;
  background: #f7fafc;
}

.metadata-section summary:hover {
  background: #edf2f7;
}

.metadata-section pre {
  margin: 0;
  padding: 1rem;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', monospace;
  font-size: 0.8rem;
  overflow-x: auto;
  white-space: pre-wrap;
  border-top: 1px solid #e5e7eb;
}

.result-section {
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
</style>


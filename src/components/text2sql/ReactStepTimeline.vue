<template>
  <div class="step-timeline">
    <!-- 스텝 네비게이션 -->
    <div class="step-nav">
      <button class="nav-btn" @click="prevStep" :disabled="currentStepIndex === 0" type="button">
        ‹
      </button>

      <div class="step-indicators">
        <button 
          v-for="(step, index) in sortedSteps" 
          :key="step.iteration" 
          type="button" 
          class="step-indicator"
          :class="{ active: index === currentStepIndex }" 
          @click="currentStepIndex = index"
        >
          <span class="step-number">{{ step.iteration }}</span>
        </button>
      </div>

      <button class="nav-btn" @click="nextStep" :disabled="currentStepIndex === sortedSteps.length - 1" type="button">
        ›
      </button>
    </div>

    <!-- 현재 스텝 카드 -->
    <transition name="slide" mode="out-in">
      <div v-if="currentStep" :key="currentStep.iteration" class="step-card">
        <!-- 스텝 헤더 -->
        <div class="step-header">
          <div class="step-meta">
            <h2 class="step-title">Step {{ currentStep.iteration }}</h2>
            <span class="tool-badge">{{ currentStep.tool_call.name }}</span>
          </div>
          <div class="completeness-badge" :class="{
            complete: currentStep.sql_completeness.is_complete,
            incomplete: !currentStep.sql_completeness.is_complete
          }">
            <span>{{ currentStep.sql_completeness.is_complete ? '✓ SQL 완성' : '⋯ 구성 중' }}</span>
          </div>
        </div>

        <!-- SQL 하이라이트 영역 -->
        <div class="sql-highlight">
          <div class="sql-header">
            <h3>생성된 SQL</h3>
            <button class="btn-copy" @click="copySql(currentStep.partial_sql)" type="button">
              복사
            </button>
          </div>
          <div class="sql-content">
            <pre><code>{{ currentStep.partial_sql || 'SQL이 아직 생성되지 않았습니다...' }}</code></pre>
          </div>
        </div>

        <!-- 추론 과정 -->
        <div class="reasoning-section">
          <h3>AI의 사고 과정</h3>
          <p class="reasoning-text">{{ currentStep.reasoning || '설명 없음' }}</p>
        </div>

        <!-- 상세 정보 -->
        <details class="details-section">
          <summary>상세 정보 보기</summary>
          <div class="details-content">
            <div class="detail-block">
              <h4>SQL 완성도</h4>
              <div class="info-row">
                <span class="label">상태:</span>
                <span class="value">{{ currentStep.sql_completeness.is_complete ? '완성' : '미완성' }}</span>
              </div>
              <div class="info-row">
                <span class="label">신뢰도:</span>
                <span class="value">{{ currentStep.sql_completeness.confidence_level }}</span>
              </div>
              <div v-if="currentStep.sql_completeness.missing_info" class="info-row">
                <span class="label">누락 정보:</span>
                <span class="value">{{ currentStep.sql_completeness.missing_info }}</span>
              </div>
            </div>

            <div class="detail-block">
              <h4>도구 호출 정보</h4>
              <div class="info-row">
                <span class="label">도구명:</span>
                <span class="value code">{{ currentStep.tool_call.name }}</span>
              </div>
              <details v-if="currentStep.tool_result" class="nested-details">
                <summary>실행 결과</summary>
                <pre><code>{{ currentStep.tool_result }}</code></pre>
              </details>
            </div>
          </div>
        </details>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReactStepModel } from '@/types'

const props = defineProps<{
  steps: ReactStepModel[]
  isRunning?: boolean
}>()

const currentStepIndex = ref(0)

const sortedSteps = computed(() => [...props.steps].sort((a, b) => a.iteration - b.iteration))
const currentStep = computed(() => sortedSteps.value[currentStepIndex.value] || null)

function prevStep() {
  if (currentStepIndex.value > 0) {
    currentStepIndex.value--
  }
}

function nextStep() {
  if (currentStepIndex.value < sortedSteps.value.length - 1) {
    currentStepIndex.value++
  }
}

function copySql(sql: string) {
  if (sql) {
    navigator.clipboard.writeText(sql)
  }
}
</script>

<style scoped>
.step-timeline {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e5e7eb;
  background: white;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  font-size: 18px;
  font-weight: 600;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  border-color: #667eea;
  background: #f0f4ff;
  color: #667eea;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.step-indicators {
  flex: 1;
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  padding: 0.25rem 0;
}

.step-indicator {
  flex-shrink: 0;
  padding: 0.4rem 0.75rem;
  background: #f7fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.step-indicator .step-number {
  font-size: 0.85rem;
  font-weight: 600;
  color: #4a5568;
}

.step-indicator.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
}

.step-indicator.active .step-number {
  color: white;
}

.step-indicator:hover:not(.active) {
  border-color: #667eea;
  background: #f0f4ff;
}

.step-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 1.25rem;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f0f4ff;
}

.step-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.step-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #667eea;
}

.tool-badge {
  padding: 0.25rem 0.5rem;
  background: #e0e7ff;
  color: #5b21b6;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}

.completeness-badge {
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
}

.completeness-badge.complete {
  background: #d1fae5;
  color: #065f46;
}

.completeness-badge.incomplete {
  background: #fef3c7;
  color: #92400e;
}

.sql-highlight {
  margin-bottom: 1rem;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #667eea;
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.sql-header h3 {
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
  max-height: 200px;
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

.reasoning-section {
  background: #f0f9ff;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.reasoning-section h3 {
  margin: 0 0 0.5rem 0;
  color: #0c4a6e;
  font-size: 0.9rem;
  font-weight: 600;
}

.reasoning-text {
  margin: 0;
  color: #164e63;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.details-section {
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.details-section summary {
  padding: 0.75rem 1rem;
  background: #f7fafc;
  cursor: pointer;
  font-weight: 600;
  color: #4a5568;
  font-size: 0.85rem;
}

.details-section summary:hover {
  background: #edf2f7;
  color: #667eea;
}

.details-content {
  padding: 1rem;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-block {
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 6px;
  border-left: 3px solid #667eea;
}

.detail-block h4 {
  margin: 0 0 0.5rem 0;
  color: #1a202c;
  font-size: 0.85rem;
  font-weight: 600;
}

.info-row {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.8rem;
  margin-bottom: 0.25rem;
}

.info-row .label {
  font-weight: 600;
  color: #4a5568;
  min-width: 70px;
}

.info-row .value {
  color: #1a202c;
}

.info-row .value.code {
  font-family: 'Consolas', monospace;
  background: #edf2f7;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  font-size: 0.75rem;
}

.nested-details {
  margin-top: 0.5rem;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.nested-details summary {
  padding: 0.5rem 0.75rem;
  background: white;
  cursor: pointer;
  font-weight: 500;
  color: #667eea;
  font-size: 0.8rem;
}

.nested-details pre {
  margin: 0;
  padding: 0.75rem;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', monospace;
  font-size: 0.75rem;
  overflow-x: auto;
  white-space: pre-wrap;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>


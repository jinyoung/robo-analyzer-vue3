<script setup lang="ts">
import { computed } from 'vue'

interface Step {
  step: number
  done: boolean
}

interface Props {
  steps: Step[]
  strategy: string
}

const props = defineProps<Props>()

const stepLabelsMap: Record<string, string[]> = {
  oracle: ['Skeleton', 'Body'],
  postgresql: ['Skeleton', 'Body'],
  java: ['Entity', 'Repository', 'Service', 'Controller', 'Config'],
  python: ['Model', 'Schema', 'Service', 'Router', 'Config']
}

const stepLabels = computed(() => stepLabelsMap[props.strategy] || ['Step'])

const getStepStatus = (step: Step, index: number, steps: Step[]): 'done' | 'current' | 'pending' => {
  if (step.done) return 'done'
  const allPreviousDone = steps.slice(0, index).every(s => s.done)
  if (allPreviousDone && !step.done) return 'current'
  return 'pending'
}
</script>

<template>
  <div class="steps-panel">
    <div class="steps-title">단계</div>
    <div class="steps-list">
      <div 
        v-for="(step, index) in steps" 
        :key="step.step"
        class="step-item"
        :class="getStepStatus(step, index, steps)"
      >
        <div class="step-number">
          <span v-if="step.done">✓</span>
          <span v-else>{{ step.step }}</span>
        </div>
        <div class="step-label">{{ stepLabels[index] }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 노드패널처럼 단순한 단계 패널
.steps-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px;
  min-width: 120px;
}

.steps-title {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e5e7eb;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  
  &.done {
    background: #ecfdf5;
    border-color: #86efac;
    
    .step-number {
      background: #22c55e;
      color: white;
    }
    
    .step-label {
      color: #15803d;
      font-weight: 600;
    }
  }
  
  &.current {
    background: #eff6ff;
    border-color: #93c5fd;
    
    .step-number {
      background: #3b82f6;
      color: white;
    }
    
    .step-label {
      color: #1d4ed8;
      font-weight: 700;
    }
  }
  
  &.pending {
    opacity: 0.5;
    
    .step-number {
      background: #e5e7eb;
      color: #9ca3af;
    }
    
    .step-label {
      color: #9ca3af;
    }
  }
}

.step-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-label {
  font-size: 12px;
  color: #6b7280;
  font-weight: 500;
}
</style>

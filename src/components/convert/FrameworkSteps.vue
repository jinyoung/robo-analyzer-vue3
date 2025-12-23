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
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  
  &.done {
    background: #f0fdf4;
    
    &:hover {
      background: #dcfce7;
    }
    
    .step-number {
      background: #22c55e;
      color: white;
      box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
    }
    
    .step-label {
      color: #15803d;
      font-weight: 600;
    }
  }
  
  &.current {
    background: #eff6ff;
    animation: pulse 2s ease-in-out infinite;
    
    &:hover {
      background: #dbeafe;
    }
    
    .step-number {
      background: #3b82f6;
      color: white;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
      animation: glow 2s ease-in-out infinite;
    }
    
    .step-label {
      color: #1d4ed8;
      font-weight: 700;
    }
  }
  
  &.pending {
    background: #f9fafb;
    
    &:hover {
      background: #f3f4f6;
    }
    
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
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.step-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  transition: all 0.2s ease;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.95;
  }
}

@keyframes glow {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }
  50% {
    box-shadow: 0 2px 12px rgba(59, 130, 246, 0.6);
  }
}
</style>

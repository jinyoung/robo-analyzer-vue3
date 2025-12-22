<script setup lang="ts">
/**
 * SettingsModal.vue
 * 전역 설정 모달 컴포넌트
 * 
 * 설정 항목:
 * - 노드 표시 제한 (MAX_DISPLAY_NODES)
 * - UML 다이어그램 깊이
 * - API Key
 * - Session 정보 (읽기 전용)
 * - 프로젝트명 (읽기 전용)
 * - 데이터 삭제
 */

import { ref, computed, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'close': []
  'update:nodeLimit': [value: number]
  'update:umlDepth': [value: number]
}>()

// ============================================================================
// Store 연결
// ============================================================================

const sessionStore = useSessionStore()
const projectStore = useProjectStore()

const { sessionId } = storeToRefs(sessionStore)
const { projectName, graphData } = storeToRefs(projectStore)

// ============================================================================
// 설정 상태
// ============================================================================

/** 노드 표시 제한 */
const nodeLimit = ref(500)

/** UML 다이어그램 기본 깊이 */
const umlDepth = ref(3)

/** API Key (마스킹) */
const apiKey = ref('')
const showApiKey = ref(false)

/** 활성 설정 섹션 */
const activeSection = ref<'display' | 'api' | 'session' | 'danger'>('display')

// ============================================================================
// Computed
// ============================================================================

/** 현재 그래프 노드 수 */
const currentNodeCount = computed(() => graphData.value?.nodes.length || 0)

/** 현재 그래프 관계 수 */
const currentRelCount = computed(() => graphData.value?.links.length || 0)

/** API Key 마스킹 */
const maskedApiKey = computed(() => {
  if (!apiKey.value) return '설정되지 않음'
  if (showApiKey.value) return apiKey.value
  return apiKey.value.slice(0, 8) + '••••••••••••••••'
})

// ============================================================================
// 핸들러
// ============================================================================

function handleClose() {
  emit('close')
}

function handleSaveNodeLimit() {
  emit('update:nodeLimit', nodeLimit.value)
}

function handleSaveUmlDepth() {
  emit('update:umlDepth', umlDepth.value)
}

function handleSaveApiKey() {
  sessionStore.setApiKey(apiKey.value)
}

function handleCopySessionId() {
  navigator.clipboard.writeText(sessionId.value)
}

function handleNewSession() {
  if (confirm('새 세션을 시작하시겠습니까? 현재 데이터가 초기화됩니다.')) {
    sessionStore.createNewSession()
    projectStore.reset()
    emit('close')
  }
}

function handleDeleteAll() {
  if (confirm('정말로 모든 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
    projectStore.deleteAllData()
    emit('close')
  }
}

// ============================================================================
// 초기화
// ============================================================================

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // 모달 열릴 때 현재 설정값 로드
    activeSection.value = 'display'
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <div class="modal-container">
          <!-- 헤더 -->
          <div class="modal-header">
            <h2>
              <span class="header-icon">⚙️</span>
              설정
            </h2>
            <button class="close-btn" @click="handleClose">✕</button>
          </div>

          <!-- 사이드바 + 컨텐츠 -->
          <div class="modal-body">
            <!-- 사이드바 -->
            <nav class="settings-nav">
              <button 
                :class="{ active: activeSection === 'display' }"
                @click="activeSection = 'display'"
              >
                <span>📊</span>
                표시 설정
              </button>
              <button 
                :class="{ active: activeSection === 'api' }"
                @click="activeSection = 'api'"
              >
                <span>🔑</span>
                API 설정
              </button>
              <button 
                :class="{ active: activeSection === 'session' }"
                @click="activeSection = 'session'"
              >
                <span>📋</span>
                세션 정보
              </button>
              <button 
                :class="{ active: activeSection === 'danger' }"
                @click="activeSection = 'danger'"
              >
                <span>⚠️</span>
                위험 영역
              </button>
            </nav>

            <!-- 컨텐츠 -->
            <div class="settings-content">
              <!-- 표시 설정 -->
              <div v-if="activeSection === 'display'" class="settings-section">
                <h3>표시 설정</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">노드 표시 제한</span>
                    <span class="label-desc">
                      성능 최적화를 위해 한 번에 표시할 최대 노드 수를 설정합니다.
                      나머지 노드는 더블클릭으로 확장할 수 있습니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="number" 
                      v-model.number="nodeLimit" 
                      min="100" 
                      max="2000" 
                      step="100"
                    />
                    <span class="unit">개</span>
                    <button class="save-btn" @click="handleSaveNodeLimit">저장</button>
                  </div>
                  <div class="setting-info">
                    현재 그래프: <strong>{{ currentNodeCount.toLocaleString() }}</strong> 노드, 
                    <strong>{{ currentRelCount.toLocaleString() }}</strong> 관계
                  </div>
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">UML 기본 깊이</span>
                    <span class="label-desc">
                      클래스 다이어그램의 기본 탐색 깊이입니다.
                      선택한 클래스로부터 몇 단계까지 관계를 표시할지 설정합니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <input 
                      type="range" 
                      v-model.number="umlDepth" 
                      min="1" 
                      max="10" 
                      step="1"
                    />
                    <span class="value">{{ umlDepth }}</span>
                    <button class="save-btn" @click="handleSaveUmlDepth">저장</button>
                  </div>
                </div>
              </div>

              <!-- API 설정 -->
              <div v-if="activeSection === 'api'" class="settings-section">
                <h3>API 설정</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">OpenAI API Key</span>
                    <span class="label-desc">
                      코드 변환에 사용되는 OpenAI API 키입니다.
                      키는 브라우저에 안전하게 저장됩니다.
                    </span>
                  </div>
                  <div class="setting-control api-key-control">
                    <div class="input-wrapper">
                      <input 
                        :type="showApiKey ? 'text' : 'password'"
                        v-model="apiKey" 
                        placeholder="sk-..."
                      />
                      <button 
                        class="toggle-visibility" 
                        @click="showApiKey = !showApiKey"
                      >
                        {{ showApiKey ? '🙈' : '👁️' }}
                      </button>
                    </div>
                    <button class="save-btn" @click="handleSaveApiKey">저장</button>
                  </div>
                </div>
              </div>

              <!-- 세션 정보 -->
              <div v-if="activeSection === 'session'" class="settings-section">
                <h3>세션 정보</h3>
                
                <div class="setting-item readonly">
                  <div class="setting-label">
                    <span class="label-text">Session ID</span>
                    <span class="label-desc">현재 작업 세션의 고유 식별자입니다.</span>
                  </div>
                  <div class="setting-control">
                    <code class="session-id">{{ sessionId }}</code>
                    <button class="copy-btn" @click="handleCopySessionId" title="복사">
                      📋
                    </button>
                  </div>
                </div>

                <div class="setting-item readonly">
                  <div class="setting-label">
                    <span class="label-text">프로젝트명</span>
                    <span class="label-desc">현재 로드된 프로젝트입니다.</span>
                  </div>
                  <div class="setting-control">
                    <span class="project-name">{{ projectName || '없음' }}</span>
                  </div>
                </div>

                <div class="setting-item readonly">
                  <div class="setting-label">
                    <span class="label-text">그래프 데이터</span>
                    <span class="label-desc">현재 로드된 그래프 통계입니다.</span>
                  </div>
                  <div class="setting-control stats">
                    <div class="stat-item">
                      <span class="stat-value">{{ currentNodeCount.toLocaleString() }}</span>
                      <span class="stat-label">노드</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-value">{{ currentRelCount.toLocaleString() }}</span>
                      <span class="stat-label">관계</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 위험 영역 -->
              <div v-if="activeSection === 'danger'" class="settings-section danger-zone">
                <h3>⚠️ 위험 영역</h3>
                
                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">새 세션 시작</span>
                    <span class="label-desc">
                      새 세션을 시작합니다. 현재 업로드된 데이터와 그래프가 초기화됩니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <button class="danger-btn secondary" @click="handleNewSession">
                      🔄 새 세션
                    </button>
                  </div>
                </div>

                <div class="setting-item">
                  <div class="setting-label">
                    <span class="label-text">모든 데이터 삭제</span>
                    <span class="label-desc">
                      서버의 모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                    </span>
                  </div>
                  <div class="setting-control">
                    <button class="danger-btn" @click="handleDeleteAll">
                      🗑️ 전체 삭제
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
// ============================================================================
// 모달 오버레이
// ============================================================================

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 700px;
  max-width: 90vw;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ============================================================================
// 헤더
// ============================================================================

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-bottom: 1px solid #e2e8f0;

  h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
    margin: 0;

    .header-icon {
      font-size: 22px;
    }
  }

  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    color: #64748b;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: #fee2e2;
      border-color: #fecaca;
      color: #dc2626;
    }
  }
}

// ============================================================================
// 바디 (사이드바 + 컨텐츠)
// ============================================================================

.modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

// ============================================================================
// 사이드바
// ============================================================================

.settings-nav {
  width: 180px;
  flex-shrink: 0;
  padding: 16px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;

    span {
      font-size: 16px;
    }

    &:hover {
      background: #e2e8f0;
      color: #334155;
    }

    &.active {
      background: #3b82f6;
      color: white;
    }
  }
}

// ============================================================================
// 컨텐츠 영역
// ============================================================================

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.settings-section {
  h3 {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin: 0 0 20px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
  }

  &.danger-zone {
    h3 {
      color: #dc2626;
      border-color: #fecaca;
    }
  }
}

// ============================================================================
// 설정 항목
// ============================================================================

.setting-item {
  padding: 16px 0;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
  }

  &.readonly {
    .setting-control {
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
    }
  }
}

.setting-label {
  margin-bottom: 12px;

  .label-text {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 4px;
  }

  .label-desc {
    display: block;
    font-size: 12px;
    color: #64748b;
    line-height: 1.5;
  }
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;

  input[type="number"],
  input[type="text"],
  input[type="password"] {
    width: 120px;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    color: #334155;
    transition: all 0.15s;

    &:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
  }

  input[type="range"] {
    flex: 1;
    max-width: 200px;
  }

  .unit, .value {
    font-size: 13px;
    color: #64748b;
    min-width: 30px;
  }

  .value {
    font-weight: 600;
    color: #3b82f6;
  }

  &.api-key-control {
    flex-wrap: wrap;

    .input-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 250px;

      input {
        flex: 1;
        width: auto;
      }

      .toggle-visibility {
        width: 36px;
        height: 36px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;

        &:hover {
          background: #e2e8f0;
        }
      }
    }
  }

  &.stats {
    gap: 24px;

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;

      .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: #3b82f6;
      }

      .stat-label {
        font-size: 11px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
  }
}

.setting-info {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;

  strong {
    color: #3b82f6;
  }
}

// ============================================================================
// 버튼
// ============================================================================

.save-btn {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #2563eb;
  }
}

.copy-btn {
  width: 36px;
  height: 36px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #f1f5f9;
  }
}

.danger-btn {
  padding: 10px 20px;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #b91c1c;
  }

  &.secondary {
    background: #f97316;

    &:hover {
      background: #ea580c;
    }
  }
}

// ============================================================================
// 세션 ID / 프로젝트명
// ============================================================================

.session-id {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #334155;
  word-break: break-all;
}

.project-name {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

// ============================================================================
// 애니메이션
// ============================================================================

.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;

  .modal-container {
    transition: all 0.25s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .modal-container {
    transform: scale(0.95) translateY(10px);
  }
}
</style>


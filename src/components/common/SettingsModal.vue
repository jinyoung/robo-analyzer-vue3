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

const { sessionId, apiKey: storeApiKey } = storeToRefs(sessionStore)
const { projectName, graphData } = storeToRefs(projectStore)

// ============================================================================
// 설정 상태
// ============================================================================

/** 노드 표시 제한 (임시값) */
const tempNodeLimit = ref(500)

/** UML 다이어그램 기본 깊이 (임시값) */
const tempUmlDepth = ref(3)

/** API Key (마스킹) */
const tempApiKey = ref('')
const showApiKey = ref(false)

/** 변경 여부 */
const hasChanges = ref(false)

// store의 apiKey와 동기화
watch(storeApiKey, (value) => {
  if (value) {
    tempApiKey.value = value
  }
}, { immediate: true })

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
  if (!tempApiKey.value) return '설정되지 않음'
  if (showApiKey.value) return tempApiKey.value
  return tempApiKey.value.slice(0, 8) + '••••••••••••••••'
})

// ============================================================================
// 핸들러
// ============================================================================

function handleClose() {
  emit('close')
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
// 저장 및 적용
// ============================================================================

/** 저장 및 적용 */
function handleSaveAndApply() {
  // localStorage에 저장
  localStorage.setItem('nodeLimit', String(tempNodeLimit.value))
  localStorage.setItem('umlDepth', String(tempUmlDepth.value))
  
  // 이벤트 발생
  emit('update:nodeLimit', tempNodeLimit.value)
  emit('update:umlDepth', tempUmlDepth.value)
  window.dispatchEvent(new CustomEvent('nodeLimitChange', { detail: tempNodeLimit.value }))
  window.dispatchEvent(new CustomEvent('umlDepthChange', { detail: tempUmlDepth.value }))
  
  // API Key 저장
  if (tempApiKey.value) {
    sessionStore.setApiKey(tempApiKey.value)
  }
  
  hasChanges.value = false
  emit('close')
}

// ============================================================================
// 초기화
// ============================================================================

// 값 변경 감지 (저장 버튼 활성화용)
watch([tempNodeLimit, tempUmlDepth, tempApiKey], () => {
  if (props.isOpen) {
    hasChanges.value = true
  }
})

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // 모달 열릴 때 현재 설정값 로드
    activeSection.value = 'display'
    hasChanges.value = false
    
    // localStorage에서 현재 값 로드
    const savedNodeLimit = localStorage.getItem('nodeLimit')
    if (savedNodeLimit) {
      tempNodeLimit.value = parseInt(savedNodeLimit)
    }
    const savedUmlDepth = localStorage.getItem('umlDepth')
    if (savedUmlDepth) {
      tempUmlDepth.value = parseInt(savedUmlDepth)
    }
    // API Key 로드
    if (storeApiKey.value) {
      tempApiKey.value = storeApiKey.value
    }
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
                데이터 관리
              </button>
            </nav>

            <!-- 컨텐츠 영역 (스크롤 가능) -->
            <div class="settings-content-wrapper">
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
                      v-model.number="tempNodeLimit" 
                      min="100" 
                      max="2000" 
                      step="100"
                    />
                    <span class="unit">개</span>
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
                      v-model.number="tempUmlDepth" 
                      min="1" 
                      max="10" 
                      step="1"
                    />
                    <span class="value">{{ tempUmlDepth }}</span>
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
                        v-model="tempApiKey" 
                        placeholder="sk-..."
                      />
                      <button 
                        class="toggle-visibility" 
                        @click="showApiKey = !showApiKey"
                      >
                        {{ showApiKey ? '🙈' : '👁️' }}
                      </button>
                    </div>
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

              </div>

              <!-- 데이터 관리 -->
              <div v-if="activeSection === 'danger'" class="settings-section danger-zone">
                <h3>⚠️ 데이터 관리</h3>
                
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
              
              <!-- 저장 버튼 (하단) -->
              <div class="modal-footer">
                <button class="save-btn" @click="handleSaveAndApply">
                  저장
                </button>
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
  background: rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 700px;
  height: 600px;
  max-width: 90vw;
  max-height: 90vh;
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
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #334155;
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
      background: #f8fafc;
      color: #1e293b;
      font-weight: 600;
      border-left: 2px solid #cbd5e1;
    }
  }
}

// ============================================================================
// 컨텐츠 영역
// ============================================================================

.settings-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  
  // 커스텀 스크롤바
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
    
    &:hover {
      background: #94a3b8;
    }
  }
  
  // Firefox
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
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
      color: #1e293b;
      border-color: #e2e8f0;
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
      border-color: #64748b;
      box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
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
    color: #64748b;
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
        color: #64748b;
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
    color: #64748b;
  }
}

// ============================================================================
// 버튼
// ============================================================================

// ============================================================================
// 모달 푸터
// ============================================================================

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  padding: 10px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #2563eb;
  }

  &:active {
    transform: scale(0.98);
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
  background: transparent;
  color: #dc2626;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: #fef2f2;
    border-color: #fecaca;
    color: #b91c1c;
  }

  &.secondary {
    background: transparent;
    color: #64748b;
    border: 1px solid #cbd5e1;

    &:hover {
      background: #f8fafc;
      border-color: #94a3b8;
      color: #475569;
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


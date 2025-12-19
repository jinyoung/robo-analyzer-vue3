<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import DropZone from './DropZone.vue'
import UploadModal from './UploadModal.vue'
import UploadTree from './UploadTree.vue'
import JsonViewer from './JsonViewer.vue'
import { buildUploadTreeFromUploadedFiles, uniqueFilesByRelPath } from '@/utils/upload'

const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const { 
  uploadedFiles, 
  uploadedDdlFiles,
  isProcessing,
  currentStep,
  projectName
} = storeToRefs(projectStore)

// 업로드된 파일을 트리 구조로 표시
const uploadedFileTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedFiles.value, projectName.value)
)
const uploadedDdlTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedDdlFiles.value, projectName.value)
)
const selectedRelPath = ref<string | null>(null)

const showModal = ref(false)
const pendingFiles = ref<File[]>([])
const pendingMetadata = ref<{
  projectName: string
}>({
  projectName: '',
})

// 열린 탭 관리
interface OpenTab {
  id: string
  fileName: string
  content: string
  type: 'file'
}

const openTabs = ref<OpenTab[]>([])
const activeTabId = ref<string | null>(null)

const activeTab = computed(() => 
  openTabs.value.find(t => t.id === activeTabId.value) || null
)

// JSON 파일 여부 확인
const isJsonFile = computed(() => 
  activeTab.value?.fileName.toLowerCase().endsWith('.json') || false
)

const hasUploadedFiles = computed(() => 
  uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0
)

// 드롭존 클릭 시 - 빈 상태로 모달 열기
const handleOpenModal = () => {
  pendingFiles.value = []
  pendingMetadata.value = {
    projectName: '',
  }
  showModal.value = true
}

// 파일 드롭 시 - 파일 분석 후 모달 열기
const handleFilesDrop = (files: File[]) => {
  const metadata = analyzeFileStructure(files)
  pendingFiles.value = files
  pendingMetadata.value = metadata
  showModal.value = true
}

// 디렉토리 구조 분석
const analyzeFileStructure = (files: File[]) => {
  // 자동 구조 인식은 "최상위 공통 폴더 -> projectName"만 수행
  const allFirstFolders = new Set<string>()
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    if (parts.length >= 2) allFirstFolders.add(parts[0])
  }
  const hasCommonRoot = allFirstFolders.size === 1
  const projectName = hasCommonRoot ? Array.from(allFirstFolders)[0] : ''
  return {
    projectName
  }
}

// 모달에서 파일 추가 시
const handleAddFiles = (files: File[]) => {
  const merged = uniqueFilesByRelPath([...pendingFiles.value, ...files], pendingMetadata.value.projectName)
  pendingFiles.value = merged
}

// 모달에서 파일 목록 업데이트 시 (삭제/추가 후 동기화)
const handleFilesUpdated = (updatedFiles: File[]) => {
  pendingFiles.value = updatedFiles
}

// 파일 확장자로 소스 타입 자동 감지
const detectSourceType = (files: File[]): 'oracle' | 'postgresql' | 'java' | 'python' | null => {
  const extensions = files.map(f => {
    const name = f.name.toLowerCase()
    if (name.endsWith('.sql')) return 'sql'
    if (name.endsWith('.java')) return 'java'
    if (name.endsWith('.py')) return 'python'
    return 'other'
  })
  
  const hasJava = extensions.includes('java')
  const hasPython = extensions.includes('python')
  const hasSql = extensions.includes('sql')
  
  // Java 파일이 있으면 Java
  if (hasJava) return 'java'
  // Python 파일이 있으면 Python
  if (hasPython) return 'python'
  // SQL 파일만 있으면 DBMS (기본 Oracle)
  if (hasSql && !hasJava && !hasPython) return 'oracle'
  
  return null
}

// 업로드 확인
const handleUploadConfirm = async (metadata: { projectName: string }) => {
  showModal.value = false
  
  if (pendingFiles.value.length === 0) {
    alert('업로드할 파일이 없습니다. 파일을 먼저 추가해주세요.')
    return
  }
  
  // 소스 타입 자동 감지 및 설정
  const detectedSource = detectSourceType(pendingFiles.value)
  if (detectedSource) {
    projectStore.setSourceType(detectedSource)
  }
  
  try {
    const uploadMeta = {
      ...projectStore.understandingMeta,
      projectName: metadata.projectName
    }
    await projectStore.uploadFiles(pendingFiles.value, uploadMeta)
  } catch (error) {
    alert(`업로드 실패: ${error}`)
  }
}

// 파싱 요청
const handleParse = async () => {
  try {
    await projectStore.parseFiles()
  } catch (error) {
    alert(`파싱 실패: ${error}`)
  }
}

// Understanding 실행
const handleUnderstanding = async () => {
  // 그래프 탭으로 자동 전환
  sessionStore.setActiveTab('graph')
  
  try {
    await projectStore.runUnderstanding()
  } catch (error) {
    alert(`Understanding 실패: ${error}`)
  }
}

// 트리에서 파일 선택 (탭으로 열기)
const handleTreeSelect = (relPath: string) => {
  selectedRelPath.value = relPath
  
  // 파일 노드 찾기
  const findFileNode = (node: any, targetRelPath: string): any => {
    if (node.relPath === targetRelPath && node.type === 'file') {
      return node
    }
    for (const child of node.children || []) {
      const found = findFileNode(child, targetRelPath)
      if (found) return found
    }
    return null
  }
  
  const fileNode = findFileNode(uploadedFileTree.value, relPath) || 
                   findFileNode(uploadedDdlTree.value, relPath)
  
  if (!fileNode || !fileNode.fileContent) return
  
  const fileName = fileNode.relPath || fileNode.name
  const tabId = `file-${fileName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
    return
  }
  
  // 새 탭 추가
  openTabs.value.push({
    id: tabId,
    fileName,
    content: fileNode.fileContent,
    type: 'file'
  })
  activeTabId.value = tabId
}

// 탭 닫기
const closeTab = (tabId: string) => {
  const index = openTabs.value.findIndex(t => t.id === tabId)
  if (index === -1) return
  
  openTabs.value.splice(index, 1)
  
  // 활성 탭이 닫히면 다른 탭으로 이동
  if (activeTabId.value === tabId) {
    if (openTabs.value.length > 0) {
      activeTabId.value = openTabs.value[Math.max(0, index - 1)].id
    } else {
      activeTabId.value = null
    }
  }
}

// 뷰어 콘텐츠 ref
const viewerContentRef = ref<HTMLElement>()

// 탭 활성화
const activateTab = (tabId: string) => {
  activeTabId.value = tabId
  // 탭 전환 시 스크롤 맨 위로
  nextTick(() => {
    viewerContentRef.value?.scrollTo(0, 0)
  })
}

</script>

<template>
  <div class="upload-tab">
    <div class="upload-main">
      <!-- 좌측: 드롭존 또는 파일 목록 -->
      <div class="upload-left">
        <template v-if="!hasUploadedFiles">
          <DropZone 
            @files-drop="handleFilesDrop" 
            @open-modal="handleOpenModal"
          />
        </template>
        <template v-else>
          <div class="uploaded-trees">
            <!-- 일반 파일 트리 -->
            <div class="tree-section">
              <div class="section-header">
                <h3 class="section-title">
                  <span class="icon">📁</span>
                  파일 ({{ uploadedFiles.length }})
                </h3>
              </div>
              <UploadTree
                v-if="uploadedFiles.length > 0"
                :root="uploadedFileTree"
                :show-header="false"
                :selected-rel-path="selectedRelPath"
                :enable-dn-d="false"
                :show-remove-button="false"
                @select="handleTreeSelect"
              />
              <div v-else class="empty-section">파일 없음</div>
            </div>

            <!-- DDL 파일 트리 -->
            <div class="tree-section">
              <div class="section-header">
                <h3 class="section-title">
                  <span class="icon">🗄️</span>
                  DDL ({{ uploadedDdlFiles.length }})
                </h3>
              </div>
              <UploadTree
                v-if="uploadedDdlFiles.length > 0"
                :root="uploadedDdlTree"
                :show-header="false"
                :selected-rel-path="selectedRelPath"
                :enable-dn-d="false"
                :show-remove-button="false"
                @select="handleTreeSelect"
              />
              <div v-else class="empty-section">DDL 파일 없음</div>
            </div>
          </div>
          
          <div class="action-buttons">
            <button 
              class="btn btn--primary" 
              @click="handleParse"
              :disabled="isProcessing || !hasUploadedFiles"
            >
              📄 파싱
            </button>
            <button 
              class="btn btn--primary" 
              @click="handleUnderstanding"
              :disabled="isProcessing"
            >
              🔗 Understanding
            </button>
          </div>
          
        </template>
      </div>
      
      <!-- 우측: 탭 형식 파일 뷰어 -->
      <div class="upload-right">
        <!-- 탭 헤더 -->
        <div class="tabs-header" v-if="openTabs.length > 0">
          <div 
            v-for="tab in openTabs" 
            :key="tab.id"
            class="tab-item"
            :class="{ active: activeTabId === tab.id }"
            @click="activateTab(tab.id)"
          >
            <span class="tab-icon">📄</span>
            <span class="tab-name" :title="tab.fileName">{{ tab.fileName }}</span>
            <button class="tab-close" @click.stop="closeTab(tab.id)">×</button>
          </div>
        </div>
        
        <!-- 탭 콘텐츠 -->
        <div class="viewer-content" ref="viewerContentRef">
          <template v-if="activeTab">
            <!-- JSON 파일 -->
            <JsonViewer v-if="isJsonFile" :json="activeTab.content" />
            <pre v-else class="code-viewer"><code>{{ activeTab.content }}</code></pre>
          </template>
          <template v-else>
            <div class="empty-state">
              <span class="empty-icon">📂</span>
              <p>파일을 선택하면 내용이 여기에 표시됩니다</p>
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <!-- 상태 표시 -->
    <div class="status-bar" v-if="currentStep">
      <span 
        class="status-indicator" 
        :class="{ 
          processing: isProcessing,
          error: currentStep.includes('에러') || currentStep.includes('실패')
        }"
      ></span>
      <span>{{ currentStep }}</span>
    </div>
    
    <!-- 업로드 모달 -->
    <UploadModal 
      v-if="showModal"
      :initial-metadata="pendingMetadata"
      :initial-files="pendingFiles"
      @confirm="handleUploadConfirm"
      @cancel="showModal = false"
      @add-files="handleAddFiles"
      @files-updated="handleFilesUpdated"
    />
  </div>
</template>

<style lang="scss" scoped>
.upload-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  gap: var(--spacing-md);
  overflow: hidden;
}

.upload-main {
  flex: 1;
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0; // grid가 제대로 shrink 되도록
}

.upload-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow: hidden;
}

.file-lists {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
}

.file-section {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  margin: 0;
  
  .icon {
    font-size: 16px;
  }
}

.btn-add {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3B82F6;
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: #2563EB;
  }
  
  &:active {
    background: #1D4ED8;
  }
}

.btn-add-sm {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: #3B82F6;
    border-color: #3B82F6;
    color: white;
  }
  
  &:active {
    background: #2563EB;
    border-color: #2563EB;
  }
}

.file-count {
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.empty-section {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-md);
}

.uploaded-trees {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  
  // 모던한 스크롤바 스타일
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
    transition: background 0.2s ease;
    
    &:hover {
      background: rgba(0, 0, 0, 0.3);
      background-clip: padding-box;
    }
    
    &:active {
      background: rgba(0, 0, 0, 0.4);
      background-clip: padding-box;
    }
  }
  
  // 스크롤 중일 때만 스크롤바 표시 (선택사항 - 필요시 주석 해제)
  // &:not(:hover)::-webkit-scrollbar-thumb {
  //   background: transparent;
  // }
}

.tree-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  
  .section-header {
    flex-shrink: 0;
  }
  
  // UploadTree 컴포넌트의 .tree는 스크롤 없이 자연스럽게 흐르도록
  :deep(.tree) {
    flex-shrink: 0;
    
    .tree-list {
      overflow: visible;
    }
  }
}

.hidden {
  display: none;
}

.action-buttons {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.upload-right {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 0; // flex child가 제대로 shrink 되도록
}

.tabs-header {
  display: flex;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  max-width: 100%;
  
  // 스크롤바 표시 (연한 색상)
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 150, 150, 0.25) transparent;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(150, 150, 150, 0.25);
    border-radius: 2px;
    
    &:hover {
      background: rgba(150, 150, 150, 0.4);
    }
  }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
  background: var(--color-bg-secondary);
  flex-shrink: 0; // 탭이 축소되지 않도록 고정
  min-width: 0; // 텍스트 오버플로우 처리를 위해
  max-width: 200px; // 최대 너비 제한
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.active {
    background: var(--color-bg-tertiary);
    border-bottom: 2px solid var(--color-accent-primary);
    margin-bottom: -1px;
    
    .tab-name {
      color: var(--color-accent-primary);
    }
  }
}

.tab-icon {
  font-size: 14px;
}

.tab-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0; // 오버플로우 처리를 위한 필수 속성
}

.tab-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-primary);
  }
}

.viewer-content {
  flex: 1;
  overflow: auto;
  padding: var(--spacing-md);
  min-height: 0;
  max-height: 60vh;
  background: var(--color-bg-tertiary);
  
  // 스크롤바 항상 표시
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 5px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(100, 100, 100, 0.5);
    border-radius: 5px;
    border: 2px solid transparent;
    background-clip: padding-box;
    
    &:hover {
      background: rgba(100, 100, 100, 0.7);
      background-clip: padding-box;
    }
  }
}

.code-viewer {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  
  code {
    color: var(--color-text-primary);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }
}

.status-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
  
  &.processing {
    background: var(--color-accent-primary);
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  &.error {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>

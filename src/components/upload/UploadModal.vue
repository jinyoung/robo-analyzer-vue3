<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import UploadTree from './UploadTree.vue'
import AddMenu from './AddMenu.vue'
import { buildUploadTree, collectAllFolderPaths, forceWebkitRelativePath, getNormalizedUploadPathWithoutProject, getParentFolderRelPath, inferProjectNameFromPicked, mapPickedFilesToTarget, moveRelPathToFolder, normalizeSlashes, resolveSelectedTargetFolder, splitPath, type UploadTreeNode, uniqueFilesByRelPath } from '@/utils/upload'

interface Props {
  initialMetadata: {
    projectName: string
  }
  initialFiles?: File[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [metadata: { projectName: string }]
  cancel: []
  'add-files': [files: File[], reanalyze: boolean]
  'files-updated': [files: File[]]
}>()

const projectName = ref(props.initialMetadata.projectName || '')
const files = ref<File[]>([...(props.initialFiles || [])])

const folderInput = ref<HTMLInputElement>()
const fileInput = ref<HTMLInputElement>()
const ddlFolderInput = ref<HTMLInputElement>()
const ddlFileInput = ref<HTMLInputElement>()

// 패널별 선택 상태 분리 - 각 패널에서 독립적으로 선택 관리
const fileSelectedRelPath = ref<string | null>(null)
const ddlSelectedRelPath = ref<string | null>(null)

// 빈 폴더 유지를 위한 상태 (파일 삭제 후에도 상위 폴더 유지)
const emptyFolders = ref<Set<string>>(new Set())

// 파일 존재 여부
const hasFiles = computed(() => files.value.length > 0)

// 전체 파일 수
const totalFileCount = computed(() => files.value.length)

// 유효성 검사
const isValid = computed(() => 
  projectName.value.trim() && hasFiles.value
)

// 유효성 오류 메시지
const validationError = computed(() => {
  if (!projectName.value.trim()) return '프로젝트명을 입력해주세요'
  if (!hasFiles.value) return '파일을 추가해주세요'
  return ''
})

watch(() => props.initialMetadata, (val) => {
  projectName.value = val.projectName || ''
}, { deep: true })

watch(() => props.initialFiles, (val) => {
  files.value = [...(val || [])]
}, { deep: true })

const tree = computed(() => buildUploadTree(files.value, projectName.value, emptyFolders.value))

const ddlTree = computed(() => {
  const root = tree.value
  const ddlNode = (root.children || []).find(n => n.type === 'folder' && n.relPath === 'ddl')
  
  // DDL은 폴더 구조를 무시하고 파일만 평탄화하여 표시
  const flattenDdlFiles = (node: UploadTreeNode): UploadTreeNode[] => {
    const files: UploadTreeNode[] = []
    if (node.type === 'file') {
      // relPath를 ddl/파일명 형태로 변환
      const parts = splitPath(node.relPath)
      const fileName = parts[parts.length - 1] || node.name
      return [{
        ...node,
        relPath: `ddl/${fileName}`,
        name: fileName
      }]
    }
    if (node.children) {
      for (const child of node.children) {
        files.push(...flattenDdlFiles(child))
      }
    }
    return files
  }
  
  const flatFiles = ddlNode ? flattenDdlFiles(ddlNode) : []
  
  return {
    type: 'folder' as const,
    name: 'ddl',
    relPath: 'ddl',
    children: flatFiles.sort((a, b) => a.name.localeCompare(b.name))
  }
})
const fileTree = computed(() => {
  const root = tree.value
  
  // ddl 폴더와 ddl로 시작하는 모든 경로를 제외
  const filterDdlFiles = (nodes: UploadTreeNode[]): UploadTreeNode[] => {
    return nodes.filter(n => {
      if (n.type === 'folder' && n.relPath === 'ddl') return false
      if (n.relPath && n.relPath.startsWith('ddl/')) return false
      return true
    }).map(n => {
      if (n.children && n.children.length > 0) {
        return { ...n, children: filterDdlFiles(n.children) }
      }
      return n
    })
  }
  
  const children = filterDdlFiles(root.children || [])
  return {
    type: 'folder' as const,
    name: root.name,
    relPath: '',
    children
  }
})
const mergeFiles = (incoming: File[]) => {
  const next = uniqueFilesByRelPath([...files.value, ...incoming], projectName.value)
  files.value = next
}

type PickKind = 'folder' | 'file'
type PanelKind = 'file' | 'ddl'

const ensureProjectName = (picked: File[]) => {
  if (projectName.value.trim()) return
  const inferred = inferProjectNameFromPicked(picked)
  if (inferred) projectName.value = inferred
}

const applyPicked = (panel: PanelKind, kind: PickKind, picked: File[], input: HTMLInputElement) => {
  if (!picked.length) return

  ensureProjectName(picked)

  // 각 패널은 자신의 선택 상태만 사용
  const selectedPath = panel === 'ddl' ? ddlSelectedRelPath.value : fileSelectedRelPath.value
  const panelTree = panel === 'ddl' ? ddlTree.value : fileTree.value
  
  // DDL 패널은 무조건 'ddl' 폴더로, 파일 패널은 해당 패널의 선택 상태 기준
  const targetFolder = panel === 'ddl' ? 'ddl' : resolveSelectedTargetFolder(panel, selectedPath, panelTree)
  const mapped = mapPickedFilesToTarget(panel, kind, picked, targetFolder)
  
  mergeFiles(mapped)
  emit('add-files', mapped, false)
  input.value = ''
}

// === 확인 ===
const handleConfirm = () => {
  if (!isValid.value) {
    alert(validationError.value)
    return
  }
  emit('confirm', {
    projectName: projectName.value.trim()
  })
}

const handleFolderSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('file', 'folder', picked, input)
}

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('file', 'file', picked, input)
}

const handleDdlFolderSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('ddl', 'folder', picked, input)
}

const handleDdlFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files || [])
  applyPicked('ddl', 'file', picked, input)
}

const chooseFileAddFile = () => {
  fileInput.value?.click()
}

const chooseFileAddFolder = () => {
  folderInput.value?.click()
}

const chooseDdlAddFile = () => {
  ddlFileInput.value?.click()
}

const chooseDdlAddFolder = () => {
  ddlFolderInput.value?.click()
}

// 파일 패널 선택 핸들러
const handleFileTreeSelect = (relPath: string) => {
  fileSelectedRelPath.value = relPath
}

// DDL 패널 선택 핸들러
const handleDdlTreeSelect = (relPath: string) => {
  ddlSelectedRelPath.value = relPath
}

// 파일이 삭제 대상인지 확인하는 헬퍼 함수
const shouldRemoveFile = (fileRelPath: string, targetRelPath: string): boolean => {
  const normalizedFile = normalizeSlashes(fileRelPath)
  const normalizedTarget = normalizeSlashes(targetRelPath)
  
  // 정확한 경로 매칭 (파일 삭제)
  if (normalizedFile === normalizedTarget) return true
  
  // 하위 경로 제거 (폴더 삭제 시) - 정확히 하위 경로인지 확인
  if (normalizedFile.startsWith(normalizedTarget + '/')) return true
  
  // DDL 폴더 삭제 시
  if (normalizedTarget === 'ddl' && normalizedFile.startsWith('ddl/')) return true
  
  // DDL 평탄화 경로(ddl/파일명)인 경우 파일명으로 매칭
  if (normalizedTarget.startsWith('ddl/') && normalizedTarget !== 'ddl') {
    const fileName = normalizedTarget.replace(/^ddl\//, '')
    if (normalizedFile.startsWith('ddl/')) {
      const fileParts = splitPath(normalizedFile)
      return fileParts[fileParts.length - 1] === fileName
    }
  }
  
  return false
}

// 파일 트리에서 삭제 핸들러
const handleFileTreeRemove = (relPath: string) => {
  if (!relPath) return
  
  // 삭제 전 현재 트리의 모든 폴더 경로 수집 (상위 폴더 유지용)
  const currentFolders = collectAllFolderPaths(fileTree.value)
  
  // 삭제 대상이 아닌 파일만 유지
  files.value = files.value.filter(f => {
    const fileRelPath = getNormalizedUploadPathWithoutProject(f, projectName.value)
    return !shouldRemoveFile(fileRelPath, relPath)
  })
  
  // 삭제된 경로의 상위 폴더들을 emptyFolders에 추가 (빈 폴더 유지)
  const parentPath = getParentFolderRelPath(relPath)
  if (parentPath) {
    // 부모 경로와 그 상위 경로들도 유지
    const parts = splitPath(parentPath)
    for (let i = 1; i <= parts.length; i++) {
      const folderPath = parts.slice(0, i).join('/')
      if (currentFolders.has(folderPath)) {
        emptyFolders.value.add(folderPath)
      }
    }
  }
  
  // 삭제된 경로 자체가 폴더인 경우 emptyFolders에서도 제거
  emptyFolders.value.delete(relPath)
  // 삭제된 폴더의 하위 폴더들도 제거
  for (const folder of emptyFolders.value) {
    if (folder.startsWith(relPath + '/')) {
      emptyFolders.value.delete(folder)
    }
  }
  
  emit('files-updated', files.value)
  if (fileSelectedRelPath.value === relPath) fileSelectedRelPath.value = null
}

// DDL 트리에서 삭제 핸들러
const handleDdlTreeRemove = (relPath: string) => {
  if (!relPath) return
  
  files.value = files.value.filter(f => {
    const fileRelPath = getNormalizedUploadPathWithoutProject(f, projectName.value)
    return !shouldRemoveFile(fileRelPath, relPath)
  })
  
  emit('files-updated', files.value)
  if (ddlSelectedRelPath.value === relPath) ddlSelectedRelPath.value = null
}

const moveFileRelPath = (sourceRelPath: string, targetFolderRelPath: string) => {
  const target = moveRelPathToFolder(sourceRelPath, targetFolderRelPath)
  if (sourceRelPath === target) return

  const next = files.value.map((f) => {
    const p = getNormalizedUploadPathWithoutProject(f, projectName.value)
    if (p !== sourceRelPath) return f
    return forceWebkitRelativePath(f, target)
  })
  files.value = next
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">📁 업로드 설정</h2>
        <button class="close-btn" @click="emit('cancel')">✕</button>
      </div>
      
      <div class="modal-body">
        <!-- 상단: 프로젝트명만 -->
        <div class="top-row">
          <div class="project-name-group">
            <label class="form-label">프로젝트명 <span class="required">*</span></label>
            <input 
              v-model="projectName" 
              class="input" 
              :class="{ 'input--error': !projectName.trim() }"
              placeholder="프로젝트명 입력"
            />
          </div>
        </div>
        
        <!-- 시스템 개념은 UI에 노출하지 않음 -->
        <!-- 안내문은 하단 요약 영역에 표시 (가독성 위해 상단은 최소화) -->

        <div class="tree-split">
          <div class="tree-panel">
            <div class="panel-title-row">
              <div class="panel-title">파일</div>
              <div class="panel-actions">
                <AddMenu title="추가" @pickFile="chooseFileAddFile" @pickFolder="chooseFileAddFolder" />
              </div>
            </div>
            <UploadTree
              :root="fileTree"
              :show-header="false"
              :selected-rel-path="fileSelectedRelPath"
              :enable-dn-d="true"
              @select="handleFileTreeSelect"
              @remove="handleFileTreeRemove"
              @move="({ sourceRelPath, targetFolderRelPath }) => moveFileRelPath(sourceRelPath, targetFolderRelPath)"
            />
          </div>
          <div class="tree-panel">
            <div class="panel-title-row">
              <div class="panel-title">DDL</div>
              <div class="panel-actions">
                <AddMenu title="DDL 추가" @pickFile="chooseDdlAddFile" @pickFolder="chooseDdlAddFolder" />
              </div>
            </div>
            <UploadTree
              :root="ddlTree"
              :show-header="false"
              :show-root-as-node="(ddlTree.children?.length || 0) > 0"
              :selected-rel-path="ddlSelectedRelPath"
              :enable-dn-d="true"
              @select="handleDdlTreeSelect"
              @remove="handleDdlTreeRemove"
              @move="({ sourceRelPath, targetFolderRelPath }) => moveFileRelPath(sourceRelPath, targetFolderRelPath || 'ddl')"
            />
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <!-- Hidden inputs -->
        <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="handleFolderSelect" />
        <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect" />
        <input ref="ddlFolderInput" type="file" webkitdirectory class="hidden" @change="handleDdlFolderSelect" />
        <input ref="ddlFileInput" type="file" multiple class="hidden" @change="handleDdlFileSelect" />
        
        <div class="validation-info">
          <div class="file-summary" v-if="hasFiles">
            <div class="file-summary-row">
              <div class="file-summary-main">총 {{ totalFileCount }}개 파일</div>
              <div class="file-summary-sub">· 수정 필요시, 원하는 폴더 선택 후 추가 (DDL은 ddl/ 아래로 배치)</div>
            </div>
          </div>
          <div class="validation-error" v-if="validationError && hasFiles">
            <span class="warn-icon">⚠️</span>
            <span class="warn-text">{{ validationError }}</span>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="btn btn--secondary" @click="emit('cancel')">취소</button>
        <button class="btn btn--primary" @click="handleConfirm" :disabled="!isValid">✓ 업로드</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  animation: fadeIn var(--transition-fast);
}

.modal {
  width: 90%;
  max-width: 800px;
  max-height: 92vh;
  min-height: 72vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: slideUp var(--transition-normal);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-height: 0;
}

.top-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-lg);
}

.project-name-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  .input {
    font-size: 14px;
    padding: 10px 12px;
  }
}

.tree-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  flex: 1;
  min-height: 0;
}

.tree-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.panel-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  padding: 0 4px;
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.panel-actions {
  display: flex;
  gap: 6px;
}

.btn--ghost {
  background: transparent;
  border: 1px solid rgba(59, 130, 246, 0.28);
  color: rgba(59, 130, 246, 0.85);
  cursor: pointer;
  border-radius: var(--radius-sm);
  line-height: 1;
  
  &:hover {
    background: rgba(59, 130, 246, 0.06);
    border-color: rgba(59, 130, 246, 0.45);
    color: rgba(59, 130, 246, 0.95);
}
}

.btn--xs {
  padding: 4px 6px;
  font-size: 12px;
  min-width: 64px;
  min-height: 26px;
}

.btn--icon-only {
  min-width: 28px;
  padding: 4px 6px;
  font-size: 16px;
  line-height: 1;
}



.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
  flex-wrap: nowrap;
}

.modal-footer .btn {
  white-space: nowrap;
}

.modal-footer .btn.btn--secondary,
.modal-footer .btn.btn--primary {
  min-width: 92px;
}

.validation-info {
  display: flex;
  flex-direction: column;
  gap: 8px; /* 요약/경고 간격 */
  width: 100%;
}

.file-summary {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.file-summary-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: nowrap;
}

.file-summary-main {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.file-summary-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}

.validation-error {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--color-danger);
  line-height: 1.2;
  padding-left: 0;
}

.warn-icon {
  width: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
}

.warn-text {
  min-width: 0;
}

.spacer {
  flex: 1;
}

.hidden {
  display: none;
}

.required {
  color: var(--color-danger);
}

.input--error {
  border-color: var(--color-danger) !important;
  
  &:focus {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }
}
</style>

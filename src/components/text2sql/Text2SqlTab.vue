<template>
  <div class="text2sql-tab">
    <!-- 내부 탭 네비게이션 -->
    <div class="internal-tabs">
      <button 
        class="tab-btn" 
        :class="{ active: activeView === 'react' }"
        @click="activeView = 'react'"
      >
        <span class="tab-icon">🧠</span>
        <span class="tab-label">Text2SQL</span>
      </button>
      <button 
        class="tab-btn" 
        :class="{ active: activeView === 'schema' }"
        @click="activeView = 'schema'"
      >
        <span class="tab-icon">📊</span>
        <span class="tab-label">스키마</span>
      </button>
    </div>

    <!-- 콘텐츠 영역 -->
    <div class="content-area">
      <!-- Text2SQL (ReAct) 뷰 -->
      <div v-show="activeView === 'react'" class="react-view">
        <!-- 상단 탭 -->
        <div class="react-tabs">
          <button 
            class="react-tab-btn" 
            :class="{ active: reactTab === 'input' }" 
            @click="reactTab = 'input'"
          >
            <span>✏️ 쿼리 입력</span>
          </button>
          <button 
            class="react-tab-btn" 
            :class="{ active: reactTab === 'summary', disabled: !hasExecutionData }"
            :disabled="!hasExecutionData" 
            @click="reactTab = 'summary'"
          >
            <span>📊 실시간 요약</span>
            <span v-if="reactStore.isRunning" class="live-badge">LIVE</span>
          </button>
          <button 
            class="react-tab-btn" 
            :class="{ active: reactTab === 'details', disabled: !reactStore.hasSteps }"
            :disabled="!reactStore.hasSteps" 
            @click="reactTab = 'details'"
          >
            <span>🔍 상세 스텝</span>
            <span v-if="reactStore.hasSteps" class="step-count">{{ reactStore.steps.length }}</span>
          </button>
        </div>

        <div v-if="reactStore.error" class="error-message">
          <strong>오류:</strong> {{ reactStore.error }}
        </div>

        <!-- ReAct 콘텐츠 -->
        <div class="react-content">
          <transition name="fade" mode="out-in">
            <div v-if="reactTab === 'input'" key="input" class="react-pane">
              <ReactInput 
                :loading="reactStore.isRunning" 
                :waiting-for-user="reactStore.isWaitingUser"
                :question-to-user="reactStore.questionToUser" 
                :current-question="reactStore.currentQuestion"
                @start="handleStart" 
                @respond="handleRespond" 
                @cancel="handleCancel" 
              />
            </div>

            <div v-else-if="reactTab === 'summary'" key="summary" class="react-pane">
              <div v-if="reactStore.isRunning && !reactStore.hasSteps" class="loading-state">
                <div class="spinner"></div>
                <p>에이전트가 SQL을 구성하고 있습니다...</p>
              </div>

              <ReactSummaryPanel 
                v-if="reactStore.hasSteps || reactStore.partialSql || reactStore.finalSql"
                :status="reactStore.status" 
                :partial-sql="reactStore.latestPartialSql"
                :final-sql="reactStore.finalSql" 
                :validated-sql="reactStore.validatedSql"
                :warnings="reactStore.warnings" 
                :execution-result="reactStore.executionResult"
                :collected-metadata="reactStore.collectedMetadata"
                :remaining-tool-calls="reactStore.remainingToolCalls" 
                :current-step="reactStore.steps.length"
                :is-running="reactStore.isRunning" 
                :latest-step="reactStore.latestStep" 
              />
            </div>

            <div v-else-if="reactTab === 'details'" key="details" class="react-pane">
              <ReactStepTimeline 
                v-if="reactStore.hasSteps" 
                :steps="reactStore.steps"
                :is-running="reactStore.isRunning" 
              />
            </div>
          </transition>
        </div>
      </div>

      <!-- 스키마 뷰 -->
      <div v-show="activeView === 'schema'" class="schema-view">
        <div class="schema-header">
          <h2>📊 데이터베이스 스키마</h2>
          <div class="header-actions">
            <input 
              v-model="searchQuery"
              @input="handleSearch"
              type="text" 
              placeholder="테이블 검색..."
              class="search-input"
            />
            <button @click="loadSchema" class="btn-refresh">새로고침</button>
          </div>
        </div>

        <div v-if="schemaStore.loading" class="loading-state">
          <div class="spinner"></div>
          <p>스키마 로딩 중...</p>
        </div>

        <div v-else class="schema-content">
          <div class="schema-grid">
            <!-- 테이블 목록 -->
            <div class="tables-list">
              <h3>테이블 ({{ schemaStore.tables.length }})</h3>
              <div 
                class="table-item" 
                v-for="table in schemaStore.tables" 
                :key="table.name"
                @click="selectTable(table)"
                :class="{ active: schemaStore.selectedTable?.name === table.name }"
              >
                <div class="table-header">
                  <div class="table-name">📋 {{ table.name }}</div>
                  <button 
                    @click.stop="toggleTableEdit(table.name)"
                    class="edit-btn"
                  >
                    {{ editingTable === table.name ? '취소' : '편집' }}
                  </button>
                </div>
                
                <div v-if="editingTable === table.name" class="edit-form">
                  <textarea
                    v-model="tableEditForm.description"
                    placeholder="테이블 설명을 입력하세요..."
                    rows="2"
                  ></textarea>
                  <div class="form-actions">
                    <button @click="saveTableDescription(table)" class="save-btn">저장</button>
                    <button @click="cancelTableEdit" class="cancel-btn">취소</button>
                  </div>
                </div>
                
                <div v-else class="table-info">
                  <span>{{ table.column_count }} columns</span>
                  <span v-if="table.description" class="description">{{ table.description }}</span>
                </div>
              </div>
            </div>

            <!-- 선택된 테이블 상세 -->
            <div class="table-details" v-if="schemaStore.selectedTable">
              <div class="table-details-header">
                <h3>{{ schemaStore.selectedTable.name }}</h3>
                <button @click="refreshTableColumns" class="btn-refresh-small">컬럼 새로고침</button>
              </div>
              <p v-if="schemaStore.selectedTable.description" class="description">
                {{ schemaStore.selectedTable.description }}
              </p>
              
              <table class="columns-table">
                <thead>
                  <tr>
                    <th>컬럼명</th>
                    <th>타입</th>
                    <th>Nullable</th>
                    <th>설명</th>
                    <th>편집</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="col in schemaStore.selectedTableColumns" :key="col.name">
                    <td>
                      <strong>{{ col.name }}</strong>
                      <span v-if="col.name.toLowerCase().includes('id')" class="badge">🔑</span>
                    </td>
                    <td><code>{{ col.dtype }}</code></td>
                    <td>
                      <span :class="col.nullable ? 'yes' : 'no'">
                        {{ col.nullable ? 'YES' : 'NO' }}
                      </span>
                    </td>
                    <td>
                      <div v-if="editingColumn === col.name" class="inline-edit">
                        <textarea
                          v-model="columnEditForm.description"
                          placeholder="컬럼 설명을 입력하세요..."
                          rows="1"
                        ></textarea>
                        <div class="inline-actions">
                          <button @click="saveColumnDescription(col)" class="save-btn-small">저장</button>
                          <button @click="cancelColumnEdit" class="cancel-btn-small">취소</button>
                        </div>
                      </div>
                      <span v-else class="column-description">
                        {{ col.description || '-' }}
                      </span>
                    </td>
                    <td>
                      <button 
                        v-if="editingColumn !== col.name"
                        @click="toggleColumnEdit(col.name)"
                        class="edit-btn-small"
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 릴레이션 관리 -->
          <RelationshipManager :tables="schemaStore.tables" />

          <!-- ER Diagram -->
          <div class="er-section" v-if="schemaStore.tables.length > 0">
            <ERDiagram 
              :tables="schemaStore.tables" 
              :all-columns="schemaStore.allColumnsMap"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useReactStore, useText2SqlSchemaStore } from '@/stores/text2sql'
import { text2sqlApi } from '@/services/api'
import ReactInput from './ReactInput.vue'
import ReactStepTimeline from './ReactStepTimeline.vue'
import ReactSummaryPanel from './ReactSummaryPanel.vue'
import ERDiagram from './ERDiagram.vue'
import RelationshipManager from './RelationshipManager.vue'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'

const reactStore = useReactStore()
const schemaStore = useText2SqlSchemaStore()

// 뷰 상태
const activeView = ref<'react' | 'schema'>('react')
const reactTab = ref<'input' | 'summary' | 'details'>('input')

// 검색
const searchQuery = ref('')

// 편집 상태
const editingTable = ref<string | null>(null)
const editingColumn = ref<string | null>(null)
const tableEditForm = reactive({ description: '' })
const columnEditForm = reactive({ description: '' })

// Computed
const hasExecutionData = computed(() =>
  reactStore.hasSteps || reactStore.partialSql || reactStore.finalSql || reactStore.isRunning
)

// ReAct 이벤트 핸들러
watch(() => reactStore.isRunning, (isRunning, wasRunning) => {
  if (isRunning && !wasRunning) {
    reactTab.value = 'summary'
  }
})

watch(() => reactStore.hasSteps, (hasSteps) => {
  if (hasSteps && reactTab.value === 'input' && !reactStore.isRunning) {
    reactTab.value = 'summary'
  }
})

async function handleStart(
  question: string,
  options: { maxToolCalls: number; maxSqlSeconds: number }
) {
  await reactStore.start(question, options)
}

async function handleRespond(answer: string) {
  await reactStore.continueWithResponse(answer)
}

function handleCancel() {
  reactStore.cancel()
}

// 스키마 함수들
onMounted(async () => {
  await loadSchema()
})

async function loadSchema() {
  await schemaStore.loadTables()
  await schemaStore.loadAllColumns()
}

function handleSearch() {
  schemaStore.loadTables(searchQuery.value)
}

function selectTable(table: Text2SqlTableInfo) {
  schemaStore.selectTable(table)
}

function toggleTableEdit(tableName: string) {
  if (editingTable.value === tableName) {
    cancelTableEdit()
  } else {
    editingTable.value = tableName
    const table = schemaStore.tables.find(t => t.name === tableName)
    tableEditForm.description = table?.description || ''
  }
}

function cancelTableEdit() {
  editingTable.value = null
  tableEditForm.description = ''
}

async function saveTableDescription(table: Text2SqlTableInfo) {
  try {
    await text2sqlApi.updateTableDescription(table.name, table.schema || 'public', tableEditForm.description)
    table.description = tableEditForm.description
    cancelTableEdit()
  } catch (error) {
    console.error('Failed to save table description:', error)
    alert('테이블 설명 저장에 실패했습니다.')
  }
}

function toggleColumnEdit(columnName: string) {
  if (editingColumn.value === columnName) {
    cancelColumnEdit()
  } else {
    editingColumn.value = columnName
    const column = schemaStore.selectedTableColumns.find(c => c.name === columnName)
    columnEditForm.description = column?.description || ''
  }
}

function cancelColumnEdit() {
  editingColumn.value = null
  columnEditForm.description = ''
}

async function saveColumnDescription(column: Text2SqlColumnInfo) {
  try {
    await text2sqlApi.updateColumnDescription(
      schemaStore.selectedTable!.name,
      column.name,
      'public',
      columnEditForm.description
    )
    column.description = columnEditForm.description
    cancelColumnEdit()
  } catch (error) {
    console.error('Failed to save column description:', error)
    alert('컬럼 설명 저장에 실패했습니다.')
  }
}

async function refreshTableColumns() {
  if (schemaStore.selectedTable) {
    await schemaStore.loadTableColumns(schemaStore.selectedTable.name, schemaStore.selectedTable.schema)
  }
}
</script>

<style scoped>
.text2sql-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
}

/* 내부 탭 네비게이션 */
.internal-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #edf2f7;
  color: #475569;
}

.tab-btn.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
  color: white;
}

.tab-icon {
  font-size: 1rem;
}

/* 콘텐츠 영역 */
.content-area {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* ReAct 뷰 */
.react-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.react-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
}

.react-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.react-tab-btn:hover:not(:disabled) {
  background: #edf2f7;
}

.react-tab-btn.active {
  background: #667eea;
  border-color: #667eea;
  color: white;
}

.react-tab-btn.disabled,
.react-tab-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.live-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: white;
  font-size: 0.55rem;
  font-weight: 700;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
  animation: pulse 2s ease-in-out infinite;
}

.step-count {
  background: rgba(255,255,255,0.3);
  padding: 0.1rem 0.35rem;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.error-message {
  background: #ffebee;
  border-left: 3px solid #f44336;
  padding: 0.75rem 1rem;
  margin: 0.5rem;
  border-radius: 6px;
  color: #c62828;
  font-size: 0.85rem;
}

.react-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.react-pane {
  max-width: 1200px;
  margin: 0 auto;
}

.loading-state {
  text-align: center;
  padding: 3rem 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.loading-state p {
  color: #666;
  font-size: 0.95rem;
  margin: 0;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 1rem;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 스키마 뷰 */
.schema-view {
  padding: 1rem;
  height: 100%;
  overflow: auto;
}

.schema-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.schema-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  padding: 0.4rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  width: 200px;
}

.btn-refresh {
  padding: 0.4rem 0.75rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

.schema-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.schema-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1rem;
}

/* 테이블 목록 */
.tables-list {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  padding: 1rem;
  max-height: 500px;
  overflow-y: auto;
}

.tables-list h3 {
  margin: 0 0 0.75rem 0;
  color: #333;
  font-size: 0.95rem;
}

.table-item {
  padding: 0.75rem;
  margin-bottom: 0.35rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.table-item:hover {
  border-color: #4CAF50;
  background: #f8f9fa;
}

.table-item.active {
  border-color: #4CAF50;
  background: #e8f5e9;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.table-name {
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
}

.table-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.8rem;
  color: #666;
}

.edit-form {
  margin-top: 0.35rem;
}

.edit-form textarea {
  width: 100%;
  padding: 0.35rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
}

.form-actions {
  display: flex;
  gap: 0.35rem;
}

.save-btn, .cancel-btn {
  padding: 0.2rem 0.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.save-btn { background: #4CAF50; color: white; }
.cancel-btn { background: #f44336; color: white; }

.edit-btn {
  padding: 0.2rem 0.5rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

/* 테이블 상세 */
.table-details {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  padding: 1rem;
}

.table-details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.table-details h3 {
  margin: 0;
  color: #333;
  font-size: 1rem;
}

.table-details .description {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.btn-refresh-small {
  padding: 0.35rem 0.75rem;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.columns-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.columns-table th {
  background: #f8f9fa;
  padding: 0.5rem;
  text-align: left;
  font-weight: 600;
  color: #555;
  border-bottom: 2px solid #e0e0e0;
}

.columns-table td {
  padding: 0.5rem;
  border-bottom: 1px solid #f0f0f0;
}

.columns-table code {
  background: #f5f5f5;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  font-size: 0.8rem;
}

.badge {
  font-size: 0.75rem;
  margin-left: 0.35rem;
}

.yes { color: #4CAF50; }
.no { color: #f44336; font-weight: 600; }

.inline-edit {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.inline-edit textarea {
  width: 100%;
  padding: 0.2rem;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-size: 0.8rem;
}

.inline-actions {
  display: flex;
  gap: 0.2rem;
}

.save-btn-small, .cancel-btn-small {
  padding: 0.15rem 0.35rem;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.7rem;
}

.save-btn-small { background: #4CAF50; color: white; }
.cancel-btn-small { background: #f44336; color: white; }

.edit-btn-small {
  padding: 0.15rem 0.35rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.7rem;
}

.column-description {
  color: #666;
}

.er-section {
  margin-top: 0.5rem;
}

/* 트랜지션 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 반응형 */
@media (max-width: 900px) {
  .schema-grid {
    grid-template-columns: 1fr;
  }
  
  .tables-list {
    max-height: 300px;
  }
}
</style>


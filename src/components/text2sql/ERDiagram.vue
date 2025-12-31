<template>
  <div class="er-diagram">
    <div class="toolbar">
      <h3>ER Diagram</h3>
      <div class="toolbar-controls">
        <div class="search-controls">
          <input 
            v-model="searchQuery"
            @input="handleSearch"
            type="text" 
            placeholder="테이블 검색..."
            class="search-input"
          />
          <button @click="clearSearch" class="btn-clear">지우기</button>
        </div>
        <div class="filter-controls">
          <label class="filter-label">
            <input 
              type="checkbox" 
              v-model="showConnectedOnly"
              @change="updateDiagram"
            />
            연결된 테이블만 표시
          </label>
          <span class="table-count">{{ filteredTables.length }}개 테이블</span>
        </div>
        <button @click="refreshDiagram" class="btn-refresh">새로고침</button>
      </div>
    </div>
    <div ref="diagramEl" class="diagram-container"></div>
  </div>
</template>

<script setup lang="ts">
import mermaid from 'mermaid'
import { computed, onMounted, ref, watch } from 'vue'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'

const props = defineProps<{
  tables: Text2SqlTableInfo[]
  allColumns: Record<string, Text2SqlColumnInfo[]>
}>()

const diagramEl = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const showConnectedOnly = ref(true)

const filteredTables = computed(() => {
  let tables = props.tables
  
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    tables = tables.filter(table => 
      table.name.toLowerCase().includes(query) ||
      (table.description && table.description.toLowerCase().includes(query))
    )
  }
  
  if (showConnectedOnly.value && tables.length > 0) {
    const connectedTables = getConnectedTables(tables)
    return connectedTables
  }
  
  return tables.slice(0, 20)
})

onMounted(() => {
  mermaid.initialize({ 
    startOnLoad: false,
    theme: 'default',
    er: {
      layoutDirection: 'TB'
    }
  })
  renderDiagram()
})

watch(() => [filteredTables.value, props.allColumns], () => {
  renderDiagram()
}, { deep: true })

async function renderDiagram() {
  if (!diagramEl.value || filteredTables.value.length === 0) {
    if (diagramEl.value) {
      diagramEl.value.innerHTML = '<div class="no-data">표시할 테이블이 없습니다.</div>'
    }
    return
  }
  
  const mermaidCode = generateMermaidER()
  
  try {
    diagramEl.value.innerHTML = ''
    const { svg } = await mermaid.render('er-diagram', mermaidCode)
    diagramEl.value.innerHTML = svg
  } catch (err) {
    console.error('Mermaid render error:', err)
    diagramEl.value.innerHTML = `<pre style="color: red; padding: 1rem;">${err}</pre>`
  }
}

function getConnectedTables(searchTables: Text2SqlTableInfo[]): Text2SqlTableInfo[] {
  const connectedTables = new Set<string>()
  const allTables = props.tables
  
  searchTables.forEach(table => connectedTables.add(table.name))
  
  searchTables.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    columns.forEach(col => {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
        const refTable = allTables.find(t => possibleRefs.includes(t.name))
        if (refTable) {
          connectedTables.add(refTable.name)
        }
      }
    })
    
    allTables.forEach(otherTable => {
      if (otherTable.name === table.name) return
      
      const otherColumns = props.allColumns[otherTable.name] || []
      otherColumns.forEach(col => {
        if (col.name.endsWith('_id') && col.name !== 'id') {
          const baseName = col.name.replace(/_id$/, '')
          const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
          if (possibleRefs.includes(table.name)) {
            connectedTables.add(otherTable.name)
          }
        }
      })
    })
  })
  
  return Array.from(connectedTables)
    .map(tableName => allTables.find(t => t.name === tableName))
    .filter(Boolean)
    .slice(0, 15) as Text2SqlTableInfo[]
}

function generateMermaidER(): string {
  let code = 'erDiagram\n'
  const tablesToRender = filteredTables.value
  
  tablesToRender.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    code += `    ${table.name} {\n`
    
    const displayColumns = columns.slice(0, 5)
    
    displayColumns.forEach(col => {
      let safeType = 'string'
      const dtype = col.dtype.toLowerCase()
      if (dtype.includes('int') || dtype.includes('serial')) {
        safeType = 'int'
      } else if (dtype.includes('decimal') || dtype.includes('numeric') || dtype.includes('float')) {
        safeType = 'float'
      } else if (dtype.includes('date') || dtype.includes('time')) {
        safeType = 'datetime'
      } else if (dtype.includes('bool')) {
        safeType = 'boolean'
      }
      
      const safeName = col.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()
        .substring(0, 15)
      
      code += `        ${safeType} ${safeName}\n`
    })
    
    if (columns.length > 5) {
      code += `        string more_columns\n`
    }
    
    code += `    }\n`
  })
  
  const relationships: string[] = []
  
  tablesToRender.forEach(table => {
    const columns = props.allColumns[table.name] || []
    
    columns.forEach(col => {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleRefs = [baseName + 's', baseName, baseName.replace(/s$/, '')]
        const refTable = tablesToRender.find(t => possibleRefs.includes(t.name))
        if (refTable) {
          const relString = `    ${refTable.name} ||--o{ ${table.name} : "${baseName}"`
          if (!relationships.includes(relString)) {
            relationships.push(relString)
          }
        }
      }
    })
  })
  
  relationships.slice(0, 8).forEach(rel => {
    code += rel + '\n'
  })
  
  return code
}

function refreshDiagram() {
  renderDiagram()
}

function handleSearch() {
  renderDiagram()
}

function clearSearch() {
  searchQuery.value = ''
  renderDiagram()
}

function updateDiagram() {
  renderDiagram()
}
</script>

<style scoped>
.er-diagram {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  padding: 1rem;
}

.toolbar {
  margin-bottom: 1rem;
}

.toolbar h3 {
  margin: 0 0 0.75rem 0;
  color: #333;
  font-size: 1rem;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.search-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex: 1;
  max-width: 250px;
}

.search-input {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.85rem;
}

.btn-clear {
  padding: 0.4rem 0.75rem;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-clear:hover {
  background: #d32f2f;
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: #666;
  cursor: pointer;
}

.table-count {
  font-size: 0.85rem;
  color: #666;
  font-weight: 600;
}

.btn-refresh {
  padding: 0.4rem 0.75rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-refresh:hover {
  background: #45a049;
}

.diagram-container {
  overflow-x: auto;
  min-height: 300px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 0.75rem;
  background: #fafafa;
}

.diagram-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: #666;
  font-style: italic;
}
</style>


/**
 * project.ts
 * 프로젝트 상태 관리 스토어
 * 
 * 주요 기능:
 * - 프로젝트 메타데이터 관리
 * - 파일 업로드/파싱
 * - Understanding (그래프 생성)
 * - Convert (코드 변환)
 * - 다이어그램 생성
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  ProjectMetadata,
  BackendRequestMetadata,
  SourceType,
  ConvertTarget,
  UploadedFile, 
  GraphData,
  GraphNode,
  GraphLink,
  ConvertedFile,
  Neo4jNode,
  Neo4jRelationship,
  StreamMessage
} from '@/types'

// UML 다이어그램은 이제 VueFlow로 로컬에서 처리 (서버 API 요청 제거)
import { useSessionStore } from './session'
import { antlrApi, backendApi } from '@/services/api'

// ============================================================================
// 타입 정의
// ============================================================================

type Strategy = 'dbms' | 'framework'
type MessageType = StreamMessage['type']

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 소스 타입에서 백엔드 strategy 추론
 */
function getStrategyFromSource(source: SourceType): Strategy {
  return (source === 'oracle' || source === 'postgresql') ? 'dbms' : 'framework'
}

/**
 * 타겟에서 백엔드 strategy 추론
 */
function getStrategyFromTarget(target: ConvertTarget): Strategy {
  return (target === 'oracle' || target === 'postgresql') ? 'dbms' : 'framework'
}

/**
 * Neo4j 노드를 내부 형식으로 변환
 */
function convertNeo4jNode(node: Neo4jNode): GraphNode {
  return {
  id: node['Node ID'],
  labels: node['Labels'],
  properties: node['Properties']
  }
}

/**
 * Neo4j 관계를 내부 형식으로 변환
 */
function convertNeo4jRelationship(rel: Neo4jRelationship): GraphLink {
  return {
  id: rel['Relationship ID'],
  source: rel['Start Node ID'],
  target: rel['End Node ID'],
  type: rel['Type'],
  properties: rel['Properties']
  }
}

/**
 * 현재 타임스탬프 생성
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 전략별 초기 단계 생성
 */
function createInitialSteps(strategy: Strategy): { step: number; done: boolean }[] {
  if (strategy === 'dbms') {
    return [{ step: 1, done: false }, { step: 2, done: false }]
  }
  return Array.from({ length: 5 }, (_, i) => ({ step: i + 1, done: false }))
}

// [REMOVED] deduplicateClasses - UML은 이제 VueFlow로 로컬 처리

// ============================================================================
// 스토어 정의
// ============================================================================

export const useProjectStore = defineStore('project', () => {
  const sessionStore = useSessionStore()
  
  // ==========================================================================
  // 상태 - 프로젝트 메타데이터
  // ==========================================================================
  
  const projectName = ref('')
  const sourceType = ref<SourceType>('java')
  const convertTarget = ref<ConvertTarget>('java')
  const ddl = ref<string[]>([])
  
  // ==========================================================================
  // 상태 - 파일
  // ==========================================================================
  
  const uploadedFiles = ref<UploadedFile[]>([])
  const uploadedDdlFiles = ref<UploadedFile[]>([])
  // 파싱 결과는 더 이상 JSON으로 받지 않음
  
  // ==========================================================================
  // 상태 - 그래프 (Map으로 관리하여 ID 기반 덮어쓰기)
  // ==========================================================================
  
  const nodeMap = ref<Map<string, GraphNode>>(new Map())
  const linkMap = ref<Map<string, GraphLink>>(new Map())
  
  // ==========================================================================
  // 상태 - 변환 결과
  // ==========================================================================
  
  const convertedFiles = ref<ConvertedFile[]>([])
  
  // ==========================================================================
  // 상태 - 프로세스
  // ==========================================================================
  
  const isProcessing = ref(false)
  const currentStep = ref('')
  
  // ==========================================================================
  // 상태 - 메시지 (그래프용 / 전환용 분리)
  // ==========================================================================
  
  const graphMessages = ref<StreamMessage[]>([])
  const convertMessages = ref<StreamMessage[]>([])
  
  // ==========================================================================
  // 상태 - 프레임워크 단계
  // ==========================================================================
  
  const frameworkSteps = ref(createInitialSteps('framework'))
  
  // ==========================================================================
  // Computed - 그래프 데이터
  // ==========================================================================
  
  const graphData = computed<GraphData>(() => ({
    nodes: Array.from(nodeMap.value.values()),
    links: Array.from(linkMap.value.values())
  }))
  
  // ==========================================================================
  // Computed - 메타데이터
  // ==========================================================================
  
  const metadata = computed<ProjectMetadata>(() => ({
    sourceType: sourceType.value,
    convertTarget: convertTarget.value,
    projectName: projectName.value,
    ddl: ddl.value
  }))
  
  const understandingMeta = computed<BackendRequestMetadata>(() => ({
    strategy: getStrategyFromSource(sourceType.value),
    target: sourceType.value,
    projectName: projectName.value
  }))
  
  const convertingMeta = computed<BackendRequestMetadata>(() => ({
    strategy: getStrategyFromTarget(convertTarget.value),
    target: convertTarget.value,
    projectName: projectName.value
  }))
  
  const isValidConfig = computed(() => 
    Boolean(projectName.value && (uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0))
  )
  
  // ==========================================================================
  // 내부 함수 - 그래프 데이터
  // ==========================================================================
  
  /**
   * 그래프 데이터 업데이트 (점진적 추가)
   */
  function updateGraphData(nodes: Neo4jNode[], relationships: Neo4jRelationship[]): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    
    for (const node of nodes) {
      const converted = convertNeo4jNode(node)
      newNodeMap.set(converted.id, converted)
    }
    
    for (const rel of relationships) {
      const converted = convertNeo4jRelationship(rel)
      newLinkMap.set(converted.id, converted)
    }
    
    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
  }
  
  /**
   * 그래프 데이터 초기화
   */
  function clearGraphData(): void {
    nodeMap.value = new Map()
    linkMap.value = new Map()
  }
  
  // ==========================================================================
  // 내부 함수 - 메시지
  // ==========================================================================
  
  function addGraphMessage(type: MessageType, content: string): void {
    graphMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function addConvertMessage(type: MessageType, content: string): void {
    convertMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function clearGraphMessages(): void {
    graphMessages.value = []
  }
  
  function clearConvertMessages(): void {
    convertMessages.value = []
  }
  
  
  // ==========================================================================
  // Actions - Setters
  // ==========================================================================
  
  function setProjectName(name: string): void {
    projectName.value = name
  }
  
  function setSourceType(type: SourceType): void {
    sourceType.value = type
  }
  
  function setConvertTarget(target: ConvertTarget): void {
    convertTarget.value = target
    frameworkSteps.value = createInitialSteps(getStrategyFromTarget(target))
  }
  
  function setDdl(d: string[]): void {
    ddl.value = d
  }
  
  // ==========================================================================
  // Actions - 파일 업로드/파싱
  // ==========================================================================
  
  /**
   * 파일 업로드
   */
  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    isProcessing.value = true
    currentStep.value = '파일 업로드 중...'
    
    try {
      const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
      
      projectName.value = result.projectName
      uploadedFiles.value = result.files
      uploadedDdlFiles.value = result.ddlFiles
      
      currentStep.value = '업로드 완료'
      return result
    } catch (error) {
      currentStep.value = '업로드 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 파싱 요청 (결과 JSON 없음, 완료만 표시)
   */
  async function parseFiles() {
    isProcessing.value = true
    currentStep.value = '파싱 중...'
    
    try {
      await antlrApi.parse(understandingMeta.value, sessionStore.getHeaders())
      currentStep.value = '파싱 완료'
    } catch (error) {
      currentStep.value = '파싱 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - Understanding (그래프 생성)
  // ==========================================================================
  
  /**
   * Understanding 실행
   */
  async function runUnderstanding(): Promise<void> {
    isProcessing.value = true
    currentStep.value = 'Understanding 진행 중...'
    
    clearGraphMessages()
    clearGraphData()
    
    try {
      await backendApi.cypherQuery(
        understandingMeta.value,
        sessionStore.getHeaders(),
        (event) => {
          // 메시지 처리 (자연어 상태 메시지)
          if (event.content) {
            addGraphMessage(event.type === 'error' ? 'error' : 'message', event.content)
          }
          
          // 그래프 데이터 처리
          const graph = event.graph
          if (graph?.Nodes || graph?.Relationships) {
            updateGraphData(graph.Nodes || [], graph.Relationships || [])
          }
          
          // 완료/에러
          if (event.type === 'complete') {
            currentStep.value = 'Understanding 완료'
          } else if (event.type === 'error') {
            // 상단 상태바에는 상세 에러(JSON 등)를 노출하지 않고,
            // 간단한 메시지만 표시하고 상세 내용은 로그 패널에서만 보여준다.
            currentStep.value = 'Understanding 에러 (상세 내용은 로그 패널 참고)'
          }
        }
      )
    } catch (error) {
      currentStep.value = 'Understanding 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - Convert (코드 변환)
  // ==========================================================================
  
  /**
   * Convert 실행
   */
  async function runConvert(classNames?: string[]): Promise<void> {
    isProcessing.value = true
    currentStep.value = 'Convert 진행 중...'
    clearConvertMessages()
    
    // 단계 초기화
      frameworkSteps.value = frameworkSteps.value.map(s => ({ ...s, done: false }))
    
    try {
      const payload = classNames 
        ? { ...convertingMeta.value, directory: classNames }
        : convertingMeta.value
        
      await backendApi.convert(payload, sessionStore.getHeaders(), (event) => {
        handleConvertEvent(event, classNames)
      })
    } catch (error) {
      currentStep.value = 'Convert 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * Convert 이벤트 핸들러
   */
  function handleConvertEvent(event: any, classNames?: string[]): void {
          switch (event.type) {
            case 'message':
              addConvertMessage('message', event.content || '')
              break
        
            case 'data':
        if (event.code && event.file_name) {
          updateConvertedFile(event)
        }
        break
        
      case 'status':
        if (event.step !== undefined) {
          updateFrameworkStep(event.step, event.done || false)
        }
        break
        
      case 'complete':
        currentStep.value = 'Convert 완료'
        break
        
      case 'error':
        // 상단 상태바에는 상세 에러(JSON 등)를 노출하지 않고,
        // 간단한 메시지만 표시하고 상세 내용은 로그 패널에서만 보여준다.
        currentStep.value = 'Convert 에러 (상세 내용은 로그 패널 참고)'
        break
    }
  }
  
  /**
   * 변환된 파일 업데이트
   */
  function updateConvertedFile(event: any): void {
                const file: ConvertedFile = {
                  fileName: event.file_name,
                  fileType: event.file_type || 'unknown',
                  code: event.code,
                  directory: event.directory
                }
    
    const existingIndex = convertedFiles.value.findIndex(
      f => f.fileName === event.file_name
    )
                
                if (existingIndex >= 0) {
                  convertedFiles.value[existingIndex] = file
                } else {
                  convertedFiles.value.push(file)
                }
              }
  
  /**
   * 프레임워크 단계 업데이트
   */
  function updateFrameworkStep(step: number, done: boolean): void {
    const stepIndex = frameworkSteps.value.findIndex(s => s.step === step)
                if (stepIndex >= 0) {
      frameworkSteps.value[stepIndex].done = done
    }
  }
  
  // ==========================================================================
  // Actions - 기타
  // ==========================================================================
  
  /**
   * ZIP 다운로드
   */
  async function downloadZip(): Promise<void> {
    try {
      await backendApi.downloadJava(projectName.value, sessionStore.getHeaders())
    } catch (error) {
      console.error('다운로드 실패:', error)
      throw error
    }
  }
  
  /**
   * 모든 데이터 삭제
   */
  async function deleteAllData(): Promise<void> {
    try {
      await backendApi.deleteAll(sessionStore.getHeaders())
      reset()
    } catch (error) {
      console.error('삭제 실패:', error)
      throw error
    }
  }
  
  /**
   * 전체 상태 리셋
   */
  function reset(): void {
    // 메타데이터
    projectName.value = ''
    ddl.value = []
    
    // 파일
    uploadedFiles.value = []
    uploadedDdlFiles.value = []
    
    // 그래프
    clearGraphData()
    
    // 변환 결과
    convertedFiles.value = []
    
    // 프로세스
    isProcessing.value = false
    currentStep.value = ''
    
    // 메시지
    graphMessages.value = []
    convertMessages.value = []
    
    // 단계
    frameworkSteps.value = frameworkSteps.value.map(s => ({ ...s, done: false }))
  }
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    projectName,
    sourceType,
    convertTarget,
    ddl,
    uploadedFiles,
    uploadedDdlFiles,
    graphData,
    convertedFiles,
    isProcessing,
    currentStep,
    graphMessages,
    convertMessages,
    frameworkSteps,
    
    // Computed
    metadata,
    understandingMeta,
    convertingMeta,
    isValidConfig,
    
    // Actions - Setters
    setProjectName,
    setSourceType,
    setConvertTarget,
    setDdl,
    
    // Actions - Messages
    addGraphMessage,
    addConvertMessage,
    clearGraphMessages,
    clearConvertMessages,
    
    // Actions - File
    uploadFiles,
    parseFiles,
    
    // Actions - Understanding/Convert
    runUnderstanding,
    runConvert,
    
    // Actions - Misc
    downloadZip,
    deleteAllData,
    reset
  }
})

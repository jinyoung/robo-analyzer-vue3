/**
 * useResize.ts
 * 패널 리사이즈 로직을 위한 재사용 가능한 composable
 */

import { ref, onUnmounted } from 'vue'

// ============================================================================
// 타입 정의
// ============================================================================

type ResizeDirection = 'horizontal' | 'vertical'

interface ResizeOptions {
  /** 리사이즈 방향 */
  direction: ResizeDirection
  /** 초기값 */
  initialValue: number
  /** 최소값 */
  min: number
  /** 최대값 */
  max: number
  /** 값 계산 방식 (기본: 화면 끝에서부터) */
  fromEnd?: boolean
}

// ============================================================================
// Composable
// ============================================================================

export function useResize(options: ResizeOptions) {
  const { direction, initialValue, min, max, fromEnd = true } = options
  
  // 상태
  const value = ref(initialValue)
  const isResizing = ref(false)
  
  // 리사이즈 시작
  function startResize(e: MouseEvent): void {
    isResizing.value = true
    document.addEventListener('mousemove', onResize)
    document.addEventListener('mouseup', stopResize)
    e.preventDefault()
  }
  
  // 리사이즈 중
  function onResize(e: MouseEvent): void {
    if (!isResizing.value) return
    
    let newValue: number
    
    if (direction === 'horizontal') {
      // 가로 리사이즈 (오른쪽 패널)
      newValue = fromEnd ? window.innerWidth - e.clientX : e.clientX
    } else {
      // 세로 리사이즈 (하단 패널)
      newValue = fromEnd ? window.innerHeight - e.clientY : e.clientY
    }
    
    // 범위 제한
    value.value = Math.max(min, Math.min(max, newValue))
  }
  
  // 리사이즈 종료
  function stopResize(): void {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  }
  
  // 컴포넌트 언마운트 시 이벤트 정리
  onUnmounted(() => {
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
  })
  
  return {
    value,
    isResizing,
    startResize
  }
}


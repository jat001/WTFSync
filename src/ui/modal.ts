import { ref } from 'vue'

/**
 * 全局弹窗类型。需要新增弹窗时，在这里注册一个 key。
 * 例：export type ModalKind = 'watch-paths' | 'some-other'
 */
export type ModalKind = 'watch-paths'

// 模块级单例：任何组件 useModal() 拿到的都是同一份状态
const currentModal = ref<ModalKind | null>(null)

export function useModal() {
  function openModal(kind: ModalKind) {
    currentModal.value = kind
  }
  function closeModal() {
    currentModal.value = null
  }
  return { currentModal, openModal, closeModal }
}

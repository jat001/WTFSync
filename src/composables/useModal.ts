import { ref } from 'vue'

/**
 * Global modal types. Register a new key here when adding a modal.
 * Example: export type ModalKind = 'sync-report' | 'some-other'
 */
export type ModalKind = 'sync-report'

// Module-level singleton: every useModal() call shares the same state.
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

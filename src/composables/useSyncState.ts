import { computed, ref } from 'vue'

export interface Device {
  name: string
  detail: string
  initial: string
  online: boolean
  time: string
}

export interface Transfer {
  name: string
  target: string
  size: string
  progress: number
  speed: string
  status: 'active' | 'queued' | 'done'
}

export interface FolderNode {
  label: string
  icon: string
  defaultExpanded?: boolean
  children?: FolderNode[]
}

// Module-level singletons shared by every page (same pattern as ui/modal.ts).
// Once the backend commands exist, these refs become the single place to hydrate.
const syncing = ref(true)

const devices = ref<Device[]>([
  {
    name: '这台电脑',
    detail: 'ThinkPad X1',
    initial: '本',
    online: true,
    time: '刚刚',
  },
  {
    name: 'MacBook Pro',
    detail: '设计资源 · 在线编辑',
    initial: 'M',
    online: true,
    time: '12 分钟前',
  },
  {
    name: 'NAS · 客厅',
    detail: '照片备份',
    initial: 'N',
    online: false,
    time: '3 天前',
  },
])

const transfers = ref<Transfer[]>([
  {
    name: '设计资源 / 图标库.fig',
    target: 'MacBook Pro',
    size: '184.2 MB',
    progress: 72,
    speed: '3.2 MB/s',
    status: 'active',
  },
  {
    name: '照片备份 / 2026-08',
    target: 'NAS · 客厅',
    size: '2.1 GB',
    progress: 46,
    speed: '5.8 MB/s',
    status: 'active',
  },
  {
    name: '项目文档 / 需求评审.pdf',
    target: '这台电脑',
    size: '12.6 MB',
    progress: 100,
    speed: '',
    status: 'done',
  },
  {
    name: '音乐 / 歌单导出.m3u8',
    target: 'iPhone 15',
    size: '8.4 KB',
    progress: 0,
    speed: '排队中',
    status: 'queued',
  },
])

const folders = ref<FolderNode[]>([
  {
    label: '项目文档',
    icon: 'i-lucide-folder',
    defaultExpanded: true,
    children: [
      { label: '需求评审.pdf', icon: 'i-lucide-file-text' },
      { label: 'WTFSync 设计稿', icon: 'i-lucide-file-text' },
    ],
  },
  {
    label: '设计资源',
    icon: 'i-lucide-folder',
    defaultExpanded: true,
    children: [{ label: '图标库.fig', icon: 'i-lucide-file-text' }],
  },
  {
    label: '照片备份',
    icon: 'i-lucide-folder',
    children: [],
  },
])

/** Sync storage usage in GB. */
const storage = { used: 6.8, total: 10 }

export function useSyncState() {
  const onlineDevices = computed(() =>
    devices.value.filter((device) => device.online),
  )
  const activeTransfers = computed(() =>
    transfers.value.filter((transfer) => transfer.status === 'active'),
  )
  const storagePercent = computed(() =>
    Math.round((storage.used / storage.total) * 100),
  )

  function toggleSync() {
    syncing.value = !syncing.value
  }

  function addFolder(label: string) {
    folders.value.push({
      label,
      icon: 'i-lucide-folder',
      defaultExpanded: true,
      children: [],
    })
  }

  return {
    syncing,
    toggleSync,
    devices,
    onlineDevices,
    transfers,
    activeTransfers,
    folders,
    addFolder,
    storage,
    storagePercent,
  }
}

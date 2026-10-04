import { open } from '@tauri-apps/plugin-dialog'

import { errorMessage } from '../core/errors'
import { isTauri } from '../lib/tauri'
import { useSync } from './useSync'

/** Let the user pick the WoW directory and report the result as a toast. */
export function useGameDirectoryPicker() {
  const toast = useToast()
  const { chooseGameDirectory } = useSync()

  async function pickGameDirectory(): Promise<void> {
    if (!isTauri) {
      toast.add({
        title: '浏览器预览中不可用',
        description: '请在桌面应用中选择目录',
        icon: 'i-lucide-info',
        color: 'warning',
      })
      return
    }
    const selected = await open({
      directory: true,
      title: '选择魔兽世界安装目录或游戏版本目录',
    })
    if (typeof selected !== 'string') return
    try {
      await chooseGameDirectory(selected)
      toast.add({
        title: '已设置游戏目录',
        description: selected,
        icon: 'i-lucide-circle-check',
        color: 'success',
      })
    } catch (error) {
      toast.add({
        title: '无法使用该目录',
        description: errorMessage(error),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
    }
  }

  return { pickGameDirectory }
}

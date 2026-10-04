import type { AccountFailureReason } from '../core/accounts'
import { SyncError, type SyncReport, type SyncTrigger } from '../core/engine'
import { errorMessage } from '../core/errors'
import type { AddonProfile } from '../core/profile'

export const triggerLabels: Record<SyncTrigger, string> = {
  manual: '手动同步',
  watch: '自动同步',
  startup: '启动同步',
}

export const failureLabels: Record<AccountFailureReason, string> = {
  'invalid-name': '账号目录名包含无法使用的字符',
  'missing-source': '没有插件存档，请先用该账号登录一次游戏',
  'incomplete-source': '存档不完整，游戏可能正在写入',
  'invalid-source': '存档格式无法识别',
  'read-error': '无法读取存档',
  'invalid-data': '存档中没有可用的数据',
}

/** User-facing description of an error that stopped a whole sync. */
export function describeSyncError(error: unknown, profile: AddonProfile): string {
  if (error instanceof SyncError) {
    switch (error.code) {
      case 'game-dir-missing':
        return '游戏目录不存在'
      case 'required-addon-missing':
        return `未安装 ${profile.requiredAddon} 插件`
      case 'client-version-unknown':
        return '无法确定游戏客户端版本，请确认该版本已通过战网安装'
      case 'invalid-output':
        return '生成的文件无效，已停止写入'
    }
  }
  return errorMessage(error)
}

/** One-line summary of a finished sync. */
export function summarizeReport(report: SyncReport): string {
  const parts = [`已同步 ${report.synced.length} 个账号`]
  const changed = report.written.length + report.removed.length
  parts.push(changed > 0 ? `更新 ${changed} 个文件` : '文件均为最新')
  if (report.failed.length > 0) parts.push(`${report.failed.length} 个账号失败`)
  return parts.join('，')
}

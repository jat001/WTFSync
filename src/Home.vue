<template>
  <div class="mx-auto flex min-h-full max-w-5xl flex-col px-5 py-4 sm:px-7">
    <header class="flex h-8 shrink-0 items-center justify-between">
      <RouterLink class="flex items-center gap-2 text-sm font-semibold" to="/">
        <span
          class="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-white"
          >W</span
        >
        WTFSync
      </RouterLink>
      <div class="flex items-center gap-1">
        <span
          class="mr-2 hidden items-center gap-1.5 text-xs text-gray-500 sm:flex"
          ><span class="size-1.5 rounded-full bg-green-500" />已连接</span
        >
        <UButton
          to="/setting"
          icon="i-lucide-settings-2"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="打开设置"
        />
        <UButton
          to="/about"
          icon="i-lucide-circle-help"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="打开关于"
        />
      </div>
    </header>

    <section class="mt-6 flex items-end justify-between">
      <div>
        <p class="mb-1 text-xs font-medium text-gray-500">SYNC DESK</p>
        <h1 class="text-2xl font-semibold tracking-tight">同步工作台</h1>
      </div>
      <time class="text-xs text-gray-400">上次同步 2 分钟前</time>
    </section>

    <section class="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <UCard class="relative overflow-hidden bg-primary text-white ring-0">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs text-white/70">当前状态</p>
            <h2 class="mt-2 text-2xl font-semibold">全部已同步</h2>
            <p class="mt-1 text-sm text-white/70">
              你的文件已在所有设备保持最新
            </p>
          </div>
          <UIcon name="i-lucide-cloud-check" class="size-7 text-primary-200" />
        </div>
        <div class="mt-7">
          <div class="mb-2 flex justify-between text-xs text-white/70">
            <span>同步空间</span><span>6.8 GB / 10 GB</span>
          </div>
          <UProgress :model-value="68" color="neutral" class="**:bg-white/80" />
        </div>
        <div class="mt-6 flex gap-2">
          <UButton
            color="neutral"
            variant="solid"
            icon="i-lucide-refresh-cw"
            size="sm"
            >立即同步</UButton
          ><UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-folder-open"
            size="sm"
            class="text-white hover:bg-white/10"
            >打开文件夹</UButton
          >
        </div>
      </UCard>
      <UCard
        ><div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">同步概览</h2>
          <UIcon name="i-lucide-activity" class="size-4 text-gray-400" />
        </div>
        <dl class="mt-5 grid grid-cols-2 gap-y-5">
          <div>
            <dt class="text-xs text-gray-500">已同步文件</dt>
            <dd class="mt-1 text-lg font-semibold">1,284</dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">同步设备</dt>
            <dd class="mt-1 text-lg font-semibold">3 台</dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">本次变更</dt>
            <dd class="mt-1 text-lg font-semibold text-primary">12 个</dd>
          </div>
          <div>
            <dt class="text-xs text-gray-500">同步耗时</dt>
            <dd class="mt-1 text-lg font-semibold">00:04</dd>
          </div>
        </dl></UCard
      >
    </section>

    <section class="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <UCard
        ><div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold">最近活动</h2>
            <p class="mt-1 text-xs text-gray-500">同步任务的最新变化</p>
          </div>
          <UButton
            icon="i-lucide-more-horizontal"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="更多活动"
          />
        </div>
        <div class="mt-3 divide-y divide-gray-100">
          <div class="flex items-center gap-3 py-2.5 first:pt-0">
            <UIcon name="i-lucide-file-check-2" class="size-4 text-green-600" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium">项目文档</p>
              <p class="text-[11px] text-gray-500">已同步 24 个文件</p>
            </div>
            <time class="text-[11px] text-gray-400">刚刚</time>
          </div>
          <div class="flex items-center gap-3 py-2.5">
            <UIcon name="i-lucide-image" class="size-4 text-blue-500" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium">设计资源</p>
              <p class="text-[11px] text-gray-500">新增 12 个文件</p>
            </div>
            <time class="text-[11px] text-gray-400">12 分钟前</time>
          </div>
          <div class="flex items-center gap-3 py-2.5 last:pb-0">
            <UIcon name="i-lucide-check" class="size-4 text-gray-400" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium">照片备份</p>
              <p class="text-[11px] text-gray-500">同步任务已完成</p>
            </div>
            <time class="text-[11px] text-gray-400">昨天</time>
          </div>
        </div></UCard
      >
      <UCard
        ><div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">同步目录</h2>
          <UBadge color="success" variant="soft" size="sm">运行中</UBadge>
        </div>
        <div class="mt-4 space-y-3">
          <div class="flex items-center gap-3">
            <span
              class="flex size-7 items-center justify-center rounded bg-amber-50 text-amber-600"
              ><UIcon name="i-lucide-folder" class="size-4" /></span
            ><span class="flex-1 truncate text-xs">项目文档</span
            ><span class="text-[11px] text-gray-400">2.4 GB</span>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="flex size-7 items-center justify-center rounded bg-blue-50 text-blue-600"
              ><UIcon name="i-lucide-folder" class="size-4" /></span
            ><span class="flex-1 truncate text-xs">设计资源</span
            ><span class="text-[11px] text-gray-400">1.8 GB</span>
          </div>
          <div class="flex items-center gap-3">
            <span
              class="flex size-7 items-center justify-center rounded bg-purple-50 text-purple-600"
              ><UIcon name="i-lucide-folder" class="size-4" /></span
            ><span class="flex-1 truncate text-xs">照片备份</span
            ><span class="text-[11px] text-gray-400">2.6 GB</span>
          </div>
        </div></UCard
      >
    </section>
  </div>
</template>

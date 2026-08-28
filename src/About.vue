<template>
  <div class="mx-auto flex min-h-full max-w-3xl flex-col px-5 py-4 sm:px-7">
    <header class="flex h-8 shrink-0 items-center gap-3">
      <UButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="返回首页"
      /><span class="text-sm font-semibold">关于 WTFSync</span>
    </header>
    <section class="mt-8 flex items-center gap-4">
      <div
        class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-sm"
      >
        W
      </div>
      <div>
        <p class="text-xs font-medium text-gray-500">WTFSYNC DESKTOP</p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">
          简单，可靠，始终同步。
        </h1>
        <p class="mt-1 text-sm text-gray-500">跨设备文件同步工具</p>
      </div>
    </section>
    <div class="mt-7 grid gap-4 sm:grid-cols-2">
      <UCard
        ><div class="flex items-center gap-3">
          <UIcon name="i-lucide-shield-check" class="size-5 text-primary" />
          <div>
            <h2 class="text-sm font-semibold">本地优先</h2>
            <p class="mt-1 text-xs text-gray-500">数据由你的设备掌控</p>
          </div>
        </div></UCard
      ><UCard
        ><div class="flex items-center gap-3">
          <UIcon name="i-lucide-zap" class="size-5 text-amber-500" />
          <div>
            <h2 class="text-sm font-semibold">轻量运行</h2>
            <p class="mt-1 text-xs text-gray-500">安静地在后台工作</p>
          </div>
        </div></UCard
      >
    </div>
    <UCard class="mt-4"
      ><div class="flex items-center justify-between">
        <div>
          <p class="text-xs font-medium text-gray-500">应用信息</p>
          <h2 class="mt-1 text-sm font-semibold">WTFSync</h2>
        </div>
        <UBadge variant="soft">版本 0.1.0</UBadge>
      </div>
      <USeparator class="my-4" />
      <p class="text-sm leading-6 text-gray-500">
        让重要的文件在需要的地方保持最新。WTFSync 使用 Tauri
        构建，为桌面环境提供快速、克制的同步体验。
      </p></UCard
    >
    <div class="mt-auto flex justify-end pt-5">
      <UButton to="/" color="neutral" variant="soft" icon="i-lucide-arrow-left"
        >返回首页</UButton
      >
    </div>
  </div>
</template>

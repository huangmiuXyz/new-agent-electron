<script setup lang="ts">
import { useSettingsStore } from '@renderer/stores/settings'

const settingsStore = useSettingsStore()

const formState = ref({
  openAtLogin: settingsStore.system.openAtLogin
})
const openAtLoginSupported = ref(true)
const syncingFromMain = ref(false)

const [SystemForm, systemFormActions] = useForm({
  showHeader: true,
  fields: [
    {
      name: 'openAtLogin',
      type: 'boolean',
      label: '开机启动',
      hint: '登录系统后自动启动 agent-qi'
    }
  ],
  initialData: formState.value,
  onChange: async (field, value) => {
    if (syncingFromMain.value) return

    if (field === 'openAtLogin') {
      await updateOpenAtLogin(Boolean(value))
    }
  }
})

const applySnapshot = (snapshot: {
  openAtLogin: boolean
  openAtLoginSupported: boolean
}) => {
  formState.value = {
    openAtLogin: snapshot.openAtLogin
  }
  settingsStore.updateSystemSettings(formState.value)
  openAtLoginSupported.value = snapshot.openAtLoginSupported

  syncingFromMain.value = true
  systemFormActions.setFieldsValue(formState.value)
  queueMicrotask(() => {
    syncingFromMain.value = false
  })
}

const syncFromMain = async () => {
  try {
    const current = await window.api.system.getSettings()
    applySnapshot(current)
  } catch (error) {
    messageApi.error(`读取系统设置失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const updateOpenAtLogin = async (next: boolean) => {
  if (!openAtLoginSupported.value) {
    applySnapshot({
      openAtLogin: false,
      openAtLoginSupported: false
    })
    messageApi.error('当前平台暂不支持开机启动')
    return
  }

  const previous = { ...formState.value }

  try {
    const current = await window.api.system.setOpenAtLogin(next)
    applySnapshot(current)
    messageApi.success(current.openAtLogin ? '已开启开机启动' : '已关闭开机启动')
  } catch (error) {
    applySnapshot({
      openAtLogin: previous.openAtLogin,
      openAtLoginSupported: openAtLoginSupported.value
    })
    messageApi.error(`更新开机启动失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

onMounted(() => {
  void syncFromMain()
})
</script>

<template>
  <FormContainer header-title="系统设置">
    <template #content>
      <SystemForm />
      <div v-if="!openAtLoginSupported" class="system-note">
        当前平台暂不支持开机启动，已自动忽略该选项。
      </div>
    </template>
  </FormContainer>
</template>

<style scoped>
.system-note {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>

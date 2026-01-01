<script setup lang="ts">
const settingsStore = useSettingsStore()

const [DisplayForm] = useForm({
  showHeader: true,
  fields: [
    {
      name: 'darkMode',
      type: 'boolean',
      label: '深色模式'
    },
    {
      name: 'fontSize',
      type: 'slider',
      label: '字体大小',
      min: 10,
      max: 18,
      unit: 'px'
    }
  ],
  initialData: settingsStore.display,
  onChange: (_field, _value, data) => {
    settingsStore.updateDisplaySettings(data)
  }
})

</script>

<template>
  <FormContainer header-title="显示设置">
    <template #content>
      <DisplayForm />
    </template>
  </FormContainer>
</template>

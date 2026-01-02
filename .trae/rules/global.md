1.大部分函数和组件已经被全局注册，因此不要在每个组件中重复引入，以下是全局注册的函数和组件的配置：
AutoImport({
  imports: ['vue', 'vue-router', 'pinia'],
  dts: 'src/auto-imports.d.ts',
  vueTemplate: true,
  dirs: ['src/composables', 'src/utils', 'src/stores', 'src/services']
}),
Components({
  dirs: ['src/components', 'src/pages'],
  directoryAsNamespace: true,
  dts: 'src/components.d.ts'
})

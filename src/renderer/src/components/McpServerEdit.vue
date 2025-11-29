<script setup lang="ts">
import { ref, watch } from 'vue'
import Input from './Input.vue'
import Button from './Button.vue'
import { useIcon } from '@renderer/composables/useIcon'

interface McpServer {
    id: string
    name: string
    command: string
    args: string[]
    env: Record<string, string>
    active: boolean
}

const props = defineProps<{
    modelValue: McpServer
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: McpServer): void
}>()

const form = ref<McpServer>({ ...props.modelValue })

watch(() => props.modelValue, (newVal) => {
    form.value = { ...newVal }
}, { deep: true })

watch(form, (newVal) => {
    emit('update:modelValue', newVal)
}, { deep: true })

const { Plus, Trash } = useIcon(['Plus', 'Trash'])

// Args handling
const addArg = () => {
    form.value.args.push('')
}
const removeArg = (index: number) => {
    form.value.args.splice(index, 1)
}

// Env handling
const envList = ref<{ key: string; value: string }[]>([])

watch(() => props.modelValue.env, (newEnv) => {
    envList.value = Object.entries(newEnv || {}).map(([key, value]) => ({ key, value }))
}, { immediate: true })

const updateEnv = () => {
    const newEnv: Record<string, string> = {}
    envList.value.forEach(item => {
        if (item.key) newEnv[item.key] = item.value
    })
    form.value.env = newEnv
}

const addEnv = () => {
    envList.value.push({ key: '', value: '' })
}

const removeEnv = (index: number) => {
    envList.value.splice(index, 1)
    updateEnv()
}

const handleEnvChange = () => {
    updateEnv()
}
</script>

<template>
    <div class="mcp-edit-form">
        <div class="form-group">
            <label class="form-label">Server Name</label>
            <Input v-model="form.name" placeholder="e.g. My Server" />
        </div>

        <div class="form-group">
            <label class="form-label">Command</label>
            <Input v-model="form.command" placeholder="e.g. npx or python" />
        </div>

        <div class="form-group">
            <div class="label-row">
                <label class="form-label">Arguments</label>
                <Button size="sm" variant="text" @click="addArg">
                    <template #icon>
                        <Plus />
                    </template>
                </Button>
            </div>
            <div class="args-list">
                <div v-for="(_, index) in form.args" :key="index" class="arg-item">
                    <Input v-model="form.args[index]" placeholder="Argument" />
                    <Button size="sm" variant="text" class="delete-btn" @click="removeArg(index)">
                        <template #icon>
                            <Trash />
                        </template>
                    </Button>
                </div>
                <div v-if="form.args.length === 0" class="empty-tip">No arguments</div>
            </div>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label class="form-label">Environment Variables</label>
                <Button size="sm" variant="text" @click="addEnv">
                    <template #icon>
                        <Plus />
                    </template>
                </Button>
            </div>
            <div class="env-list">
                <div v-for="(item, index) in envList" :key="index" class="env-item">
                    <Input v-model="item.key" placeholder="Key" @input="handleEnvChange" />
                    <Input v-model="item.value" placeholder="Value" @input="handleEnvChange" />
                    <Button size="sm" variant="text" class="delete-btn" @click="removeEnv(index)">
                        <template #icon>
                            <Trash />
                        </template>
                    </Button>
                </div>
                <div v-if="envList.length === 0" class="empty-tip">No environment variables</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mcp-edit-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
}

.label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.args-list,
.env-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.arg-item,
.env-item {
    display: flex;
    gap: 8px;
    align-items: center;
}

.env-item .input-wrapper {
    flex: 1;
}

.delete-btn {
    color: var(--text-tertiary);
}

.delete-btn:hover {
    color: #ff4757;
}

.empty-tip {
    font-size: 12px;
    color: var(--text-tertiary);
    font-style: italic;
    padding: 4px 0;
}
</style>

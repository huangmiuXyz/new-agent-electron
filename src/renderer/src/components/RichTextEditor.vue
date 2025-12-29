<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import RichTextEditorToolbar from './RichTextEditor/toolbar.vue'
import { common, createLowlight } from 'lowlight'
import 'highlight.js/styles/atom-one-dark.css'

// 创建 lowlight 实例
const lowlight = createLowlight(common)

interface Props {
    modelValue: string
    placeholder?: string
    editable?: boolean
    minHeight?: string
    maxHeight?: string
}

interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'change', value: string): void
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: '输入内容...',
    editable: true,
    minHeight: '200px',
    maxHeight: 'auto'
})

const emit = defineEmits<Emits>()

const editor = useEditor({
    content: props.modelValue,
    editable: props.editable,
    extensions: [
        StarterKit.configure({
            heading: {
                levels: [1, 2, 3]
            },
            codeBlock: false,
            horizontalRule: false,
            listItem: {
                HTMLAttributes: {
                    class: 'list-item'
                }
            }
        }),
        Placeholder.configure({
            placeholder: props.placeholder
        }),
        Image.configure({
            inline: true,
            allowBase64: true
        }),
        TextAlign.configure({
            types: ['heading', 'paragraph']
        }),
        TextStyle,
        Color.configure({
            types: [TextStyle.name]
        }),
        Link.configure({
            openOnClick: false
        }),
        Underline,
        CodeBlockLowlight.configure({
            lowlight,
            defaultLanguage: 'plaintext',
            HTMLAttributes: {
                class: 'code-block'
            }
        }),
        HorizontalRule,
        TaskList.configure({
            HTMLAttributes: {
                class: 'task-list'
            }
        }),
        TaskItem.configure({
            HTMLAttributes: {
                class: 'task-item'
            },
            nested: true
        }),
        Table.configure({
            resizable: true
        }),
        TableRow,
        TableHeader,
        TableCell
    ],
    onUpdate: ({ editor }) => {
        const html = editor.getHTML()
        emit('update:modelValue', html)
        emit('change', html)
    },
    editorProps: {
        attributes: {
            class: 'rich-text-editor-content'
        }
    }
})

// 监听外部值变化
watch(() => props.modelValue, (value) => {
    if (editor.value && editor.value.getHTML() !== value) {
        editor.value.commands.setContent(value)
    }
})

// 监听编辑器属性变化
watch(() => props.editable, (value) => {
    if (editor.value) {
        editor.value.setEditable(value)
    }
})

// 监听 placeholder 变化
watch(() => props.placeholder, (value) => {
    if (editor.value) {
        const placeholderExtension = editor.value.extensionManager.extensions.find(
            ext => ext.name === 'placeholder'
        )
        if (placeholderExtension) {
            placeholderExtension.options.placeholder = value
        }
    }
})

onBeforeUnmount(() => {
    if (editor.value) {
        editor.value.destroy()
    }
})

// 暴露编辑器实例供外部使用
defineExpose({
    editor
})
</script>

<template>
    <div class="rich-text-editor">
        <RichTextEditorToolbar v-if="editable && editor" :editor="editor" />
        <EditorContent :editor="editor" />
    </div>
</template>

<style>
.rich-text-editor {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
}

.rich-text-editor-content {
    flex: 1;
    padding: 16px;
    outline: none !important;
    overflow-y: auto;
    min-height: 0;
    overflow-x: hidden;
}

.ProseMirror {
    outline: none !important;
    min-height: 500px;
}

.ProseMirror-focused {
    outline: none !important;
}

.ProseMirror p.is-editor-empty:first-child::before {
    color: var(--text-tertiary);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
}
</style>

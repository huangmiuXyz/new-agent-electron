<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { FontSize, TextStyle } from '@tiptap/extension-text-style'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import RichTextEditorToolbar from './toolbar.vue'
import { common, createLowlight } from 'lowlight'
import { buildNoteHashlineReference, normalizeHashlineText } from '@renderer/utils/noteHashlines'
import 'highlight.js/styles/atom-one-dark.css'

const lowlight = createLowlight(common)
const { Sparkles, FormatQuote } = useIcon(['Sparkles', 'FormatQuote'])
const { showContextMenu } = useContextMenu()
const chatsStore = useChatsStores()
const settingsStore = useSettingsStore()

const ChineseParagraphIndent = Extension.create({
    name: 'chineseParagraphIndent',
    addKeyboardShortcuts() {
        return {
            Enter: ({ editor }) => {
                const { $from } = editor.state.selection
                if ($from.parent.type.name !== 'paragraph') {
                    return false
                }
                if (!$from.parent.textContent.startsWith('　　')) {
                    return false
                }
                return editor.chain()
                    .splitBlock()
                    .insertContent('　　')
                    .run()
            }
        }
    }
})

interface Props {
    modelValue: string
    placeholder?: string
    editable?: boolean
    minHeight?: string
    maxHeight?: string
    referenceTitle?: string
    referenceId?: string
}

interface Emits {
    (e: 'update:modelValue', value: string): void
    (e: 'change', value: string): void
}

type NoteReferenceSelection = {
    from: number
    to: number
}

const props = withDefaults(defineProps<Props>(), {
    placeholder: '输入内容...',
    editable: true,
    minHeight: '200px',
    maxHeight: 'auto'
})

const emit = defineEmits<Emits>()

const normalizeBlockText = (text: string) =>
    text
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t\u3000]+/g, ' ')
        .trim()

const normalizeNovelText = (text: string) =>
    normalizeBlockText(text)
        .replace(/\s+([，。！？；：、）】》」』”’])/g, '$1')
        .replace(/([（【《「『“‘])\s+/g, '$1')
        .replace(/\.{6}/g, '……')
        .replace(/\.{3}/g, '……')

const isNovelHeading = (text: string) => {
    if (text.length > 60) return false

    return (
        /^第\s*[0-9０-９零〇一二三四五六七八九十百千万]+\s*[章节卷回部集]/.test(text) ||
        /^(楔子|序章|序幕|引子|尾声|后记|番外|前言)(\s*[:：]?.*)?$/.test(text)
    )
}

const extractTextWithBreaks = (element: Element) => {
    const parts: string[] = []

    const visit = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent || '')
            return
        }

        if (node instanceof HTMLBRElement) {
            parts.push('\n')
            return
        }

        node.childNodes.forEach(visit)
    }

    visit(element)
    return parts.join('')
}

const findNearestFontSize = (node: Node, boundary: Element) => {
    let element = node.parentElement

    while (element) {
        if (element instanceof HTMLElement && element.style.fontSize) {
            return element.style.fontSize
        }

        if (element === boundary) break
        element = element.parentElement
    }

    return ''
}

const getDominantFontSize = (element: Element) => {
    const sizes = new Map<string, number>()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
        const node = walker.currentNode
        const text = normalizeBlockText(node.textContent || '')
        if (!text) continue

        const fontSize = findNearestFontSize(node, element)
        if (!fontSize) continue

        sizes.set(fontSize, (sizes.get(fontSize) || 0) + text.length)
    }

    let dominantFontSize = ''
    let dominantWeight = 0

    sizes.forEach((weight, fontSize) => {
        if (weight > dominantWeight) {
            dominantFontSize = fontSize
            dominantWeight = weight
        }
    })

    return dominantFontSize
}

const normalizeTextNodes = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text)
    }

    textNodes.forEach((node) => {
        node.nodeValue = node.nodeValue?.replace(/\u00a0/g, ' ').replace(/[ \t\u3000]{2,}/g, ' ') || ''
    })
}

const setTextWithFontSize = (element: HTMLElement, text: string, fontSize?: string) => {
    if (!fontSize) {
        element.textContent = text
        return
    }

    const span = document.createElement('span')
    span.style.fontSize = fontSize
    span.textContent = text
    element.appendChild(span)
}

const createTextElement = (tagName: string, text: string) => {
    const element = document.createElement(tagName)
    element.textContent = normalizeNovelText(text)
    return element
}

const createNovelParagraph = (text: string, fontSize?: string) => {
    const paragraph = document.createElement('p')
    setTextWithFontSize(paragraph, `　　${normalizeNovelText(text)}`, fontSize)
    return paragraph
}

const cloneFormattedElement = (element: Element) => {
    const clone = element.cloneNode(true) as HTMLElement
    normalizeTextNodes(clone)

    clone.querySelectorAll('li').forEach((listItem) => {
        if (!normalizeBlockText(listItem.textContent || '') && !listItem.querySelector('img, table, hr')) {
            listItem.remove()
        }
    })

    return clone
}

const formatEditorHtml = (html: string) => {
    const source = document.createElement('div')
    const result = document.createElement('div')
    source.innerHTML = html
    const bodyFontSize = getDominantFontSize(source)

    const children = Array.from(source.children)
    children.forEach((child) => {
        const tagName = child.tagName.toLowerCase()
        const hasRichContent = child.querySelector('img, table, hr, pre, code-block')
        const textLines = extractTextWithBreaks(child)
            .split('\n')
            .map(normalizeNovelText)
            .filter(Boolean)

        if (!textLines.length) {
            if (hasRichContent) result.appendChild(cloneFormattedElement(child))
            return
        }

        if (hasRichContent || ['ul', 'ol', 'blockquote', 'pre'].includes(tagName)) {
            result.appendChild(cloneFormattedElement(child))
            return
        }

        textLines.forEach((text) => {
            result.appendChild(isNovelHeading(text) ? createTextElement('h2', text) : createNovelParagraph(text, bodyFontSize))
        })
    })

    return result.innerHTML || '<p></p>'
}

const formatCurrentContent = () => {
    if (!editor.value) return

    const formattedHtml = formatEditorHtml(editor.value.getHTML())
    editor.value.commands.setContent(formattedHtml)
    emit('update:modelValue', formattedHtml)
    emit('change', formattedHtml)
    messageApi.success('已完成一键排版')
}

const buildNoteReference = (selection?: NoteReferenceSelection) => {
    if (!editor.value || !selection) return ''

    const { from, to } = selection
    const documentText = normalizeHashlineText(
        editor.value.state.doc.textBetween(0, editor.value.state.doc.content.size, '\n')
    )

    if (!documentText.trim()) return ''

    const selectionStartOffset = normalizeHashlineText(
        editor.value.state.doc.textBetween(0, from, '\n')
    ).length
    const selectionEndOffset = normalizeHashlineText(
        editor.value.state.doc.textBetween(0, to, '\n')
    ).length

    return buildNoteHashlineReference({
        text: documentText,
        selectionStartOffset,
        selectionEndOffset,
        title: props.referenceTitle || '当前笔记',
        referenceId: props.referenceId
    })
}

const copyNoteReference = (selection?: NoteReferenceSelection) => {
    const reference = buildNoteReference(selection)
    if (!reference) {
        messageApi.warning('当前行没有可引用内容')
        return
    }

    let chatId = chatsStore.currentChat?.id
    if (!chatId) {
        chatId = chatsStore.createChat()
    }

    chatsStore.appendChatDraft(reference, chatId)

    if (!isMobile.value) {
        settingsStore.display.assistantSidebarTab = 'chat'
        settingsStore.display.speechSidebarCollapsed = false
        if (settingsStore.display.speechSidebarWidth < 380) {
            settingsStore.display.speechSidebarWidth = 420
        }
    }

    messageApi.success('已引入到 AI 聊天输入框')
}

const handleEditorContextMenu = (event: MouseEvent) => {
    if (!props.editable || !editor.value) return
    const referenceSelection = {
        from: editor.value.state.selection.from,
        to: editor.value.state.selection.to
    }

    showContextMenu(event, [
        {
            label: '一键小说排版',
            icon: Sparkles,
            disabled: !normalizeBlockText(editor.value.getText()),
            onClick: formatCurrentContent
        },
        {
            label: '引用笔记内容',
            icon: FormatQuote,
            disabled: !normalizeBlockText(editor.value.getText()),
            onClick: () => copyNoteReference(referenceSelection)
        }
    ])
}

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
        FontSize,
        Color.configure({
            types: [TextStyle.name]
        }),
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
        TableCell,
        ChineseParagraphIndent
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

watch(() => props.modelValue, (value) => {
    if (editor.value && editor.value.getHTML() !== value) {
        editor.value.commands.setContent(value, { emitUpdate: false })
    }
})

watch(() => props.editable, (value) => {
    if (editor.value) {
        editor.value.setEditable(value)
    }
})

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

defineExpose({
    editor
})
</script>

<template>
    <div class="rich-text-editor">
        <RichTextEditorToolbar v-if="editable && editor" :editor="editor">
            <slot name="toolbar-actions" />
        </RichTextEditorToolbar>
        <EditorContent class="rich-text-editor-scroll" :editor="editor" @contextmenu="handleEditorContextMenu" />
    </div>
</template>

<style>
.rich-text-editor {
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: var(--bg-card);
    overflow: hidden;
}

.rich-text-editor-scroll {
    flex: 1;
    overflow: auto;
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
    font-size: 16px;
}

.ProseMirror h2 {
    margin: 28px 0 18px;
    font-size: 1.35em;
    line-height: 1.6;
    text-align: center;
}

.ProseMirror p {
    line-height: 1.8;
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

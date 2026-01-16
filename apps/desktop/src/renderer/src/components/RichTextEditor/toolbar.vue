<script setup lang="ts">
import { Editor } from '@tiptap/vue-3'
interface Props {
    editor: Editor
}

const props = defineProps<Props>()

const { FormatBold, FormatItalic, FormatUnderlined, FormatStrikethrough, FormatCode, FormatQuote, FormatListBulleted, FormatListNumbered, FormatAlignLeft, FormatAlignCenter, FormatAlignRight, FormatAlignJustify, Undo, Redo, FormatHorizontalRule, CheckCircle } = useIcon([
    'FormatBold',
    'FormatItalic',
    'FormatUnderlined',
    'FormatStrikethrough',
    'FormatCode',
    'FormatQuote',
    'FormatListBulleted',
    'FormatListNumbered',
    'FormatAlignLeft',
    'FormatAlignCenter',
    'FormatAlignRight',
    'FormatAlignJustify',
    'Undo',
    'Redo',
    'Link',
    'LinkOff',
    'FormatClear',
    'FormatImage',
    'FormatHorizontalRule',
    'FormatTable',
    'CheckCircle'
])


const toggleTaskList = () => {
    props.editor.chain().focus().toggleTaskList().run()
}
</script>

<template>
    <div class="rich-text-toolbar" :class="{ 'is-mobile': isMobile }">
        <!-- 历史记录 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :disabled="!editor.can().undo()"
                @click="editor.chain().focus().undo().run()" title="撤销 (Ctrl+Z)">
                <Undo />
            </Button>
            <Button variant="icon" size="sm" :disabled="!editor.can().redo()"
                @click="editor.chain().focus().redo().run()" title="重做 (Ctrl+Y)">
                <Redo />
            </Button>
        </div>

        <Divider vertical />

        <!-- 文本格式 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('bold') }"
                @click="editor.chain().focus().toggleBold().run()" title="加粗 (Ctrl+B)">
                <FormatBold />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('italic') }"
                @click="editor.chain().focus().toggleItalic().run()" title="斜体 (Ctrl+I)">
                <FormatItalic />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('underline') }"
                @click="editor.chain().focus().toggleUnderline().run()" title="下划线 (Ctrl+U)">
                <FormatUnderlined />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('strike') }"
                @click="editor.chain().focus().toggleStrike().run()" title="删除线">
                <FormatStrikethrough />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('code') }"
                @click="editor.chain().focus().toggleCode().run()" title="行内代码">
                <FormatCode />
            </Button>
        </div>

        <Divider vertical />

        <!-- 标题 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
                @click="editor.chain().focus().toggleHeading({ level: 1 }).run()" title="标题 1">
                H1
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
                @click="editor.chain().focus().toggleHeading({ level: 2 }).run()" title="标题 2">
                H2
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
                @click="editor.chain().focus().toggleHeading({ level: 3 }).run()" title="标题 3">
                H3
            </Button>
        </div>

        <Divider vertical />

        <!-- 列表 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('bulletList') }"
                @click="editor.chain().focus().toggleBulletList().run()" title="无序列表">
                <FormatListBulleted />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('orderedList') }"
                @click="editor.chain().focus().toggleOrderedList().run()" title="有序列表">
                <FormatListNumbered />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('taskList') }"
                @click="toggleTaskList" title="任务列表">
                <CheckCircle />
            </Button>
        </div>

        <Divider vertical />

        <!-- 对齐 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive({ textAlign: 'left' }) }"
                @click="editor.chain().focus().setTextAlign('left').run()" title="左对齐">
                <FormatAlignLeft />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive({ textAlign: 'center' }) }"
                @click="editor.chain().focus().setTextAlign('center').run()" title="居中">
                <FormatAlignCenter />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive({ textAlign: 'right' }) }"
                @click="editor.chain().focus().setTextAlign('right').run()" title="右对齐">
                <FormatAlignRight />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive({ textAlign: 'justify' }) }"
                @click="editor.chain().focus().setTextAlign('justify').run()" title="两端对齐">
                <FormatAlignJustify />
            </Button>
        </div>

        <Divider vertical />

        <!-- 其他 -->
        <div class="toolbar-group">
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('blockquote') }"
                @click="editor.chain().focus().toggleBlockquote().run()" title="引用">
                <FormatQuote />
            </Button>
            <Button variant="icon" size="sm" :class="{ 'is-active': editor.isActive('codeBlock') }"
                @click="editor.chain().focus().toggleCodeBlock().run()" title="代码块">
                <FormatCode />
            </Button>
            <Button variant="icon" size="sm" @click="editor.chain().focus().setHorizontalRule().run()" title="水平线">
                <FormatHorizontalRule />
            </Button>
        </div>
    </div>
</template>

<style scoped>
.rich-text-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border-subtle);
    flex-wrap: wrap;
}

.rich-text-toolbar.is-mobile {
    padding: 8px;
    gap: 4px;
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 4px;
}

.toolbar-group :deep(.button) {
    min-width: 32px;
    height: 32px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s;
}

.toolbar-group :deep(.button:hover) {
    background: var(--bg-hover);
}

.toolbar-group :deep(.button.is-active) {
    background: var(--primary);
    color: white;
}

.toolbar-group :deep(.button:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
}

.toolbar-group :deep(.button:disabled:hover) {
    background: transparent;
}

.toolbar-group :deep(.button span) {
    font-size: 12px;
    font-weight: 600;
}

.toolbar-group :deep(.button .icon) {
    font-size: 16px;
}
</style>

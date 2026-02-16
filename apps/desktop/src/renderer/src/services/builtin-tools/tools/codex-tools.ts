import { z } from 'zod'
import ApplyPatchRender from '../components/ApplyPatchRender.vue'
import { applyPatchActions, runParallelExec, validateReadOnlyCommand } from './codex-utils'

export const getCodexBuiltinTools = (): Partial<Tools> => ({
  apply_patch: {
    title: 'apply_patch',
    description:
      '按 hunk 精确编辑文件。patch 必须使用 *** Begin Patch / *** End Patch 包裹，并使用 Add/Update/Delete File 语法。',
    inputSchema: z.object({
      patch: z
        .string()
        .describe(
          '完整 patch 文本。必须包含 "*** Begin Patch" 和 "*** End Patch"，并使用 + / - / 空格前缀表示新增、删除、上下文行。'
        )
    }),
    render: ApplyPatchRender,
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const patchText =
        typeof args === 'string' ? args : typeof params.patch === 'string' ? params.patch : ''

      if (!patchText.trim()) {
        return {
          error: 'patch 不能为空',
          toolResult: {
            content: [{ type: 'text', text: 'apply_patch 失败：patch 不能为空' }]
          }
        }
      }

      const baseDir =
        useAgentStore().selectedAgent!.terminalStartupPath!
      try {
        const summaries = applyPatchActions(patchText, baseDir)
        return {
          summaries,
          toolResult: {
            content: [
              { type: 'text', text: `Patch applied successfully.\n${summaries.join('\n')}` }
            ]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `apply_patch 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  parallel: {
    title: 'parallel',
    description:
      '并行执行多个工具调用。当前仅支持 recipient_name 为 exec_command，且命令必须是只读命令。',
    inputSchema: z.object({
      tool_uses: z
        .array(
          z.object({
            recipient_name: z.string().describe('工具名，当前仅支持 "exec_command"'),
            parameters: z
              .object({
                cmd: z.string().describe('要执行的只读命令'),
                workdir: z.string().optional().describe('命令工作目录'),
                shell: z.string().optional().describe('shell 路径，默认系统 shell'),
                yield_time_ms: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe('命令超时时间（毫秒）'),
                max_output_tokens: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe('输出截断上限（近似 token 数）'),
                login: z.boolean().optional().describe('兼容字段，当前忽略'),
                tty: z.boolean().optional().describe('兼容字段，当前忽略'),
                sandbox_permissions: z.string().optional().describe('兼容字段，当前忽略'),
                justification: z.string().optional().describe('兼容字段，当前忽略'),
                prefix_rule: z.array(z.string()).optional().describe('兼容字段，当前忽略')
              })
              .passthrough()
          })
        )
        .min(1)
        .describe('要并行执行的工具调用列表')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const toolUses = Array.isArray(params.tool_uses) ? params.tool_uses : []

      if (toolUses.length === 0) {
        return {
          error: 'tool_uses 不能为空',
          toolResult: {
            content: [{ type: 'text', text: 'parallel 失败：tool_uses 不能为空' }]
          }
        }
      }

      const results = await Promise.all(
        toolUses.map(async (toolUse: any, index: number) => {
          const recipientName =
            typeof toolUse?.recipient_name === 'string' ? toolUse.recipient_name : ''
          const rawParams = (toolUse?.parameters || {}) as Record<string, any>
          const cmd = typeof rawParams.cmd === 'string' ? rawParams.cmd : ''

          if (recipientName !== 'exec_command') {
            return {
              index,
              recipient_name: recipientName || '<empty>',
              ok: false,
              error: `仅支持 recipient_name=functions.exec_command，收到: ${recipientName || '<empty>'}`
            }
          }

          const validation = validateReadOnlyCommand(cmd)
          if (!validation.ok) {
            return {
              index,
              recipient_name: recipientName,
              ok: false,
              error: validation.reason
            }
          }

          const output = await runParallelExec({
            cmd,
            workdir: typeof rawParams.workdir === 'string' ? rawParams.workdir : undefined,
            shell: typeof rawParams.shell === 'string' ? rawParams.shell : undefined,
            yield_time_ms:
              typeof rawParams.yield_time_ms === 'number' ? rawParams.yield_time_ms : undefined,
            max_output_tokens:
              typeof rawParams.max_output_tokens === 'number'
                ? rawParams.max_output_tokens
                : undefined
          })

          return {
            index,
            recipient_name: recipientName,
            ok: output.ok,
            error: output.error,
            output: {
              exit_code: output.exitCode,
              stdout: output.stdout,
              stderr: output.stderr
            }
          }
        })
      )

      const successCount = results.filter((item) => item.ok).length
      const summary = results
        .map((item) => {
          if (!item.ok) {
            return `[${item.index}] ${item.recipient_name} FAILED\n${item.error}`
          }
          const stdout = item.output?.stdout || '<empty>'
          const stderr = item.output?.stderr ? `\nstderr:\n${item.output.stderr}` : ''
          return `[${item.index}] ${item.recipient_name} exit=${item.output?.exit_code}\nstdout:\n${stdout}${stderr}`
        })
        .join('\n\n')

      return {
        results,
        toolResult: {
          content: [
            {
              type: 'text',
              text: `parallel completed: ${successCount}/${results.length} succeeded.\n\n${summary}`
            }
          ]
        }
      }
    }
  }
})

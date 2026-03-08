import { z } from 'zod'

const toToolText = (lines: Array<string | number | boolean | undefined>) => {
  return lines.filter((line) => line !== undefined).join('\n')
}

const asArgs = (args: unknown): Record<string, unknown> => {
  if (args && typeof args === 'object') {
    return args as Record<string, unknown>
  }

  return {}
}

const withComputerError = async <T>(executor: () => Promise<T>) => {
  try {
    return await executor()
  } catch (error) {
    return {
      toolResult: {
        content: [{ type: 'text', text: `computer tool failed: ${(error as Error).message}` }]
      }
    }
  }
}

const queueScreenshotAsUserMessage = (options: {
  chatId?: string
  dataUrl: string
  origin: { x: number; y: number }
  size: { width: number; height: number }
}) => {
  if (!options.chatId) {
    throw new Error('chatId is required to enqueue screenshot as a user message')
  }

  const chatsStore = useChatsStores()
  chatsStore.addPendingMessage(options.chatId, [
    {
      type: 'text',
      text:
        `这是当前屏幕截图。截图原点为 (${options.origin.x}, ${options.origin.y})，尺寸为 ${options.size.width}x${options.size.height}。` +
        '后续如需点击、移动、拖动或取色，只能基于这张截图使用 screenshot 像素坐标。' +
        '不要使用系统缩放后的逻辑分辨率，不要自行换算 DPI，也不要把屏幕想象成其他尺寸。'
    },
    {
      type: 'file',
      mediaType: 'image/png',
      filename: `computer-screenshot-${Date.now()}.png`,
      url: options.dataUrl
    }
  ])
}

export const getComputerBuiltinTools = (): Partial<Tools> => ({
  computer_capture_screen: {
    title: '截取屏幕',
    description:
      '截取整个屏幕或指定区域，并返回 screenshot 坐标系下的 origin 和 size。后续鼠标操作必须优先使用这张截图的像素坐标。',
    inputSchema: z.object({
      x: z.number().int().optional().describe('可选，截图区域左上角的 X 坐标，默认 0。'),
      y: z.number().int().optional().describe('可选，截图区域左上角的 Y 坐标，默认 0。'),
      width: z.number().int().positive().optional().describe('可选，截图区域宽度，默认整屏宽度。'),
      height: z.number().int().positive().optional().describe('可选，截图区域高度，默认整屏高度。')
    }),
    execute: async (args: unknown, options?: { toolCallId?: string; chatId?: string }) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.captureScreen({
          x: typeof input.x === 'number' ? input.x : undefined,
          y: typeof input.y === 'number' ? input.y : undefined,
          width: typeof input.width === 'number' ? input.width : undefined,
          height: typeof input.height === 'number' ? input.height : undefined
        })

        queueScreenshotAsUserMessage({
          chatId: options?.chatId,
          dataUrl: result.dataUrl,
          origin: { x: result.x, y: result.y },
          size: { width: result.width, height: result.height }
        })

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text:
                  `截图已加入下一轮用户消息：原点 (${result.x}, ${result.y})，尺寸 ${result.width}x${result.height}。` +
                  '后续如需点击，请直接使用这张截图里的像素坐标。'
              }
            ]
          }
        }
      })
  },
  computer_move_mouse: {
    title: '移动鼠标',
    description:
      '将鼠标移动到目标位置。默认使用 screenshot 坐标系，也就是相对于最近一次截图区域左上角的像素坐标。',
    inputSchema: z.object({
      x: z.number().describe('目标 X 像素坐标。'),
      y: z.number().describe('目标 Y 像素坐标。'),
      coordinateSpace: z
        .enum(['screen', 'screenshot'])
        .optional()
        .default('screenshot')
        .describe('坐标系。默认 screenshot。除非已明确拿到绝对屏幕坐标，否则不要使用 screen。'),
      originX: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 X 偏移。'),
      originY: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 Y 偏移。'),
      smooth: z.boolean().optional().default(false).describe('是否平滑移动鼠标。'),
      speed: z.number().optional().describe('可选，平滑移动速度。'),
      delayMs: z.number().optional().describe('可选，鼠标延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const position = await window.api.computer.moveMouse({
          x: Number(input.x),
          y: Number(input.y),
          coordinateSpace: input.coordinateSpace as 'screen' | 'screenshot' | undefined,
          originX: typeof input.originX === 'number' ? input.originX : undefined,
          originY: typeof input.originY === 'number' ? input.originY : undefined,
          smooth: Boolean(input.smooth),
          speed: typeof input.speed === 'number' ? input.speed : undefined,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [{ type: 'text', text: `mouse moved to ${position.position.x}, ${position.position.y}` }]
          }
        }
      })
  },
  computer_mouse_click: {
    title: '点击鼠标',
    description:
      '点击指定鼠标按键。默认使用 screenshot 坐标系，优先传入相对于截图区域的像素坐标，不要自己换算系统缩放坐标。',
    inputSchema: z.object({
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('要点击的鼠标按键。'),
      double: z.boolean().optional().default(false).describe('是否执行双击。'),
      x: z.number().optional().describe('可选，点击前先移动到的目标 X 像素坐标。'),
      y: z.number().optional().describe('可选，点击前先移动到的目标 Y 像素坐标。'),
      coordinateSpace: z
        .enum(['screen', 'screenshot'])
        .optional()
        .default('screenshot')
        .describe('坐标系。默认 screenshot。除非已明确拿到绝对屏幕坐标，否则不要使用 screen。'),
      originX: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 X 偏移。'),
      originY: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 Y 偏移。'),
      smooth: z.boolean().optional().default(false).describe('点击前是否平滑移动鼠标。'),
      speed: z.number().optional().describe('可选，平滑移动速度。'),
      delayMs: z.number().optional().describe('可选，鼠标延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.mouseClick({
          button: input.button as 'left' | 'right' | 'middle' | undefined,
          double: Boolean(input.double),
          x: typeof input.x === 'number' ? input.x : undefined,
          y: typeof input.y === 'number' ? input.y : undefined,
          coordinateSpace: input.coordinateSpace as 'screen' | 'screenshot' | undefined,
          originX: typeof input.originX === 'number' ? input.originX : undefined,
          originY: typeof input.originY === 'number' ? input.originY : undefined,
          smooth: Boolean(input.smooth),
          speed: typeof input.speed === 'number' ? input.speed : undefined,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `clicked ${result.button}${result.double ? ' twice' : ''} at ${result.position.x}, ${result.position.y}`
              }
            ]
          }
        }
      })
  },
  computer_drag_mouse: {
    title: '拖动鼠标',
    description:
      '按住指定鼠标按键，从可选起点拖动到目标坐标。默认使用 screenshot 坐标系，应传入截图里的像素坐标。',
    inputSchema: z.object({
      x: z.number().describe('目标 X 像素坐标。'),
      y: z.number().describe('目标 Y 像素坐标。'),
      startX: z.number().optional().describe('可选，按下鼠标前先移动到的起始 X 像素坐标。'),
      startY: z.number().optional().describe('可选，按下鼠标前先移动到的起始 Y 像素坐标。'),
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('拖动时按住的鼠标按键。'),
      coordinateSpace: z
        .enum(['screen', 'screenshot'])
        .optional()
        .default('screenshot')
        .describe('坐标系。默认 screenshot。除非已明确拿到绝对屏幕坐标，否则不要使用 screen。'),
      originX: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 X 偏移。'),
      originY: z.number().optional().describe('当 coordinateSpace=screenshot 时，传入截图区域左上角的 Y 偏移。'),
      smooth: z.boolean().optional().default(false).describe('拖动开始前是否平滑移动鼠标。'),
      speed: z.number().optional().describe('可选，平滑移动速度。'),
      delayMs: z.number().optional().describe('可选，鼠标延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.dragMouse({
          x: Number(input.x),
          y: Number(input.y),
          startX: typeof input.startX === 'number' ? input.startX : undefined,
          startY: typeof input.startY === 'number' ? input.startY : undefined,
          button: input.button as 'left' | 'right' | 'middle' | undefined,
          coordinateSpace: input.coordinateSpace as 'screen' | 'screenshot' | undefined,
          originX: typeof input.originX === 'number' ? input.originX : undefined,
          originY: typeof input.originY === 'number' ? input.originY : undefined,
          smooth: Boolean(input.smooth),
          speed: typeof input.speed === 'number' ? input.speed : undefined,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [
              { type: 'text', text: `dragged ${result.button} button to ${result.position.x}, ${result.position.y}` }
            ]
          }
        }
      })
  },
  computer_scroll_mouse: {
    title: '滚动鼠标',
    description: '使用鼠标滚轮进行水平和垂直滚动。',
    inputSchema: z.object({
      x: z.number().describe('水平滚动量。'),
      y: z.number().describe('垂直滚动量。'),
      delayMs: z.number().optional().describe('可选，鼠标延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.scrollMouse({
          x: Number(input.x),
          y: Number(input.y),
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `scrolled x=${result.x}, y=${result.y}; mouse now at ${result.position.x}, ${result.position.y}`
              }
            ]
          }
        }
      })
  },
  computer_type_text: {
    title: '输入文本',
    description: '向当前激活的应用中输入文本。',
    inputSchema: z.object({
      text: z.string().describe('要输入的文本。'),
      cpm: z.number().positive().optional().describe('可选，延迟输入时的每分钟字符数。'),
      delayMs: z.number().optional().describe('可选，键盘延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.typeText({
          text: String(input.text ?? ''),
          cpm: typeof input.cpm === 'number' ? input.cpm : undefined,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [{ type: 'text', text: `typed ${result.textLength} characters` }]
          }
        }
      })
  },
  computer_key_tap: {
    title: '按下按键',
    description: '按下一个按键，并可选附带组合键修饰符。',
    inputSchema: z.object({
      key: z.string().describe('robotjs 支持的按键名，例如 enter、tab、a、f5。'),
      modifiers: z.array(z.string()).optional().describe('可选，修饰键，例如 control、alt、shift、command。'),
      delayMs: z.number().optional().describe('可选，键盘延迟，单位毫秒。')
    }),
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = asArgs(args)
        const result = await window.api.computer.keyTap({
          key: String(input.key ?? ''),
          modifiers: Array.isArray(input.modifiers)
            ? input.modifiers.filter((item): item is string => typeof item === 'string')
            : undefined,
          delayMs: typeof input.delayMs === 'number' ? input.delayMs : undefined
        })

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `pressed ${result.key}${result.modifiers.length ? ` with ${result.modifiers.join(', ')}` : ''}`
              }
            ]
          }
        }
      })
  }
})

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

const screenshotCoordinateSchema = {
  coordinateSpace: z
    .enum(['screen', 'screenshot'])
    .optional()
    .default('screenshot')
    .describe('坐标系。默认使用 screenshot。除非已经拿到绝对屏幕坐标，否则不要使用 screen。'),
  originX: z.number().optional().describe('当 coordinateSpace=screenshot 时，截图区域左上角的 X 偏移。'),
  originY: z.number().optional().describe('当 coordinateSpace=screenshot 时，截图区域左上角的 Y 偏移。')
}

export const getComputerBuiltinTools = (): Partial<Tools> => ({
  computer_capture_screen: {
    title: '截取屏幕',
    description: '截取当前屏幕，并返回 screenshot 坐标系下的原点和尺寸。',
    inputSchema: z.object({}),
    execute: async () =>
      withComputerError(async () => {
        const result = await window.api.computer.captureScreen()

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: toToolText([
                  `screenshot origin: (${result.x}, ${result.y})`,
                  `screenshot size: ${result.width}x${result.height}`,
                  `pixel reference grid: minor ${result.annotation?.minorGridPx ?? 'N/A'} px, major ${result.annotation?.majorGridPx ?? 'N/A'} px`,
                  'Use pixel coordinates from the attached screenshot for all follow-up mouse actions.'
                ])
              },
              {
                type: 'image-url',
                url: result.rawDataUrl || result.dataUrl
              }
            ]
          }
        }
      })
  },
  computer_move_mouse: {
    title: '移动鼠标',
    description: '将鼠标移动到目标位置。默认使用最近一次截图中的 screenshot 像素坐标。',
    inputSchema: z.object({
      x: z.number().describe('目标 X 像素坐标。'),
      y: z.number().describe('目标 Y 像素坐标。'),
      ...screenshotCoordinateSchema,
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
    description: '点击指定鼠标按键。优先使用最近一次截图中的 screenshot 像素坐标。',
    inputSchema: z.object({
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('要点击的鼠标按键。'),
      double: z.boolean().optional().default(false).describe('是否执行双击。'),
      x: z.number().optional().describe('可选，点击前先移动到的目标 X 像素坐标。'),
      y: z.number().optional().describe('可选，点击前先移动到的目标 Y 像素坐标。'),
      ...screenshotCoordinateSchema,
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
    description: '按住指定鼠标按键，从可选起点拖动到目标坐标。优先使用最近一次截图中的 screenshot 像素坐标。',
    inputSchema: z.object({
      x: z.number().describe('目标 X 像素坐标。'),
      y: z.number().describe('目标 Y 像素坐标。'),
      startX: z.number().optional().describe('可选，按下鼠标前先移动到的起始 X 像素坐标。'),
      startY: z.number().optional().describe('可选，按下鼠标前先移动到的起始 Y 像素坐标。'),
      button: z.enum(['left', 'right', 'middle']).optional().default('left').describe('拖动时按住的鼠标按键。'),
      ...screenshotCoordinateSchema,
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
  },
})

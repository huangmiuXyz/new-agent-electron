import { z } from 'zod'
import ComputerUseRender from './ComputerUseRender.vue'

const mouseButtonSchema = z.enum(['left', 'right', 'middle'])

const computerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('screenshot')
  }),
  z.object({
    type: z.literal('click'),
    x: z
      .number()
      .describe(
        'X pixel coordinate in the attached screenshot, measured from the image left edge. Do not add screenshot_origin.'
      ),
    y: z
      .number()
      .describe(
        'Y pixel coordinate in the attached screenshot, measured from the image top edge. Do not add screenshot_origin.'
      ),
    button: mouseButtonSchema.optional().default('left')
  }),
  z.object({
    type: z.literal('double_click'),
    x: z
      .number()
      .describe(
        'X pixel coordinate in the attached screenshot, measured from the image left edge. Do not add screenshot_origin.'
      ),
    y: z
      .number()
      .describe(
        'Y pixel coordinate in the attached screenshot, measured from the image top edge. Do not add screenshot_origin.'
      ),
    button: mouseButtonSchema.optional().default('left')
  }),
  z.object({
    startY: z.number().optional(),
    type: z.literal('scroll'),
    x: z
      .number()
      .describe(
        'X pixel coordinate in the attached screenshot, measured from the image left edge. Do not add screenshot_origin.'
      ),
    y: z
      .number()
      .describe(
        'Y pixel coordinate in the attached screenshot, measured from the image top edge. Do not add screenshot_origin.'
      ),
    scrollX: z.number().optional().default(0),
    scrollY: z.number().optional().default(0)
  }),
  z.object({
    type: z.literal('keypress'),
    keys: z.array(z.string().min(1)).min(1)
  }),
  z.object({
    type: z.literal('type'),
    text: z.string().min(1)
  }),
  z.object({
    type: z.literal('wait')
  })
])

const computerInputSchema = z
  .object({
    action: computerActionSchema.optional(),
    actions: z.array(computerActionSchema).min(1).optional()
  })
  .refine((value) => value.action || value.actions?.length, {
    message: 'Provide action or actions'
  })

type ComputerAction = z.infer<typeof computerActionSchema>
type ComputerToolConfig = NonNullable<Agent['builtinToolConfigs']>['computer_use']

const DEFAULT_SCREENSHOT_MAX_SIDE_PX = 1600
const SCREENSHOT_MAX_SIDE_OPTIONS = [800, 1200, 1600, 2400, 3200, 3840] as const

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const toToolText = (lines: Array<string | number | boolean | undefined>) => {
  return lines.filter((line) => line !== undefined).join('\n')
}

const withComputerError = async <T>(executor: () => Promise<T>) => {
  try {
    return await executor()
  } catch (error) {
    return {
      toolResult: {
        content: [{ type: 'text', text: `computer_use failed: ${(error as Error).message}` }]
      }
    }
  }
}

const normalizeActions = (input: z.infer<typeof computerInputSchema>): ComputerAction[] => {
  if (input.actions?.length) return input.actions
  if (input.action) return [input.action]
  throw new Error('No computer action provided')
}

const normalizeScreenshotMaxSidePx = (value: unknown): number => {
  const numericValue = typeof value === 'string' ? Number(value) : value
  if (typeof numericValue !== 'number' || !Number.isFinite(numericValue))
    return DEFAULT_SCREENSHOT_MAX_SIDE_PX
  const rounded = Math.round(numericValue)
  return SCREENSHOT_MAX_SIDE_OPTIONS.includes(rounded as any)
    ? rounded
    : DEFAULT_SCREENSHOT_MAX_SIDE_PX
}

const normalizeKeyName = (key: string): string => {
  const normalized = key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const map: Record<string, string> = {
    ctrl: 'control',
    control: 'control',
    cmd: 'command',
    command: 'command',
    meta: 'command',
    option: 'alt',
    opt: 'alt',
    alt: 'alt',
    shift: 'shift',
    enter: 'enter',
    return: 'enter',
    esc: 'escape',
    escape: 'escape',
    space: 'space',
    spacebar: 'space',
    tab: 'tab',
    backspace: 'backspace',
    delete: 'delete',
    del: 'delete',
    up: 'up',
    arrow_up: 'up',
    down: 'down',
    arrow_down: 'down',
    left: 'left',
    arrow_left: 'left',
    right: 'right',
    arrow_right: 'right',
    page_up: 'pageup',
    pageup: 'pageup',
    page_down: 'pagedown',
    pagedown: 'pagedown',
    home: 'home',
    end: 'end',
    insert: 'insert',
    caps_lock: 'capslock',
    capslock: 'capslock',
    print_screen: 'printscreen',
    printscreen: 'printscreen'
  }

  return map[normalized] || normalized.replace(/_/g, '')
}

const isAsciiText = (text: string) => /^[\x00-\x7F]*$/.test(text)

const formatActionSummary = (action: ComputerAction) => {
  switch (action.type) {
    case 'screenshot':
      return 'screenshot'
    case 'click':
      return `click(${action.x}, ${action.y}, ${action.button})`
    case 'double_click':
      return `double_click(${action.x}, ${action.y}, ${action.button})`
    case 'scroll':
      return `scroll(${action.x}, ${action.y}, ${action.scrollX}, ${action.scrollY})`
    case 'keypress':
      return `keypress(${action.keys.join('+')})`
    case 'type':
      return `type(${action.text.length} chars${isAsciiText(action.text) ? '' : ', paste'})`
    case 'wait':
      return 'wait(2000ms)'
  }
}

const runAction = async (action: ComputerAction) => {
  switch (action.type) {
    case 'screenshot':
      return formatActionSummary(action)
    case 'click': {
      const result = await window.api.computer.mouseClick({
        x: action.x,
        y: action.y,
        coordinateSpace: 'screenshot',
        button: action.button
      })
      const position = result.screenPosition || result.position
      return `${formatActionSummary(action)} -> screen(${position.x}, ${position.y})`
    }
    case 'double_click': {
      const result = await window.api.computer.mouseClick({
        x: action.x,
        y: action.y,
        coordinateSpace: 'screenshot',
        button: action.button,
        double: true
      })
      const position = result.screenPosition || result.position
      return `${formatActionSummary(action)} -> screen(${position.x}, ${position.y})`
    }
    case 'scroll': {
      const result = await window.api.computer.moveMouse({
        x: action.x,
        y: action.y,
        coordinateSpace: 'screenshot'
      })
      await window.api.computer.scrollMouse({
        x: action.scrollX,
        y: action.scrollY
      })
      const position = result.screenPosition || result.position
      return `${formatActionSummary(action)} -> screen(${position.x}, ${position.y})`
    }
    case 'keypress': {
      const normalizedKeys = action.keys.map(normalizeKeyName)
      const key = normalizedKeys[normalizedKeys.length - 1]
      const modifiers = normalizedKeys.slice(0, -1)

      await window.api.computer.keyTap({
        key,
        modifiers: modifiers.length > 0 ? modifiers : undefined
      })
      if (modifiers.length > 0) {
        await sleep(120)
      }
      return formatActionSummary(action)
    }
    case 'type':
      if (isAsciiText(action.text)) {
        await window.api.computer.typeText({
          text: action.text
        })
        return formatActionSummary(action)
      }

      window.api.clipboard.writeText(action.text)
      await sleep(80)
      await window.api.computer.keyTap({
        key: 'v',
        modifiers: ['control']
      })
      await sleep(80)
      return formatActionSummary(action)
    case 'wait':
      await sleep(2000)
      return formatActionSummary(action)
  }
}

export const getComputerBuiltinTools = (config?: ComputerToolConfig): Partial<Tools> => ({
  computer_use: {
    title: '电脑操作',
    description:
      '通过单个 OpenAI 风格动作工具操作本地电脑。支持的动作包括：截图、单击、双击、滚动、按键、输入文本、等待。',
    render: ComputerUseRender,
    inputSchema: computerInputSchema,
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = computerInputSchema.parse(args)
        const actions = normalizeActions(input)
        const screenshotMaxSidePx = normalizeScreenshotMaxSidePx(config?.screenshotMaxSidePx)

        const executedActions: string[] = []

        for (const action of actions) {
          executedActions.push(await runAction(action))
        }

        const [capture, mousePosition, availability] = await Promise.all([
          window.api.computer.captureScreen({ maxSidePx: screenshotMaxSidePx, annotate: true }),
          window.api.computer.getMousePosition(),
          window.api.computer.isAvailable()
        ])

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: toToolText([
                  `status: success`,
                  `executed_actions: ${executedActions.join(', ')}`,
                  `debug_mouse_position_screen: (${mousePosition.x}, ${mousePosition.y})`,
                  `screenshot_origin: (${capture.x}, ${capture.y})`,
                  `screenshot_size: ${capture.width}x${capture.height}`,
                  `screenshot_max_side: ${capture.maxSidePx || screenshotMaxSidePx}`,
                  'coordinate_space: screenshot pixels; origin is the attached image top-left (0,0).',
                  'coordinate_rule: use x in [0, screenshot_width) and y in [0, screenshot_height); do not add screenshot_origin.',
                  availability.display
                    ? `display_bounds: (${availability.display.bounds.x}, ${availability.display.bounds.y}, ${availability.display.bounds.width}, ${availability.display.bounds.height})`
                    : undefined,
                  capture.annotation && capture.annotation.majorGridPx > 0
                    ? `pixel_grid: minor ${capture.annotation.minorGridPx}px, major ${capture.annotation.majorGridPx}px`
                    : undefined,
                  'Use the attached screenshot for the next action coordinates.'
                ])
              },
              {
                type: 'image-url',
                url: capture.dataUrl
              }
            ]
          }
        }
      })
  }
})

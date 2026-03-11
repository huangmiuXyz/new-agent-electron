import { z } from 'zod'

const mouseButtonSchema = z.enum(['left', 'right', 'middle'])

const computerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('screenshot')
  }),
  z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number(),
    button: mouseButtonSchema.optional().default('left')
  }),
  z.object({
    type: z.literal('double_click'),
    x: z.number(),
    y: z.number(),
    button: mouseButtonSchema.optional().default('left')
  }),
  z.object({
    startY: z.number().optional(),
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
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

const computerInputSchema = z.object({
  action: computerActionSchema.optional(),
  actions: z.array(computerActionSchema).min(1).optional()
}).refine((value) => value.action || value.actions?.length, {
  message: 'Provide action or actions'
})

type ComputerAction = z.infer<typeof computerActionSchema>

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

const normalizeKeyName = (key: string): string => {
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_')
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
      return
    case 'click':
      await window.api.computer.mouseClick({
        x: action.x,
        y: action.y,
        button: action.button
      })
      return
    case 'double_click':
      await window.api.computer.mouseClick({
        x: action.x,
        y: action.y,
        button: action.button,
        double: true
      })
      return
    case 'scroll':
      await window.api.computer.moveMouse({
        x: action.x,
        y: action.y
      })
      await window.api.computer.scrollMouse({
        x: action.scrollX,
        y: action.scrollY
      })
      return
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
      return
    }
    case 'type':
      if (isAsciiText(action.text)) {
        await window.api.computer.typeText({
          text: action.text
        })
        return
      }

      window.api.clipboard.writeText(action.text)
      await sleep(80)
      await window.api.computer.keyTap({
        key: 'v',
        modifiers: ['control']
      })
      await sleep(80)
      return
    case 'wait':
      await sleep(2000)
      return
  }
}

export const getComputerBuiltinTools = (): Partial<Tools> => ({
  computer_use: {
    title: 'Computer Use',
    description:
      'Use the local computer through a single OpenAI-style action tool. Supported actions: screenshot, click, double_click, scroll, keypress, type, wait.',
    inputSchema: computerInputSchema,
    execute: async (args: unknown) =>
      withComputerError(async () => {
        const input = computerInputSchema.parse(args)
        const actions = normalizeActions(input)

        for (const action of actions) {
          await runAction(action)
        }

        const [capture, mousePosition, availability] = await Promise.all([
          window.api.computer.captureScreen(),
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
                  `executed_actions: ${actions.map(formatActionSummary).join(', ')}`,
                  `mouse_position: (${mousePosition.x}, ${mousePosition.y})`,
                  `screenshot_origin: (${capture.x}, ${capture.y})`,
                  `screenshot_size: ${capture.width}x${capture.height}`,
                  availability.display
                    ? `display_bounds: (${availability.display.bounds.x}, ${availability.display.bounds.y}, ${availability.display.bounds.width}, ${availability.display.bounds.height})`
                    : undefined,
                  capture.annotation
                    ? `pixel_grid: minor ${capture.annotation.minorGridPx}px, major ${capture.annotation.majorGridPx}px`
                    : undefined,
                  'Use the attached screenshot for the next action coordinates.'
                ])
              },
              {
                type: 'image-url',
                url: capture.rawDataUrl || capture.dataUrl
              }
            ]
          }
        }
      })
  }
})

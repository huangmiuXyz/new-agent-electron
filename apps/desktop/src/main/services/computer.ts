import { ipcMain, desktopCapturer, screen } from 'electron'

type RobotModule = typeof import('robotjs')
type MouseButton = 'left' | 'right' | 'middle'
type CoordinateSpace = 'screen' | 'screenshot'

let robotInstance: RobotModule | null = null
let robotLoadError: Error | null = null

const normalizeInteger = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`)
  }

  return Math.round(value)
}

const normalizeOptionalInteger = (value: unknown, fallback: number, name: string): number => {
  if (value == null) return fallback
  return normalizeInteger(value, name)
}

const normalizeMouseButton = (value: unknown): MouseButton => {
  if (value === 'left' || value === 'right' || value === 'middle') {
    return value
  }

  return 'left'
}

const normalizeCoordinateSpace = (value: unknown): CoordinateSpace => {
  if (value === 'screenshot') return 'screenshot'
  return 'screen'
}

const getPrimaryDisplayMetrics = (robot: RobotModule) => {
  const robotScreenSize = robot.getScreenSize()
  const display = screen.getPrimaryDisplay()
  const scaleFactor = display.scaleFactor || 1

  return {
    displayId: String(display.id),
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height
    },
    scaleFactor,
    robotScreenSize,
    captureSize: {
      width: Math.max(1, Math.round(display.bounds.width * scaleFactor)),
      height: Math.max(1, Math.round(display.bounds.height * scaleFactor))
    }
  }
}

const captureToRobotX = (value: number, metrics: ReturnType<typeof getPrimaryDisplayMetrics>) => {
  return Math.round((value * metrics.robotScreenSize.width) / metrics.captureSize.width)
}

const captureToRobotY = (value: number, metrics: ReturnType<typeof getPrimaryDisplayMetrics>) => {
  return Math.round((value * metrics.robotScreenSize.height) / metrics.captureSize.height)
}

const resolvePoint = (
  robot: RobotModule,
  payload: Record<string, unknown>,
  xKey: string = 'x',
  yKey: string = 'y'
) => {
  const coordinateSpace = normalizeCoordinateSpace(payload.coordinateSpace)
  const inputX = normalizeInteger(payload[xKey], xKey)
  const inputY = normalizeInteger(payload[yKey], yKey)

  if (coordinateSpace === 'screen') {
    return { x: inputX, y: inputY, coordinateSpace }
  }

  const originX = normalizeOptionalInteger(payload.originX, 0, 'originX')
  const originY = normalizeOptionalInteger(payload.originY, 0, 'originY')
  const metrics = getPrimaryDisplayMetrics(robot)

  const screenX = originX + inputX
  const screenY = originY + inputY

  if (
    screenX < 0 ||
    screenY < 0 ||
    screenX >= metrics.robotScreenSize.width ||
    screenY >= metrics.robotScreenSize.height
  ) {
    throw new Error('screenshot coordinates are outside the robot screen area')
  }

  return {
    x: screenX,
    y: screenY,
    coordinateSpace,
    originX,
    originY
  }
}

const getRobot = (): RobotModule => {
  if (robotInstance) return robotInstance

  if (robotLoadError) {
    throw new Error(
      `robotjs is unavailable: ${robotLoadError.message}. Close the app process and run pnpm -w rebuild:native.`
    )
  }

  try {
    const loaded = require('robotjs') as RobotModule
    loaded.setMouseDelay(2)
    loaded.setKeyboardDelay(2)
    robotInstance = loaded
    return loaded
  } catch (error) {
    robotLoadError = error as Error
    throw new Error(
      `robotjs failed to load: ${robotLoadError.message}. Close the app process and run pnpm -w rebuild:native.`
    )
  }
}

const maybeMoveMouse = (
  robot: RobotModule,
  x: number,
  y: number,
  smooth?: boolean,
  speed?: number,
  delayMs?: number
) => {
  if (typeof delayMs === 'number' && Number.isFinite(delayMs)) {
    robot.setMouseDelay(Math.max(0, Math.round(delayMs)))
  }

  if (smooth) {
    if (typeof speed === 'number' && Number.isFinite(speed)) {
      robot.moveMouseSmooth(x, y, speed)
    } else {
      robot.moveMouseSmooth(x, y)
    }
    return
  }

  robot.moveMouse(x, y)
}

export const setupComputerHandlers = () => {
  ipcMain.handle('computer:is-available', async () => {
    try {
      const robot = getRobot()
      return { available: true, screen: robot.getScreenSize(), display: getPrimaryDisplayMetrics(robot) }
    } catch (error) {
      return { available: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('computer:get-screen-size', async () => {
    const robot = getRobot()
    return robot.getScreenSize()
  })

  ipcMain.handle('computer:get-mouse-position', async () => {
    const robot = getRobot()
    return robot.getMousePos()
  })

  ipcMain.handle('computer:move-mouse', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const point = resolvePoint(robot, payload)
    maybeMoveMouse(robot, point.x, point.y, Boolean(payload.smooth), Number(payload.speed), Number(payload.delayMs))
    return {
      position: robot.getMousePos(),
      coordinateSpace: point.coordinateSpace
    }
  })

  ipcMain.handle('computer:mouse-click', async (_event, payload: Record<string, unknown> = {}) => {
    const robot = getRobot()

    let point: ReturnType<typeof resolvePoint> | undefined
    if (typeof payload.x === 'number' && typeof payload.y === 'number') {
      point = resolvePoint(robot, payload)
      maybeMoveMouse(
        robot,
        point.x,
        point.y,
        Boolean(payload.smooth),
        Number(payload.speed),
        Number(payload.delayMs)
      )
    }

    const button = normalizeMouseButton(payload.button)
    robot.mouseClick(button, Boolean(payload.double))

    return {
      button,
      double: Boolean(payload.double),
      position: robot.getMousePos(),
      coordinateSpace: point?.coordinateSpace || 'screen'
    }
  })

  ipcMain.handle('computer:drag-mouse', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const targetPoint = resolvePoint(robot, payload)
    const button = normalizeMouseButton(payload.button)

    if (typeof payload.startX === 'number' && typeof payload.startY === 'number') {
      const startPoint = resolvePoint(robot, payload, 'startX', 'startY')
      maybeMoveMouse(
        robot,
        startPoint.x,
        startPoint.y,
        Boolean(payload.smooth),
        Number(payload.speed),
        Number(payload.delayMs)
      )
    }

    robot.mouseToggle('down', button)
    robot.dragMouse(targetPoint.x, targetPoint.y)
    robot.mouseToggle('up', button)

    return {
      button,
      position: robot.getMousePos(),
      coordinateSpace: targetPoint.coordinateSpace
    }
  })

  ipcMain.handle('computer:scroll-mouse', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const x = normalizeInteger(payload.x, 'x')
    const y = normalizeInteger(payload.y, 'y')

    if (typeof payload.delayMs === 'number' && Number.isFinite(payload.delayMs)) {
      robot.setMouseDelay(Math.max(0, Math.round(Number(payload.delayMs))))
    }

    robot.scrollMouse(x, y)
    return { x, y, position: robot.getMousePos() }
  })

  ipcMain.handle('computer:type-text', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const text = typeof payload.text === 'string' ? payload.text : ''
    if (!text) {
      throw new Error('text is required')
    }

    const cpm =
      typeof payload.cpm === 'number' && Number.isFinite(payload.cpm) ? Math.max(0, Math.round(payload.cpm)) : 0

    if (typeof payload.delayMs === 'number' && Number.isFinite(payload.delayMs)) {
      robot.setKeyboardDelay(Math.max(0, Math.round(Number(payload.delayMs))))
    }

    if (cpm > 0) {
      robot.typeStringDelayed(text, cpm)
    } else {
      robot.typeString(text)
    }

    return { textLength: text.length }
  })

  ipcMain.handle('computer:key-tap', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const key = typeof payload.key === 'string' ? payload.key : ''
    if (!key) {
      throw new Error('key is required')
    }

    const modifiers = Array.isArray(payload.modifiers)
      ? payload.modifiers.filter((item): item is string => typeof item === 'string')
      : undefined

    if (typeof payload.delayMs === 'number' && Number.isFinite(payload.delayMs)) {
      robot.setKeyboardDelay(Math.max(0, Math.round(Number(payload.delayMs))))
    }

    if (modifiers && modifiers.length > 0) {
      robot.keyTap(key, modifiers)
    } else {
      robot.keyTap(key)
    }

    return { key, modifiers: modifiers || [] }
  })

  ipcMain.handle('computer:get-pixel-color', async (_event, payload: Record<string, unknown>) => {
    const robot = getRobot()
    const point = resolvePoint(robot, payload)

    return {
      x: point.x,
      y: point.y,
      color: robot.getPixelColor(point.x, point.y),
      coordinateSpace: point.coordinateSpace
    }
  })

  ipcMain.handle('computer:capture-screen', async (_event, payload: Record<string, unknown> = {}) => {
    const robot = getRobot()
    const metrics = getPrimaryDisplayMetrics(robot)
    const x = normalizeOptionalInteger(payload.x, 0, 'x')
    const y = normalizeOptionalInteger(payload.y, 0, 'y')
    const width = normalizeOptionalInteger(payload.width, metrics.captureSize.width, 'width')
    const height = normalizeOptionalInteger(payload.height, metrics.captureSize.height, 'height')

    if (width <= 0 || height <= 0) {
      throw new Error('width and height must be greater than 0')
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false,
      thumbnailSize: { width: metrics.captureSize.width, height: metrics.captureSize.height }
    })

    const primarySource =
      sources.find((source) => source.display_id === metrics.displayId) ||
      sources.find((source) => source.name.toLowerCase().includes('entire screen')) ||
      sources[0]

    if (!primarySource || primarySource.thumbnail.isEmpty()) {
      throw new Error('failed to capture screen with Electron desktopCapturer')
    }

    const cropX = x
    const cropY = y
    const imageSize = primarySource.thumbnail.getSize()

    if (
      cropX < 0 ||
      cropY < 0 ||
      cropX + width > imageSize.width ||
      cropY + height > imageSize.height
    ) {
      throw new Error('requested capture region is outside the primary display bounds')
    }

    const cropped = primarySource.thumbnail.crop({
      x: cropX,
      y: cropY,
      width,
      height
    })

    const normalizedX = captureToRobotX(x, metrics)
    const normalizedY = captureToRobotY(y, metrics)
    const normalizedWidth = Math.max(1, captureToRobotX(width, metrics))
    const normalizedHeight = Math.max(1, captureToRobotY(height, metrics))
    const normalizedImage = cropped.resize({
      width: normalizedWidth,
      height: normalizedHeight,
      quality: 'good'
    })

    return {
      x: normalizedX,
      y: normalizedY,
      width: normalizedWidth,
      height: normalizedHeight,
      bytesPerPixel: 4,
      dataUrl: normalizedImage.toDataURL(),
      coordinateSpace: 'screenshot',
      display: metrics
    }
  })
}

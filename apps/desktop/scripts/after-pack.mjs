import path from 'node:path'
import { rcedit } from 'rcedit'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const executableName = context.packager.appInfo.productFilename
  const executablePath = path.join(context.appOutDir, `${executableName}.exe`)
  const iconPath = path.resolve(context.packager.projectDir, 'build/icon.ico')

  await rcedit(executablePath, {
    icon: iconPath
  })
}

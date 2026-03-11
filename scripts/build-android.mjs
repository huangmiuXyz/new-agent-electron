#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { platform } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const validModes = new Set(['debug', 'release', 'bundle'])
const isWindows = platform() === 'win32'
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appDir = join(repoRoot, 'apps', 'desktop')
const androidDir = join(appDir, 'android')
const androidAppGradlePath = join(androidDir, 'app', 'build.gradle')

function parseArgs(argv) {
  const options = {
    mode: 'release',
    versionName: null,
    versionCode: null,
    interactive: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--') {
      continue
    }

    if (validModes.has(arg)) {
      options.mode = arg
      continue
    }

    if (arg === '--interactive' || arg === '-i') {
      options.interactive = true
      continue
    }

    if (arg === '--version-name') {
      const value = argv[i + 1]
      if (!value) {
        console.error('Missing value for --version-name')
        process.exit(1)
      }
      options.versionName = value
      i += 1
      continue
    }

    if (arg === '--version-code') {
      const value = argv[i + 1]
      if (!value || !/^\d+$/.test(value)) {
        console.error('Invalid value for --version-code, expected a positive integer')
        process.exit(1)
      }
      options.versionCode = Number(value)
      i += 1
      continue
    }

    console.error(`Unknown argument: ${arg}`)
    process.exit(1)
  }

  return options
}

function envValue(name) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

function javaVersionOutput(javaBin) {
  const result = spawnSync(javaBin, ['-version'], { encoding: 'utf8' })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return { ok: result.status === 0, output }
}

function isJava21Home(pathValue) {
  if (!pathValue) return false
  const javaBin = join(pathValue, 'bin', isWindows ? 'java.exe' : 'java')
  if (!existsSync(javaBin)) return false
  const { ok, output } = javaVersionOutput(javaBin)
  if (!ok) return false
  return /version\s+"21(?:\.|")/.test(output)
}

function resolveJava21Home() {
  let macJavaHome21 = null
  if (!isWindows) {
    const macHome = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' })
    if (macHome.status === 0 && macHome.stdout?.trim()) {
      macJavaHome21 = macHome.stdout.trim()
    }
  }

  let brewOpenJdk21Home = null
  if (!isWindows) {
    const brewPrefix = spawnSync('brew', ['--prefix', 'openjdk@21'], { encoding: 'utf8' })
    if (brewPrefix.status === 0 && brewPrefix.stdout?.trim()) {
      brewOpenJdk21Home = join(brewPrefix.stdout.trim(), 'libexec', 'openjdk.jdk', 'Contents', 'Home')
    }
  }

  const candidates = [
    envValue('JAVA_HOME_21'),
    envValue('ANDROID_STUDIO_JBR'),
    envValue('JAVA_HOME'),
    macJavaHome21,
    brewOpenJdk21Home,
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    isWindows ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    isWindows ? 'C:\\Program Files\\JetBrains\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (isJava21Home(candidate)) return candidate
  }
  return null
}

function runOrFail(command, args, options = {}) {
  const spawnOptions = {
    stdio: 'inherit',
    shell: false,
    ...options
  }
  if (isWindows && /\.(cmd|bat)$/i.test(command)) {
    spawnOptions.shell = true
  }

  const result = spawnSync(command, args, spawnOptions)

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
}

function runPnpmOrFail(args, options = {}) {
  const npmExecPath = envValue('npm_execpath')
  if (npmExecPath && npmExecPath.toLowerCase().includes('pnpm')) {
    runOrFail(process.execPath, [npmExecPath, ...args], options)
    return
  }

  runOrFail('pnpm', args, options)
}

function latestFileInDir(dir, ext) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())

  if (!files.length) return null

  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return files[0]
}

function hasReleaseSigningConfig() {
  const required = [
    'ANDROID_KEYSTORE_FILE',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD'
  ]

  for (const name of required) {
    if (!envValue(name)) return false
  }

  return existsSync(process.env.ANDROID_KEYSTORE_FILE)
}

function resolvePathEnvKey(envObj) {
  for (const key of Object.keys(envObj)) {
    if (key.toLowerCase() === 'path') return key
  }
  return 'PATH'
}

function readAndroidVersion(gradleContent) {
  const versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/)
  const versionNameMatch = gradleContent.match(/versionName\s+"([^"]+)"/)
  if (!versionCodeMatch || !versionNameMatch) return null

  return {
    versionCode: Number(versionCodeMatch[1]),
    versionName: versionNameMatch[1]
  }
}

function readCurrentAndroidVersion() {
  const gradleContent = readFileSync(androidAppGradlePath, 'utf8')
  const version = readAndroidVersion(gradleContent)
  if (!version) {
    console.error(`Failed to parse versionCode/versionName in ${androidAppGradlePath}`)
    process.exit(1)
  }
  return version
}

function updateAndroidVersion(versionName, versionCode) {
  const gradleContent = readFileSync(androidAppGradlePath, 'utf8')
  let nextGradleContent = gradleContent
  nextGradleContent = nextGradleContent.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  nextGradleContent = nextGradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`)
  writeFileSync(androidAppGradlePath, nextGradleContent)
}

async function collectInteractiveOptions(cliOptions, currentVersion) {
  if (!cliOptions.interactive) return cliOptions

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Interactive mode requires a TTY terminal.')
    process.exit(1)
  }

  const nextOptions = { ...cliOptions }
  const rl = createInterface({ input, output })

  try {
    const modeInput = (
      await rl.question(`Build mode [debug/release/bundle] (default: ${nextOptions.mode}): `)
    ).trim()
    if (modeInput) {
      if (!validModes.has(modeInput)) {
        console.error(`Invalid mode: ${modeInput}. Expected one of: debug, release, bundle`)
        process.exit(1)
      }
      nextOptions.mode = modeInput
    }

    const versionNameInput = (
      await rl.question(`versionName (current: ${currentVersion.versionName}, Enter to keep): `)
    ).trim()
    if (versionNameInput) {
      nextOptions.versionName = versionNameInput
    }

    const versionCodeInput = (
      await rl.question(`versionCode (current: ${currentVersion.versionCode}, Enter to keep): `)
    ).trim()
    if (versionCodeInput) {
      if (!/^\d+$/.test(versionCodeInput) || Number(versionCodeInput) <= 0) {
        console.error('versionCode must be a positive integer')
        process.exit(1)
      }
      nextOptions.versionCode = Number(versionCodeInput)
    }
  } finally {
    rl.close()
  }

  return nextOptions
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2))

  if (!existsSync(androidDir)) {
    console.error(`Android project not found: ${androidDir}`)
    process.exit(1)
  }

  const currentVersion = readCurrentAndroidVersion()
  console.log(
    `Current Android version: versionName=${currentVersion.versionName}, versionCode=${currentVersion.versionCode}`
  )

  const finalOptions = await collectInteractiveOptions(cliOptions, currentVersion)
  const finalVersionName = finalOptions.versionName ?? currentVersion.versionName
  const finalVersionCode = finalOptions.versionCode ?? currentVersion.versionCode

  if (
    finalVersionName !== currentVersion.versionName ||
    finalVersionCode !== currentVersion.versionCode
  ) {
    updateAndroidVersion(finalVersionName, finalVersionCode)
    console.log(
      `Updated Android version: versionName=${finalVersionName}, versionCode=${finalVersionCode}`
    )
  }

  const java21Home = resolveJava21Home()
  if (!java21Home) {
    console.error(
      'Java 21 is required. Set JAVA_HOME_21 or install Android Studio so the script can use its bundled JBR.'
    )
    process.exit(1)
  }

  const pathKey = resolvePathEnvKey(process.env)
  const currentPath = process.env[pathKey] ?? process.env.PATH ?? process.env.Path ?? ''
  const mergedPath = `${join(java21Home, 'bin')}${isWindows ? ';' : ':'}${currentPath}`

  const env = {
    ...process.env,
    JAVA_HOME: java21Home,
    [pathKey]: mergedPath
  }

  const gradleTaskByMode = {
    debug: 'assembleDebug',
    release: 'assembleRelease',
    bundle: 'bundleRelease'
  }

  const mode = finalOptions.mode
  console.log(`Using JAVA_HOME=${java21Home}`)
  console.log(`Build mode: ${mode}`)
  console.log('Building web assets...')
  runPnpmOrFail(['--filter', 'desktop', 'build'], { cwd: repoRoot, env })

  console.log('Syncing Capacitor...')
  runPnpmOrFail(['--filter', 'desktop', 'cap:sync'], { cwd: repoRoot, env })

  const gradleTask = gradleTaskByMode[mode]
  const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew'
  console.log(`Running Gradle task ${gradleTask}...`)
  runOrFail(gradleCmd, [gradleTask], { cwd: androidDir, env })

  let artifact = null
  if (mode === 'debug') {
    artifact = latestFileInDir(join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug'), '.apk')
  }
  if (mode === 'release') {
    artifact = latestFileInDir(join(androidDir, 'app', 'build', 'outputs', 'apk', 'release'), '.apk')
  }
  if (mode === 'bundle') {
    artifact = latestFileInDir(join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release'), '.aab')
  }

  if (artifact) {
    console.log(`Android artifact ready: ${artifact}`)
    if (mode === 'release' && !hasReleaseSigningConfig()) {
      console.warn(
        'Release signing is not configured. The APK is unsigned and may fail to install. Use pnpm android:debug for local installs or set ANDROID_KEYSTORE_* env vars for a signed release build.'
      )
    }
  } else {
    console.warn(`Build finished, but no artifact found for mode: ${mode}`)
  }
}

void main()

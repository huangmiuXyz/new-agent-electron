#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { platform } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2] ?? 'release'
const validModes = new Set(['debug', 'release', 'bundle'])
if (!validModes.has(mode)) {
  console.error(`Invalid mode: ${mode}. Expected one of: debug, release, bundle`)
  process.exit(1)
}

const isWindows = platform() === 'win32'
const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const appDir = join(repoRoot, 'apps', 'desktop')
const androidDir = join(appDir, 'android')

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

  const candidates = [
    envValue('JAVA_HOME_21'),
    envValue('ANDROID_STUDIO_JBR'),
    envValue('JAVA_HOME'),
    macJavaHome21,
    isWindows ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    isWindows ? 'C:\\Program Files\\JetBrains\\Android Studio\\jbr' : '/Applications/Android Studio.app/Contents/jbr'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (isJava21Home(candidate)) return candidate
  }
  return null
}

function runOrFail(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
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

if (!existsSync(androidDir)) {
  console.error(`Android project not found: ${androidDir}`)
  process.exit(1)
}

const java21Home = resolveJava21Home()
if (!java21Home) {
  console.error(
    'Java 21 is required. Set JAVA_HOME_21 or install Android Studio so the script can use its bundled JBR.'
  )
  process.exit(1)
}

const env = {
  ...process.env,
  JAVA_HOME: java21Home,
  PATH: `${join(java21Home, 'bin')}${isWindows ? ';' : ':'}${process.env.PATH ?? ''}`
}

const gradleTaskByMode = {
  debug: 'assembleDebug',
  release: 'assembleRelease',
  bundle: 'bundleRelease'
}

console.log(`Using JAVA_HOME=${java21Home}`)
console.log('Building web assets...')
runOrFail('pnpm', ['--filter', 'desktop', 'build'], { cwd: repoRoot, env })

console.log('Syncing Capacitor...')
runOrFail('pnpm', ['--filter', 'desktop', 'cap:sync'], { cwd: repoRoot, env })

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

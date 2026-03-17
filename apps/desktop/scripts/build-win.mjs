import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const unsigned = args.has('--unsigned')
const publish = args.has('--publish')

const hasSigningConfig =
  Boolean(process.env.WIN_CSC_LINK) ||
  Boolean(process.env.CSC_LINK)

const hasGithubToken =
  Boolean(process.env.GH_TOKEN) ||
  Boolean(process.env.GITHUB_TOKEN)

const ensureWindowsSigningConfig = () => {
  if (unsigned) return

  if (hasSigningConfig) return

  console.error(
    [
      'Windows code signing is required for `pnpm build:win`.',
      'Set `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` or `CSC_LINK`/`CSC_KEY_PASSWORD`,',
      'then rerun the build. If you intentionally want an unsigned package, use `pnpm build:win:unsigned`.'
    ].join(' ')
  )
  process.exit(1)
}

const ensureGithubPublishConfig = () => {
  if (!publish) return

  if (hasGithubToken) return

  console.error(
    [
      'GitHub publishing is enabled for this build, but no token was found.',
      'Set `GH_TOKEN` or `GITHUB_TOKEN`, then rerun the command so electron-builder can upload `latest.yml`,',
      'the installer, and related update artifacts to the GitHub Release.'
    ].join(' ')
  )
  process.exit(1)
}

const killRunningApp = () => {
  try {
    execFileSync('taskkill', ['/F', '/IM', 'agent-qi.exe'], { stdio: 'ignore' })
  } catch {}
}

const cleanDist = () => {
  try {
    fs.rmSync('dist', { recursive: true, force: true })
  } catch {}
}

const run = (command, commandArgs) => {
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
}

ensureWindowsSigningConfig()
ensureGithubPublishConfig()
killRunningApp()
cleanDist()

run('npm', ['run', 'build'])

const electronBuilderArgs = ['electron-builder', '--win']

if (unsigned) {
  electronBuilderArgs.push('--config.forceCodeSigning=false')
}

if (publish) {
  electronBuilderArgs.push('--publish', 'always')
}

run('pnpm', electronBuilderArgs)

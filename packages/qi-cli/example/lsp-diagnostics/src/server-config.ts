import path from 'path'
import fs from 'fs'

export type Installer =
  | { type: 'npm'; package: string }
  | { type: 'npm-local'; package: string }
  | { type: 'go-install'; module: string }
  | { type: 'gem-install'; gem: string }
  | { type: 'dotnet-tool'; tool: string }
  | { type: 'pip'; package: string }
  | { type: 'pip-npm'; package: string }
  | { type: 'github-release'; repo: string; asset: string; bin: string }
  | { type: 'rustup'; component: string }
  | { type: 'download-zip'; url: string; extractDir: string; build?: string[]; serverPath: string; bin: string }
  | { type: 'download-tar'; url: string; build?: string[]; serverPath: string; bin: string }
  | { type: 'which-binary'; bin: string }

export interface ServerConfig {
  id: string
  extensions: string[]
  root: (file: string, directory: string) => string | undefined
  binary: string
  args: string[]
  initialization?: Record<string, any>
  installers?: Installer[]
  installOverrides?: { binary?: string; args?: string[]; initialization?: Record<string, any> }
}

function which(bin: string): string | undefined {
  const pathEnv = process.env.PATH || ''
  const dirs = pathEnv.split(path.delimiter)
  const exts = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext)
      try {
        fs.accessSync(full, fs.constants.F_OK)
        return full
      } catch {}
    }
  }
  return undefined
}

function findUp(filename: string, startDir: string, stopDir: string): string | undefined {
  let current = startDir
  while (true) {
    const candidate = path.join(current, filename)
    if (fs.existsSync(candidate)) return candidate
    if (current === stopDir || current === path.dirname(current)) return undefined
    current = path.dirname(current)
  }
}

const NearestRoot = (patterns: string[]): ((file: string, directory: string) => string | undefined) => {
  return (file, directory) => {
    const dir = path.dirname(file)
    for (const pattern of patterns) {
      const found = findUp(pattern, dir, directory)
      if (found) return path.dirname(found)
    }
    return directory
  }
}

const StrictNearestRoot = (patterns: string[]): ((file: string, directory: string) => string | undefined) => {
  return (file, directory) => {
    const dir = path.dirname(file)
    for (const pattern of patterns) {
      const found = findUp(pattern, dir, directory)
      if (found) return path.dirname(found)
    }
    return undefined
  }
}

export function resolveNpm(bin: string, directory: string): string | undefined {
  const paths = [
    path.join(directory, 'node_modules', '.bin', bin),
    path.join(directory, 'node_modules', '.bin', bin + '.cmd'),
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) return p
  }
  const parent = path.dirname(directory)
  if (parent !== directory) return resolveNpm(bin, parent)
  return undefined
}

export function resolveNpmGlobal(bin: string): string | undefined {
  const localAppData = process.env.LOCALAPPDATA
  const home = process.env.HOME || process.env.USERPROFILE
  const candidates = [
    ...(localAppData ? [path.join(localAppData, 'npm')] : []),
    ...(home ? [path.join(home, '.npm-global', 'bin'), path.join(home, '.npm-global'), path.join(home, 'npm-global', 'bin')] : []),
    '/usr/local/bin',
    '/usr/local/lib/node_modules',
  ]
  const exts = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : ['']
  for (const dir of candidates) {
    for (const ext of exts) {
      const full = path.join(dir, bin + ext)
      try {
        fs.accessSync(full, fs.constants.F_OK)
        return full
      } catch {}
    }
  }
  return undefined
}

export const SERVER_CONFIGS: ServerConfig[] = [
  {
    id: 'typescript',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'typescript-language-server',
    args: ['--stdio'],
    initialization: { hostInfo: 'agent-qi' },
    installers: [{ type: 'npm', package: 'typescript-language-server' }],
  },
  {
    id: 'deno',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    root: (file, directory) => {
      const dir = path.dirname(file)
      for (const f of ['deno.json', 'deno.jsonc']) {
        const found = findUp(f, dir, directory)
        if (found) return path.dirname(found)
      }
      return undefined
    },
    binary: 'deno',
    args: ['lsp'],
    installers: [{ type: 'npm', package: 'deno' }],
  },
  {
    id: 'vue',
    extensions: ['.vue'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'vue-language-server',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: '@vue/language-server' }],
  },
  {
    id: 'eslint',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'vscode-eslint-language-server',
    args: ['--stdio'],
    installers: [{
      type: 'download-zip',
      url: 'https://github.com/microsoft/vscode-eslint/archive/refs/heads/main.zip',
      extractDir: 'eslint',
      build: ['npm install', 'npm run compile'],
      serverPath: 'server/out/eslintServer.js',
      bin: 'eslintServer',
    }],
    installOverrides: { binary: 'node', args: ['{serverPath}', '--stdio'] },
  },
  {
    id: 'oxlint',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.astro', '.svelte'],
    root: NearestRoot(['.oxlintrc.json', 'package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'package.json']),
    binary: 'oxlint',
    args: ['--lsp'],
    installers: [{ type: 'npm', package: 'oxlint' }],
  },
  {
    id: 'biome',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.jsonc', '.vue', '.astro', '.svelte', '.css', '.graphql', '.gql', '.html'],
    root: NearestRoot(['biome.json', 'biome.jsonc', 'package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'biome',
    args: ['lsp-proxy', '--stdio'],
    installers: [{ type: 'npm', package: 'biome' }],
  },
  {
    id: 'gopls',
    extensions: ['.go'],
    root: (file, directory) => {
      const dir = path.dirname(file)
      const work = findUp('go.work', dir, directory)
      if (work) return path.dirname(work)
      const mod = findUp('go.mod', dir, directory)
      if (mod) return path.dirname(mod)
      return directory
    },
    binary: 'gopls',
    args: [],
    installers: [{ type: 'go-install', module: 'golang.org/x/tools/gopls@latest' }],
  },
  {
    id: 'ruby-lsp',
    extensions: ['.rb', '.rake', '.gemspec', '.ru'],
    root: NearestRoot(['Gemfile']),
    binary: 'rubocop',
    args: ['--lsp'],
    installers: [{ type: 'gem-install', gem: 'rubocop' }],
  },
  {
    id: 'pyright',
    extensions: ['.py', '.pyi'],
    root: NearestRoot(['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json']),
    binary: 'pyright-langserver',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: 'pyright' }],
  },
  {
    id: 'ty',
    extensions: ['.py', '.pyi'],
    root: NearestRoot(['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json']),
    binary: 'ty',
    args: ['server'],
    installers: [{ type: 'pip-npm', package: 'ty' }],
  },
  {
    id: 'elixir-ls',
    extensions: ['.ex', '.exs'],
    root: NearestRoot(['mix.exs', 'mix.lock']),
    binary: 'elixir-ls',
    args: [],
    installers: [{
      type: 'download-zip',
      url: 'https://github.com/elixir-lsp/elixir-ls/archive/refs/heads/master.zip',
      extractDir: 'elixir-ls',
      build: ['mix deps.get', 'mix compile', 'mix elixir_ls.release2 -o release'],
      serverPath: 'release/language_server.sh',
      bin: 'language_server',
    }],
  },
  {
    id: 'zls',
    extensions: ['.zig', '.zon'],
    root: NearestRoot(['build.zig']),
    binary: 'zls',
    args: [],
    installers: [
      { type: 'npm', package: '@zigtools/zls' },
      { type: 'github-release', repo: 'zigtools/zls', asset: 'zls-{arch}-{platform}.{ext}', bin: 'zls' },
    ],
  },
  {
    id: 'csharp',
    extensions: ['.cs', '.csx'],
    root: NearestRoot(['.sln', '.slnx', '.csproj', 'global.json']),
    binary: 'roslyn-language-server',
    args: ['--stdio', '--autoLoadProjects'],
    installers: [{ type: 'dotnet-tool', tool: 'roslyn-language-server' }],
  },
  {
    id: 'razor',
    extensions: ['.razor', '.cshtml'],
    root: NearestRoot(['.sln', '.slnx', '.csproj', 'global.json']),
    binary: 'roslyn-language-server',
    args: ['--stdio', '--autoLoadProjects'],
    installers: [{ type: 'dotnet-tool', tool: 'roslyn-language-server' }],
  },
  {
    id: 'fsharp',
    extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
    root: NearestRoot(['.sln', '.slnx', '.fsproj', 'global.json']),
    binary: 'fsautocomplete',
    args: [],
    installers: [{ type: 'dotnet-tool', tool: 'fsautocomplete' }],
  },
  {
    id: 'sourcekit-lsp',
    extensions: ['.swift'],
    root: NearestRoot(['Package.swift']),
    binary: 'sourcekit-lsp',
    args: [],
  },
  {
    id: 'rust',
    extensions: ['.rs'],
    root: (file, directory) => {
      const dir = path.dirname(file)
      const cargo = findUp('Cargo.toml', dir, directory)
      if (!cargo) return undefined
      return path.dirname(cargo)
    },
    binary: 'rust-analyzer',
    args: [],
    installers: [
      { type: 'npm', package: 'rust-analyzer' },
      { type: 'rustup', component: 'rust-analyzer' },
    ],
  },
  {
    id: 'clangd',
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh'],
    root: NearestRoot(['compile_commands.json', 'compile_flags.txt', '.clangd']),
    binary: 'clangd',
    args: ['--background-index', '--clang-tidy'],
    installers: [{ type: 'npm', package: 'clangd' }],
  },
  {
    id: 'svelte',
    extensions: ['.svelte'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'svelteserver',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: 'svelte-language-server' }],
  },
  {
    id: 'astro',
    extensions: ['.astro'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'astro-ls',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: '@astrojs/language-server' }],
  },
  {
    id: 'jdtls',
    extensions: ['.java'],
    root: (file, directory) => {
      return StrictNearestRoot(['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'])(file, directory)
    },
    binary: 'java',
    args: [],
    installers: [{
      type: 'download-tar',
      url: 'https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz',
      serverPath: '',
      bin: 'jdtls',
    }],
  },
  {
    id: 'kotlin-ls',
    extensions: ['.kt', '.kts'],
    root: NearestRoot(['settings.gradle.kts', 'settings.gradle', 'build.gradle.kts', 'build.gradle', 'pom.xml']),
    binary: 'kotlin-ls',
    args: ['--stdio'],
    installers: [{ type: 'github-release', repo: 'Kotlin/kotlin-lsp', asset: 'kotlin-lsp-{version}-{platform}-{arch}.zip', bin: 'kotlin-ls' }],
  },
  {
    id: 'yaml-ls',
    extensions: ['.yaml', '.yml'],
    root: NearestRoot(['package-lock.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
    binary: 'yaml-language-server',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: 'yaml-language-server' }],
  },
  {
    id: 'lua-ls',
    extensions: ['.lua'],
    root: NearestRoot(['.luarc.json', '.luacheckrc', 'stylua.toml']),
    binary: 'lua-language-server',
    args: [],
    installers: [{ type: 'npm', package: 'lua-language-server' }],
  },
  {
    id: 'php intelephense',
    extensions: ['.php'],
    root: NearestRoot(['composer.json', 'composer.lock']),
    binary: 'intelephense',
    args: ['--stdio'],
    initialization: { telemetry: { enabled: false } },
    installers: [{ type: 'npm', package: 'intelephense' }],
  },
  {
    id: 'prisma',
    extensions: ['.prisma'],
    root: NearestRoot(['schema.prisma']),
    binary: 'prisma',
    args: ['language-server'],
    installers: [{ type: 'npm', package: 'prisma' }],
  },
  {
    id: 'dart',
    extensions: ['.dart'],
    root: NearestRoot(['pubspec.yaml', 'analysis_options.yaml']),
    binary: 'dart',
    args: ['language-server', '--lsp'],
  },
  {
    id: 'ocaml-lsp',
    extensions: ['.ml', '.mli'],
    root: NearestRoot(['dune-project', 'dune-workspace', '.merlin', 'opam']),
    binary: 'ocamllsp',
    args: [],
    installers: [{ type: 'npm', package: 'ocaml-lsp' }],
  },
  {
    id: 'bash',
    extensions: ['.sh', '.bash', '.zsh', '.ksh'],
    root: (_file: string, directory: string) => directory,
    binary: 'bash-language-server',
    args: ['start'],
    installers: [{ type: 'npm', package: 'bash-language-server' }],
  },
  {
    id: 'terraform',
    extensions: ['.tf', '.tfvars'],
    root: NearestRoot(['.terraform.lock.hcl', 'terraform.tfstate']),
    binary: 'terraform-ls',
    args: ['serve'],
    initialization: { experimentalFeatures: { prefillRequiredFields: true, validateOnSave: true } },
    installers: [{ type: 'npm', package: '@hashicorp/terraform-ls' }],
  },
  {
    id: 'texlab',
    extensions: ['.tex', '.bib'],
    root: NearestRoot(['.latexmkrc', 'latexmkrc']),
    binary: 'texlab',
    args: [],
    installers: [{ type: 'npm', package: 'texlab' }],
  },
  {
    id: 'dockerfile',
    extensions: ['.dockerfile', 'Dockerfile'],
    root: (_file: string, directory: string) => directory,
    binary: 'docker-langserver',
    args: ['--stdio'],
    installers: [{ type: 'npm', package: 'dockerfile-language-server-nodejs' }],
  },
  {
    id: 'gleam',
    extensions: ['.gleam'],
    root: NearestRoot(['gleam.toml']),
    binary: 'gleam',
    args: ['lsp'],
  },
  {
    id: 'clojure-lsp',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    root: NearestRoot(['deps.edn', 'project.clj', 'shadow-cljs.edn', 'bb.edn', 'build.boot']),
    binary: 'clojure-lsp',
    args: ['listen'],
    installers: [{ type: 'npm', package: 'clojure-lsp' }],
  },
  {
    id: 'nixd',
    extensions: ['.nix'],
    root: NearestRoot(['flake.nix']),
    binary: 'nixd',
    args: [],
  },
  {
    id: 'tinymist',
    extensions: ['.typ', '.typc'],
    root: NearestRoot(['typst.toml']),
    binary: 'tinymist',
    args: [],
    installers: [{ type: 'npm', package: 'tinymist' }],
  },
  {
    id: 'haskell-language-server',
    extensions: ['.hs', '.lhs'],
    root: NearestRoot(['stack.yaml', 'cabal.project', 'hie.yaml']),
    binary: 'haskell-language-server-wrapper',
    args: ['--lsp'],
    installers: [{ type: 'npm', package: 'haskell-language-server' }],
  },
  {
    id: 'julials',
    extensions: ['.jl'],
    root: NearestRoot(['Project.toml', 'Manifest.toml']),
    binary: 'julia',
    args: ['--startup-file=no', '--history-file=no', '-e', 'using LanguageServer; runserver()'],
  },
]

const EXT_TO_SERVER = new Map<string, ServerConfig>()
for (const config of SERVER_CONFIGS) {
  for (const ext of config.extensions) {
    if (!EXT_TO_SERVER.has(ext)) {
      EXT_TO_SERVER.set(ext, config)
    }
  }
}

export function findServerByExtension(ext: string): ServerConfig | undefined {
  return EXT_TO_SERVER.get(ext)
}

export function findServerById(id: string): ServerConfig | undefined {
  return SERVER_CONFIGS.find((s) => s.id === id)
}

export function existsOnDisk(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function resolveWithExt(base: string): string | undefined {
  if (existsOnDisk(base)) return base
  const exts = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : ['']
  for (const ext of exts) {
    const candidate = base + ext
    if (existsOnDisk(candidate)) return candidate
  }
  return undefined
}

export async function resolveBinary(config: ServerConfig, directory: string): Promise<string | undefined> {
  const fromPath = which(config.binary)
  if (fromPath) return fromPath

  const fromNpmLocal = resolveNpm(config.binary, directory)
  if (fromNpmLocal) return fromNpmLocal

  const fromNpmGlobal = resolveNpmGlobal(config.binary)
  if (fromNpmGlobal) return fromNpmGlobal

  return undefined
}

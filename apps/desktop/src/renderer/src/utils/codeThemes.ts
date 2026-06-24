import _github from 'highlight.js/styles/github.css?inline'
import _githubDark from 'highlight.js/styles/github-dark.css?inline'
import _atomOneLight from 'highlight.js/styles/atom-one-light.css?inline'
import _atomOneDark from 'highlight.js/styles/atom-one-dark.css?inline'
import _stackoverflowLight from 'highlight.js/styles/stackoverflow-light.css?inline'
import _stackoverflowDark from 'highlight.js/styles/stackoverflow-dark.css?inline'
import _vs from 'highlight.js/styles/vs.css?inline'
import _vs2015 from 'highlight.js/styles/vs2015.css?inline'
import _tokyoNightLight from 'highlight.js/styles/tokyo-night-light.css?inline'
import _tokyoNightDark from 'highlight.js/styles/tokyo-night-dark.css?inline'
import _intellijLight from 'highlight.js/styles/intellij-light.css?inline'
import _nord from 'highlight.js/styles/nord.css?inline'
import _rosePineDawn from 'highlight.js/styles/rose-pine-dawn.css?inline'
import _rosePine from 'highlight.js/styles/rose-pine.css?inline'
import _default from 'highlight.js/styles/default.css?inline'
import _monokai from 'highlight.js/styles/monokai.css?inline'

export const hljsCSSMap: Record<string, string> = {
  github: _github,
  'github-dark': _githubDark,
  'atom-one-light': _atomOneLight,
  'atom-one-dark': _atomOneDark,
  'stackoverflow-light': _stackoverflowLight,
  'stackoverflow-dark': _stackoverflowDark,
  vs: _vs,
  vs2015: _vs2015,
  'tokyo-night-light': _tokyoNightLight,
  'tokyo-night-dark': _tokyoNightDark,
  'intellij-light': _intellijLight,
  nord: _nord,
  'rose-pine-dawn': _rosePineDawn,
  'rose-pine': _rosePine,
  default: _default,
  monokai: _monokai,
}

export interface CodeThemePair {
  id: string
  name: string
  light: string
  dark: string
}

export const CODE_THEME_PAIRS: CodeThemePair[] = [
  { id: 'github', name: 'GitHub', light: 'github', dark: 'github-dark' },
  { id: 'atom-one', name: 'Atom One', light: 'atom-one-light', dark: 'atom-one-dark' },
  { id: 'stackoverflow', name: 'Stack Overflow', light: 'stackoverflow-light', dark: 'stackoverflow-dark' },
  { id: 'vs-code', name: 'VS Code', light: 'vs', dark: 'vs2015' },
  { id: 'tokyo-night', name: 'Tokyo Night', light: 'tokyo-night-light', dark: 'tokyo-night-dark' },
  { id: 'nord', name: 'Nord', light: 'intellij-light', dark: 'nord' },
  { id: 'rose-pine', name: 'Rose Pine', light: 'rose-pine-dawn', dark: 'rose-pine' },
  { id: 'monokai', name: 'Monokai', light: 'default', dark: 'monokai' },
]

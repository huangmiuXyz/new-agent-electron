# agent-qi

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For windows without signing
$ pnpm build:win:unsigned

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

Windows release builds are signed by default. Configure one of these before running `pnpm build:win`:

- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`
- `CSC_LINK` and `CSC_KEY_PASSWORD`

`*_LINK` can be a local path, `file://` URL, HTTPS URL, or base64-encoded certificate supported by electron-builder.

### Android

```powershell
# APK for local install
pnpm android:debug

# Release APK (unsigned unless ANDROID_KEYSTORE_* is configured)
pnpm android:release

# Release AAB
pnpm android:bundle

# Interactive build (choose mode + version at runtime)
pnpm android:interactive

# Non-interactive build with explicit version
pnpm android:release -- --version-name 1.0.2 --version-code 3
```

The Android build requires Java 21. The script will try `JAVA_HOME_21`, then Android Studio's bundled `jbr`.

For local installs, use `pnpm android:debug`.
For signed release builds, set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.

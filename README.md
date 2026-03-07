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

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

### Android

```powershell
# APK for local install
pnpm android:debug

# Release APK (unsigned unless ANDROID_KEYSTORE_* is configured)
pnpm android:release

# Release AAB
pnpm android:bundle
```

The Android build requires Java 21. The script will try `JAVA_HOME_21`, then Android Studio's bundled `jbr`.

For local installs, use `pnpm android:debug`.
For signed release builds, set `ANDROID_KEYSTORE_FILE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.

import { ref, onMounted, onUnmounted, getCurrentInstance, type Ref } from 'vue';
import { PluginLoader } from '../core/pluginLoader';

/**
 * usePlugin 选项配置
 */
export interface UsePluginOptions {
  /** 是否自动加载插件（默认 true） */
  autoLoad?: boolean;
  /** 是否延迟加载（默认 false） */
  lazy?: boolean;
  /** 加载成功回调 */
  onLoad?: (plugin: Plugin) => void;
  /** 加载失败回调 */
  onError?: (error: Error) => void;
}

/**
 * usePlugin 返回值
 */
export interface UsePluginReturn {
  /** 插件实例 */
  plugin: Ref<Plugin | null>;
  /** 是否正在加载 */
  loading: Ref<boolean>;
  /** 错误信息 */
  error: Ref<Error | null>;
  /** 是否已加载 */
  loaded: Ref<boolean>;
  /** 手动加载插件 */
  load: () => Promise<void>;
  /** 卸载插件 */
  unload: () => Promise<void>;
  /** 重新加载插件 */
  reload: () => Promise<void>;
}

/**
 * 获取插件加载器实例
 */
function getPluginLoader(): PluginLoader {
  const instance = getCurrentInstance();
  // 尝试从全局属性获取插件加载器实例
  const globalLoader = instance?.appContext.app.config.globalProperties.$pluginLoader;

  if (globalLoader) {
    return globalLoader;
  }

  // 如果没有全局实例，创建一个新的（向后兼容）
  const pinia = instance?.appContext.app.config.globalProperties.$pinia;
  return new PluginLoader(null, pinia);
}

export function usePlugin(
  name: string,
  options: UsePluginOptions = {}
): UsePluginReturn {
  const {
    autoLoad = true,
    lazy = false,
    onLoad,
    onError,
  } = options;

  // 响应式状态
  const plugin = ref<Plugin | null>(null);
  const loading = ref<boolean>(false);
  const error = ref<Error | null>(null);
  const loaded = ref<boolean>(false);

  // 获取插件加载器实例
  const loader = getPluginLoader();

  // 保存插件名称用于卸载和重新加载
  const pluginName = ref<string | null>(null);

  /**
   * 加载插件
   */
  const load = async (): Promise<void> => {
    // 如果插件已加载，直接返回
    if (loaded.value && plugin.value) {
      return;
    }

    // 如果正在加载，等待完成
    if (loading.value) {
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const pluginInfo = await loader.loadPlugin(name);
      plugin.value = pluginInfo.plugin;
      pluginName.value = pluginInfo.plugin.name;
      loaded.value = true;

      // 调用加载成功回调
      if (onLoad && plugin.value) {
        onLoad(plugin.value);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      error.value = errorObj;
      loaded.value = false;

      // 调用加载失败回调
      if (onError) {
        onError(errorObj);
      }
    } finally {
      loading.value = false;
    }
  };

  /**
   * 卸载插件
   */
  const unload = async (): Promise<void> => {
    if (!pluginName.value) {
      return;
    }

    try {
      await loader.unloadPlugin(pluginName.value);
      plugin.value = null;
      pluginName.value = null;
      loaded.value = false;
      error.value = null;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      error.value = errorObj;

      // 调用加载失败回调
      if (onError) {
        onError(errorObj);
      }
    }
  };

  /**
   * 重新加载插件
   */
  const reload = async (): Promise<void> => {
    const currentPluginName = pluginName.value;

    // 先卸载（如果已加载）
    if (currentPluginName) {
      await unload();
    }

    // 重新加载
    await load();
  };

  // 组件挂载时的处理
  onMounted(() => {
    if (autoLoad && !lazy) {
      load();
    }
  });

  // 组件卸载时自动卸载插件
  onUnmounted(async () => {
    if (pluginName.value && loaded.value) {
      try {
        await unload();
      } catch (err) {
        console.error('Failed to unload plugin on unmount:', err);
      }
    }
  });

  return {
    plugin,
    loading,
    error,
    loaded,
    load,
    unload,
    reload,
  };
}

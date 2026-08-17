/**
 * plugin-host —— F-PLUGIN v1 本地插件宿主(纯逻辑 + 契约)。
 *
 * 设计:
 * - 插件目录:vault 内 `.open-llm-wiki/plugins/<id>/`
 * - 清单:`plugin.json`(id/name/version/main/permissions)
 * - 运行:宿主加载 main 脚本进 iframe sandbox,经 postMessage 调白名单 API
 * - v1 权限:`commands.register` / `notes.read` / `ui.notify`(无任意 fs/net)
 *
 * 本模块 IO-free:解析清单、校验权限、合并命令表;加载/沙箱在 UI 层。
 */

export const PLUGIN_ROOT = ".open-llm-wiki/plugins";

/** v1 可声明权限。 */
export type PluginPermission =
  | "commands.register"
  | "notes.read"
  | "ui.notify";

export const ALL_PERMISSIONS: readonly PluginPermission[] = [
  "commands.register",
  "notes.read",
  "ui.notify",
] as const;

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** 相对插件目录的入口脚本,默认 main.js */
  main: string;
  description?: string;
  permissions: PluginPermission[];
  /** 默认启用 */
  enabled?: boolean;
}

export interface PluginCommand {
  pluginId: string;
  id: string;
  label: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  /** 相对 vault 的入口路径 */
  entryPath: string;
  enabled: boolean;
  commands: PluginCommand[];
}

export class PluginManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginManifestError";
  }
}

/** 解析并校验 plugin.json 文本。 */
export function parsePluginManifest(raw: string): PluginManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new PluginManifestError("plugin.json is not valid JSON");
  }
  if (typeof data !== "object" || data === null) {
    throw new PluginManifestError("plugin.json must be an object");
  }
  const o = data as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  const version = String(o.version ?? "").trim();
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    throw new PluginManifestError("invalid plugin id");
  }
  if (!name) throw new PluginManifestError("missing name");
  if (!version) throw new PluginManifestError("missing version");
  const main =
    typeof o.main === "string" && o.main.trim()
      ? o.main.trim().replace(/\\/g, "/")
      : "main.js";
  if (main.includes("..")) {
    throw new PluginManifestError("main path must not contain ..");
  }
  const permsRaw = Array.isArray(o.permissions) ? o.permissions : [];
  const permissions: PluginPermission[] = [];
  for (const p of permsRaw) {
    if (typeof p !== "string") continue;
    if ((ALL_PERMISSIONS as readonly string[]).includes(p)) {
      permissions.push(p as PluginPermission);
    }
  }
  return {
    id,
    name,
    version,
    main,
    description: typeof o.description === "string" ? o.description : undefined,
    permissions,
    enabled: o.enabled !== false,
  };
}

/** vault 相对路径:插件入口。 */
export function pluginEntryPath(pluginId: string, main: string): string {
  return `${PLUGIN_ROOT}/${pluginId}/${main}`.replace(/\/+/g, "/");
}

/** 是否允许某权限。 */
export function hasPermission(
  m: PluginManifest,
  perm: PluginPermission,
): boolean {
  return m.permissions.includes(perm);
}

/**
 * 注册命令(纯函数)。无 commands.register 权限 → 抛错。
 * 命令 id 在宿主侧加插件前缀,避免冲突。
 */
export function registerPluginCommand(
  plugin: LoadedPlugin,
  cmd: { id: string; label: string },
): LoadedPlugin {
  if (!hasPermission(plugin.manifest, "commands.register")) {
    throw new PluginManifestError(
      `plugin ${plugin.manifest.id} lacks commands.register`,
    );
  }
  const id = cmd.id.trim();
  const label = cmd.label.trim();
  if (!id || !label) throw new PluginManifestError("command id/label required");
  const fullId = `${plugin.manifest.id}.${id}`;
  const commands = [
    ...plugin.commands.filter((c) => c.id !== fullId),
    { pluginId: plugin.manifest.id, id: fullId, label },
  ];
  return { ...plugin, commands };
}

/** 从清单构造未激活的 LoadedPlugin。 */
export function loadPluginFromManifest(manifest: PluginManifest): LoadedPlugin {
  return {
    manifest,
    entryPath: pluginEntryPath(manifest.id, manifest.main),
    enabled: manifest.enabled !== false,
    commands: [],
  };
}

/** 合并所有启用插件的命令(供 ⌘K)。 */
export function collectPluginCommands(
  plugins: readonly LoadedPlugin[],
): PluginCommand[] {
  return plugins.filter((p) => p.enabled).flatMap((p) => p.commands);
}

/**
 * 宿主 → iframe 请求 envelope。
 * 插件只能回 `commands.register` / `ui.notify` 等白名单 method。
 */
export type HostToPlugin =
  | { type: "init"; pluginId: string; permissions: PluginPermission[] }
  | { type: "note"; path: string; content: string }
  | { type: "dispose" };

export type PluginToHost =
  | {
      type: "registerCommand";
      id: string;
      label: string;
    }
  | { type: "notify"; message: string }
  | { type: "ready" }
  | { type: "error"; message: string };

/** 校验插件上行消息。 */
export function parsePluginMessage(data: unknown): PluginToHost | null {
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  const type = o.type;
  if (type === "ready") return { type: "ready" };
  if (type === "error" && typeof o.message === "string") {
    return { type: "error", message: o.message };
  }
  if (
    type === "registerCommand" &&
    typeof o.id === "string" &&
    typeof o.label === "string"
  ) {
    return { type: "registerCommand", id: o.id, label: o.label };
  }
  if (type === "notify" && typeof o.message === "string") {
    return { type: "notify", message: o.message };
  }
  return null;
}

/** 示例插件清单(文档/测试用)。 */
export function sampleHelloManifest(): PluginManifest {
  return {
    id: "hello",
    name: "Hello Open LLM Wiki",
    version: "0.1.0",
    main: "main.js",
    description: "Sample plugin: registers a palette command.",
    permissions: ["commands.register", "ui.notify"],
    enabled: true,
  };
}

/** 示例插件 main.js 源码(iframe 内执行;仅 postMessage API)。 */
export function sampleHelloMainSource(): string {
  return `// Open LLM Wiki sample plugin (sandboxed)
parent.postMessage({ type: "ready" }, "*");
parent.postMessage({
  type: "registerCommand",
  id: "greet",
  label: "Hello from plugin",
}, "*");
`;
}

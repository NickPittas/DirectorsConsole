import { isAbsolute, relative, resolve, sep } from "node:path";

export function buildCodexStartupPolicy({ codexHome, cwd }: { codexHome: string; cwd: string }): {
  config: string[];
  permissions: "directors_console";
  cwd: string;
  codexHome: string;
} {
  function validatePath(value: string): string {
    if (typeof value !== "string" || value.length > 2048 || value.includes("\0") ||
        value.trim() !== value || !isAbsolute(value) || resolve(value) !== value)
      throw new Error("Invalid Codex policy path.");
    return value;
  }

  const normalizedCodexHome = validatePath(codexHome);
  const normalizedCwd = validatePath(cwd);
  const workspaceRoot = resolve(normalizedCodexHome, "workspaces");
  const workspaceRelative = relative(workspaceRoot, normalizedCwd);
  if (!workspaceRelative || workspaceRelative === ".." || workspaceRelative.startsWith(`..${sep}`) ||
      isAbsolute(workspaceRelative))
    throw new Error("Invalid Codex policy path.");

  return {
    config: [
      'model_provider="openai"',
      "features.shell_tool=false",
      "features.shell_snapshot=false",
      "features.view_image=false",
      "features.multi_agent=false",
      "features.multi_agent_v2=false",
      "features.sleep_tool=false",
      "features.plugins=false",
      "features.enable_mcp_apps=false",
      "features.in_app_browser=false",
      "features.browser_use=false",
      "features.browser_use_external=false",
      "features.browser_use_full_cdp_access=false",
      "features.computer_use=false",
      "features.remote_plugin=false",
      "features.skill_search=false",
      "features.skill_mcp_dependency_install=false",
      "features.tool_suggest=false",
      "features.request_permissions_tool=false",
      'web_search="disabled"',
      "project_doc_max_bytes=0",
      "apps._default.enabled=false",
      "plugins._default.enabled=false",
      "mcp_servers={}",
      'default_permissions="directors_console"',
      `permissions.directors_console.filesystem={ "/"="deny", ":minimal"="read", ${JSON.stringify(normalizedCwd)}="read" }`,
      "permissions.directors_console.network.enabled=false",
    ],
    permissions: "directors_console",
    cwd: normalizedCwd,
    codexHome: normalizedCodexHome,
  };
}

import "server-only";

/** 仅在 Node.js instrumentation 运行时调用，勿在 Edge 中引用。 */
export function setupConsoleFileLogging(): void {
  const nodeRequire = eval("require") as NodeRequire;
  const pathMod = nodeRequire("path") as typeof import("path");
  const runtimePath = pathMod.join(process.cwd(), "lib", "alice-server-logger-runtime.cjs");
  nodeRequire(runtimePath).initAliceConsoleFileLogging();
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initMdataConsoleFileLogging } = await import("@/lib/mdata-server-logger");
  initMdataConsoleFileLogging();
}

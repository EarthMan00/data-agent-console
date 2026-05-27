export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { setupConsoleFileLogging } = await import("@/lib/instrumentation-console-log");
    setupConsoleFileLogging();
  } catch (err) {
    console.warn("[mdata] console file logging disabled:", err);
  }
}

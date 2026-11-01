// Keep a stalled network request from leaving the roster dialog loading forever.
export async function loadRosterRunsheet(db: any, eventId: string, timeoutMs = 15_000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result: any = await Promise.race([
      db.functions.invoke("roster-runsheet-view", { body: { eventId }, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("The run sheet took too long to load. Please try again."));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
    if (result.error) throw new Error(result.error.message || "Could not load the run sheet.");
    if (result.data?.error) throw new Error(result.data.error);
    if (!result.data?.rs) throw new Error("This run sheet is unavailable or has not been emailed yet.");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}
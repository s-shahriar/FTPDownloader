export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function abortError(): Error {
  const err = new Error('Cancelled');
  err.name = 'AbortError';
  return err;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()); }, { once: true });
  });
}

export function sleepWithCountdown(
  ms: number,
  onTick: (remaining: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const end = Date.now() + ms;
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const tick = () => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining <= 0) {
        signal?.removeEventListener('abort', onAbort);
        onTick(0);
        resolve();
      } else {
        onTick(remaining);
        timer = setTimeout(tick, 1000);
      }
    };
    tick();
  });
}

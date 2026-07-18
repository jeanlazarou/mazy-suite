// Runs the Go WASM mastering engine off the main thread so processing a
// large file cannot freeze the UI. Calls arrive as {id, method, args}
// messages; replies are {id, result} or {id, error}. Float32Array results
// are transferred back without copying.

declare const self: Worker & Record<string, any>;

// Where the app's static files live (set by the first __ready message —
// the app may be deployed under a subpath, and this worker script itself
// is served from assets/, so it cannot derive the app root on its own).
let assetBase = '/';

let readyPromise: Promise<void> | null = null;

function loadEngine(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      // wasm_exec.js is copied from GOROOT into public/ by build.sh, so it
      // always matches the Go toolchain that built engine.wasm. It's a plain
      // script (not a module), and Vite blocks importing public files, so
      // fetch it and evaluate in the worker's global scope.
      const src = await (await fetch(new URL('wasm_exec.js', assetBase))).text();
      (0, eval)(src);

      const go = new self.Go();
      const result = await WebAssembly.instantiateStreaming(
        fetch(new URL('engine.wasm', assetBase)),
        go.importObject
      );

      const ready = new Promise<void>((resolve) => {
        self.addEventListener('wasmReady', () => resolve(), { once: true });
        // Fallback if the CustomEvent doesn't fire: poll for a registered
        // function.
        const poll = setInterval(() => {
          if (typeof self.wasmGetParams === 'function') {
            clearInterval(poll);
            resolve();
          }
        }, 50);
      });

      // go.run blocks for the lifetime of the engine; never await it.
      go.run(result.instance).then(() => {
        console.error('Go WASM runtime exited unexpectedly');
        readyPromise = null;
      });

      await ready;
    })();
  }
  return readyPromise;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, method, args } = e.data;
  try {
    if (method === '__ready') {
      // First message; carries the app base URL for asset fetches.
      if (args?.[0]) assetBase = args[0];
      await loadEngine();
      self.postMessage({ id, result: true });
      return;
    }
    await loadEngine();
    const fn = self[method];
    if (typeof fn !== 'function') {
      throw new Error(`unknown WASM function: ${method}`);
    }
    const result = fn(...args);
    const transfer = result instanceof Float32Array ? [result.buffer] : [];
    self.postMessage({ id, result }, transfer);
  } catch (err: any) {
    self.postMessage({ id, error: err?.message ?? String(err) });
  }
};

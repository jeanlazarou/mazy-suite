export interface ProcessorParams {
  [processor: string]: { [param: string]: number };
}

export interface PresetInfo {
  name: string;
  category: string;
  description: string;
  tags: string[];
}

export interface MeterData {
  [processor: string]: {
    max_gr_db: number;
    avg_gr_db: number;
  };
}

export interface AnalysisResult {
  spectrum: {
    frequencies: number[];
    magnitudes: number[];
    peak_freq: number;
    peak_mag: number;
    spectral_balance: string;
  };
  dynamics: {
    peak_db: number;
    rms_db: number;
    dynamic_range_db: number;
    crest_factor_db: number;
    histogram: number[];
  };
  stereo_field: {
    correlation: number;
    width: number;
    balance: number;
    mid_rms_db: number;
    side_rms_db: number;
  } | null;
  loudness: {
    integrated_lufs: number;
    momentary_max_lufs: number;
    momentary_min_lufs: number;
    short_term_max_lufs: number;
    loudness_range_lu: number;
    true_peak_dbtp: number;
  };
  duration: number;
  sample_rate: number;
  channels: number;
}

export interface Recommendation {
  target: string;
  suggestions: {
    category: string;
    description: string;
    priority: string;
    auto_apply: boolean;
  }[];
  processors: ProcessorParams;
}

interface PendingCall {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

/**
 * Async client for the Go WASM engine, which runs in a Web Worker so heavy
 * processing never blocks the UI thread. Float32Array arguments are
 * transferred to the worker (consumed); create a fresh copy per call.
 */
export class AudioEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    if (!this.worker) {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const call = this.pending.get(id);
        if (!call) return;
        this.pending.delete(id);
        if (error) call.reject(new Error(error));
        else call.resolve(result);
      };
      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'WASM worker error');
        for (const call of this.pending.values()) call.reject(err);
        this.pending.clear();
      };
    }
    // Tell the worker where the app's static files live — the app may be
    // deployed under a subpath (import.meta.env.BASE_URL is './' with a
    // relative base, so resolve it against the page URL).
    const assetBase = new URL(import.meta.env.BASE_URL, window.location.href).href;
    await this.call('__ready', [assetBase]);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  private call<T>(method: string, args: any[], transfer: Transferable[] = []): Promise<T> {
    if (!this.worker) return Promise.reject(new Error('WASM worker not started'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ id, method, args }, transfer);
    });
  }

  initEngine(sampleRate: number, channels: number): Promise<void> {
    return this.call('wasmInitEngine', [sampleRate, channels]);
  }

  processBuffer(data: Float32Array, channels: number, sampleRate: number): Promise<Float32Array> {
    return this.call('wasmProcessBuffer', [data, channels, sampleRate], [data.buffer]);
  }

  async setParam(processor: string, param: string, value: number): Promise<void> {
    const err = await this.call<string | null>('wasmSetParam', [processor, param, value]);
    if (err) console.warn('setParam error:', err);
  }

  async getParams(): Promise<ProcessorParams> {
    return JSON.parse(await this.call<string>('wasmGetParams', []));
  }

  async getMeters(): Promise<MeterData> {
    return JSON.parse(await this.call<string>('wasmGetMeters', []));
  }

  measureLoudness(data: Float32Array, channels: number, sampleRate: number): Promise<number> {
    return this.call('wasmMeasureLoudness', [data, channels, sampleRate], [data.buffer]);
  }

  /** 400ms BS.1770 gating blocks of a buffer; concatenate across tracks
   *  and pass to gatedLoudness to integrate an album as one program. */
  async measureBlocks(data: Float32Array, channels: number, sampleRate: number): Promise<number[]> {
    return JSON.parse(await this.call<string>('wasmMeasureBlocks', [data, channels, sampleRate], [data.buffer]));
  }

  gatedLoudness(blocks: number[]): Promise<number> {
    return this.call('wasmGatedLoudness', [JSON.stringify(blocks)]);
  }

  setProcessorEnabled(name: string, enabled: boolean): Promise<void> {
    return this.call('wasmSetProcessorEnabled', [name, enabled]);
  }

  async analyzeBuffer(data: Float32Array, channels: number, sampleRate: number): Promise<AnalysisResult> {
    const json = await this.call<string>('wasmAnalyzeBuffer', [data, channels, sampleRate], [data.buffer]);
    return JSON.parse(json);
  }

  /** Like analyzeBuffer, but does not become the reference analysis that
   *  recommendations derive from. Use for processed audio. */
  async inspectBuffer(data: Float32Array, channels: number, sampleRate: number): Promise<AnalysisResult> {
    const json = await this.call<string>('wasmInspectBuffer', [data, channels, sampleRate], [data.buffer]);
    return JSON.parse(json);
  }

  async getRecommendations(target: string): Promise<Recommendation> {
    return JSON.parse(await this.call<string>('wasmGetRecommendations', [target]));
  }

  /** Recommendations based on an aggregate of per-track analyses, suiting
   *  the album as a whole rather than one track. */
  async getAlbumRecommendations(analyses: AnalysisResult[], target: string): Promise<Recommendation> {
    return JSON.parse(await this.call<string>('wasmGetAlbumRecommendations', [JSON.stringify(analyses), target]));
  }

  applyRecommendations(target: string): Promise<void> {
    return this.call('wasmApplyRecommendations', [target]);
  }

  async listPresets(): Promise<PresetInfo[]> {
    return JSON.parse(await this.call<string>('wasmListPresets', []));
  }

  async applyPreset(name: string): Promise<void> {
    const err = await this.call<string | null>('wasmApplyPreset', [name]);
    if (err) console.warn('applyPreset error:', err);
  }

  async listTargets(): Promise<Record<string, any>> {
    return JSON.parse(await this.call<string>('wasmListTargets', []));
  }

  reset(): Promise<void> {
    return this.call('wasmReset', []);
  }
}

export const engine = new AudioEngine();

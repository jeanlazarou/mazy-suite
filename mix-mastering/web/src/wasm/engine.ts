export interface ProcessorParams {
  [processor: string]: { [param: string]: number };
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

// Signal at one stage of the chain, reduced by the Go side to a bucketed
// min/max/RMS envelope (ready to draw) plus overall peak/RMS levels, and
// optionally a spectrogram over log-spaced bands.
export interface StageSummary {
  name: string;
  mins: number[];
  maxs: number[];
  rms: number[];
  peak_db: number;
  rms_db: number;
  spec_db?: number[][]; // [time column][band] peak level in dBFS
  spec_freqs?: number[]; // band centers in Hz
}

// One style ("what is it?") or destination ("where will it be heard?")
// offered by the Go recipe builder (pkg/recipe).
export interface RecipeOption {
  id: string;
  name: string;
  description: string;
  group?: 'release' | 'device'; // destinations only
  target_lufs?: number; // destinations only
  ceiling_dbtp?: number; // destinations only
}

export interface RecipeOptions {
  styles: RecipeOption[];
  destinations: RecipeOption[];
}

export interface RecipeChoice {
  style: string; // '' = no style
  destination: string;
  fix: boolean;
}

/** Complete chain settings for a RecipeChoice: every param of every
 *  processor plus bypass state, so applying one never leaves values
 *  behind from an earlier choice. */
export interface Recipe extends RecipeChoice {
  summary: string;
  notes: { layer: 'style' | 'destination' | 'fix'; text: string }[];
  fixes: number;
  target_lufs: number;
  ceiling_dbtp: number;
  processors: ProcessorParams;
  enabled: Record<string, boolean>;
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

  /** Like processBuffer, but also captures the signal at every stage of
   *  the chain ("Input" + each enabled processor) as drawable envelope
   *  summaries. buckets is the envelope resolution in columns; specCols
   *  > 0 additionally computes a spectrogram per stage. */
  async processBufferStages(
    data: Float32Array, channels: number, sampleRate: number, buckets: number, specCols = 0,
  ): Promise<{ output: Float32Array; stages: StageSummary[] }> {
    const res = await this.call<{ output: Float32Array; stages: string }>(
      'wasmProcessBufferStages', [data, channels, sampleRate, buckets, specCols], [data.buffer]);
    return { output: res.output, stages: JSON.parse(res.stages) };
  }

  async setParam(processor: string, param: string, value: number): Promise<void> {
    const err = await this.call<string | null>('wasmSetParam', [processor, param, value]);
    if (err) console.warn('setParam error:', err);
  }

  async getParams(): Promise<ProcessorParams> {
    return JSON.parse(await this.call<string>('wasmGetParams', []));
  }

  /** Chain processor names in real signal-flow order (Go map JSON is
   *  alphabetical, so this is the only way to learn chain order). Drives
   *  the studio pipeline strip so it can't drift from the real chain. */
  async getProcessorNames(): Promise<string[]> {
    return JSON.parse(await this.call<string>('wasmGetProcessorNames', []));
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

  /** Same analysis as analyzeBuffer; used for processed audio. */
  async inspectBuffer(data: Float32Array, channels: number, sampleRate: number): Promise<AnalysisResult> {
    const json = await this.call<string>('wasmInspectBuffer', [data, channels, sampleRate], [data.buffer]);
    return JSON.parse(json);
  }

  async getRecipeOptions(): Promise<RecipeOptions> {
    return JSON.parse(await this.call<string>('wasmRecipeOptions', []));
  }

  /** Builds (does not apply) the settings for a choice. analyses: the
   *  active track's analysis, or every track's for an album (aggregated
   *  Go-side so the settings suit the whole record). */
  async buildRecipe(choice: RecipeChoice, analyses: AnalysisResult[]): Promise<Recipe | { error: string }> {
    return JSON.parse(await this.call<string>('wasmBuildRecipe', [JSON.stringify(choice), JSON.stringify(analyses)]));
  }

  reset(): Promise<void> {
    return this.call('wasmReset', []);
  }
}

export const engine = new AudioEngine();

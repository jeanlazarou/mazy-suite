export interface FontMatrixEntry {
    name: string;
    strokeDashoffset: number;
  }
  
  export interface FontMatrix {
    [key: string]: FontMatrixEntry;
  }
  
  export interface AnimationStartConfig {
    startStrokeDashoffset: number;
    startStrokeWidth: number;
    startStroke: string;
    startFill: string;
  }
  
  export interface AnimationEndConfig {
    endStrokeDashoffset: number;
    endStrokeWidth: number;
    endStroke: string;
    endFill: string;
  }
  
  export interface AnimationDurations {
    strokeDashoffsetDuration: number;
    strokeWidthDuration: number;
    strokeDuration: number;
    fillDuration: number;
  }
  
  export interface InitializationConfiguration {
    svgId: string;
    font: string;
    fontSize: string;
    start: AnimationStartConfig;
    end: AnimationEndConfig;
    durations: AnimationDurations;
    totalWaitTimeForFinalization?: number;
  }
  
  export interface TextElementAttributes {
    x: string;
    y: string;
    textAnchor: string;
    dominantBaseline: string;
    fontSize: string;
  }
  
  export interface WriteConfiguration {
    eachLetterDelay: number;
    delayOperation: number;
  }
  
  export interface WritingConfiguration {
    textElementAttributes?: Partial<TextElementAttributes>;
    writeConfiguration?: Partial<WriteConfiguration>;
  }
  
  export interface EraseConfiguration {
    delayEraseStrokeDashoffset?: number;
    delayEraseStrokeWidth?: number;
    delayEraseStroke?: number;
    delayEraseFill?: number;
    delayOperation?: number;
  }
  
import { InitializationConfiguration, WritingConfiguration, EraseConfiguration } from './types';
import { initialize } from "./initialize";
import { write, erase } from "./operations/operations";

export class Manuscript {
  private initializationConfiguration: InitializationConfiguration;
  private svgId: string;

  constructor(initializationConfiguration: InitializationConfiguration) {
    this.initializationConfiguration = initialize(initializationConfiguration);
    this.svgId = initializationConfiguration.svgId;
  }

  write(text: string, writingConfiguration?: WritingConfiguration): string {
    return write(
      this.svgId,
      text,
      this.initializationConfiguration,
      writingConfiguration
    );
  }

  erase(textId: string, eraseConfiguration?: EraseConfiguration): void {
    erase(
      this.svgId,
      textId,
      this.initializationConfiguration,
      eraseConfiguration
    );
  }
}
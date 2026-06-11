if (typeof window !== "undefined") throw new Error("server-side only")

export interface CompressionResult {
  original: string
  compressed: string
  originalTokenEstimate: number
  compressedTokenEstimate: number
  reductionPercent: number
  layers: LayerResult[]
}

export interface LayerResult {
  name: string
  inputLength: number
  outputLength: number
  itemsRemoved: number
}

export interface CompressionOptions {
  maxTokens?: number            // target max tokens (default: none)
  enableStructural?: boolean    // layer 1 (default: true)
  enableSummarization?: boolean // layer 2 (default: true)
  enableDedup?: boolean         // layer 3 (default: true)
  summaryMaxLength?: number     // max chars per summary (default: 200)
}

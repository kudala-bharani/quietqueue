/** Open-weight embeddings; all task inference runs in this browser, not a hosted API. */
import { CONTEXTS } from './core.mjs';
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
let extractorPromise;
export async function loadEmbeddings(texts, onProgress = () => {}) {
  if (!Array.isArray(texts) || !texts.length || texts.length > 60) throw new Error('The model accepts between 1 and 60 task lines.');
  if (!extractorPromise) {
    onProgress('Loading the open-source inference library…');
    extractorPromise = (async () => {
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      return pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8', device: 'wasm',
        progress_callback: p => {
          if (p.status === 'progress') onProgress(`Downloading model files${Number.isFinite(p.progress) ? ` · ${Math.round(p.progress)}% of ${p.file || 'current file'}` : '…'}`);
          else if (p.status === 'ready') onProgress('Model ready. Grouping on your device…');
          else if (p.status === 'initiate') onProgress('Downloading model files. The first run can take a moment…');
        }
      });
    })().catch(error => { console.error('QuietQueue model loader:', error.message); extractorPromise = undefined; throw error; });
  }
  const extractor = await extractorPromise;
  onProgress('Finding related tasks on your device…');
  const result = await extractor([...texts, ...CONTEXTS.map(c => c.anchor)], { pooling: 'mean', normalize: true });
  const vectors = result.tolist();
  if (vectors.length !== texts.length + CONTEXTS.length) throw new Error('Incomplete model output.');
  onProgress('Local AI grouping is ready.');
  return { vectors: vectors.slice(0, texts.length), contexts: vectors.slice(texts.length) };
}

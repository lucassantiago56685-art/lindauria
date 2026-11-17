/**
 * Prepara os arquivos do rastreamento de rosto para rodar 100% LOCAL e OFFLINE:
 *  1. copia o WebAssembly do MediaPipe de node_modules para public/mediapipe/wasm
 *  2. baixa (uma única vez) o modelo face_landmarker.task para public/models
 * Depois disso o app não precisa de nenhum servidor externo para rastrear o rosto.
 */
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
const require = createRequire(import.meta.url);

// 1) wasm
const pkgDir = dirname(require.resolve('@mediapipe/tasks-vision'));
const wasmSrc = join(pkgDir, 'wasm');
const wasmDst = join(pub, 'mediapipe', 'wasm');
mkdirSync(wasmDst, { recursive: true });
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log('[setup-assets] wasm do MediaPipe copiado');

// 2) modelo
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelDst = join(pub, 'models', 'face_landmarker.task');
if (existsSync(modelDst) && statSync(modelDst).size > 1_000_000) {
  console.log('[setup-assets] modelo já existe');
} else {
  mkdirSync(dirname(modelDst), { recursive: true });
  console.log('[setup-assets] baixando modelo de rosto (~3,7 MB, só na primeira vez)...');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`[setup-assets] falha ao baixar modelo: HTTP ${res.status}`);
    process.exit(1);
  }
  writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
  console.log('[setup-assets] modelo salvo em public/models');
}

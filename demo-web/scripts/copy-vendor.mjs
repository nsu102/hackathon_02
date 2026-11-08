// Copies browser runtime files that must be served as static files (not bundled):
// MediaPipe's WebAssembly, the pdf.js worker, and pdf.js CMaps/standard fonts (needed for Korean PDFs),
// image-decoder wasm and ICC profiles.
// Runs after `npm install` (postinstall) and before `dev`/`build`. Output: public/vendor (git-ignored).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(modules, '@mediapipe/tasks-vision/wasm'), join(out, 'mediapipe'), { recursive: true });
// legacy 빌드: 구형 Safari에도 있는 기능만 쓰도록 폴리필이 들어 있다(src/lib/pdf.ts와 맞춤)
cpSync(join(modules, 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
cpSync(join(modules, 'pdfjs-dist/cmaps'), join(out, 'cmaps'), { recursive: true });
cpSync(join(modules, 'pdfjs-dist/standard_fonts'), join(out, 'standard_fonts'), { recursive: true });
cpSync(join(modules, 'pdfjs-dist/wasm'), join(out, 'pdf-wasm'), { recursive: true });
cpSync(join(modules, 'pdfjs-dist/iccs'), join(out, 'iccs'), { recursive: true });
console.log('vendor files copied to public/vendor');

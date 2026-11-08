// pdf.js로 PDF를 열고 쪽마다 글자를 뽑는다. 파일은 브라우저 안에서만 읽고 서버로 보내지 않는다.
// pdf.js는 브라우저 API를 쓰므로 필요할 때만 불러온다(서버 렌더링에서 import하지 않음).
// 최신 빌드는 Iterator 헬퍼를 써서 구형 Safari(“Can't find variable: Iterator”)에서 멈추므로, 폴리필이 든 legacy 빌드를 쓴다.
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export type PdfPageText = { page: number; text: string };
export type LoadedPdf = { doc: PDFDocumentProxy; name: string; pages: PdfPageText[] };

export const MAX_PAGES = 300;
export const MAX_BYTES = 40 * 1024 * 1024;

let lib: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;
async function pdfjs() {
  if (!lib) {
    lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  }
  return lib;
}

type Item = Pick<TextItem, "str" | "hasEOL" | "transform" | "width" | "height">;

/** 글자 조각들을 이어 붙인다. 조각 사이 간격이 글자 크기의 15%를 넘으면 띄어쓰기로 본다(한글 PDF 대응). */
function joinItems(items: Item[]): string {
  let out = "";
  let prev: Item | null = null;
  for (const item of items) {
    if (prev && !out.endsWith("\n")) {
      const sameLine = Math.abs(item.transform[5] - prev.transform[5]) < Math.max(2, prev.height * 0.5);
      if (!sameLine) out += "\n";
      else {
        const gap = item.transform[4] - (prev.transform[4] + prev.width);
        const size = Math.max(1, Math.abs(prev.transform[0]) || prev.height);
        if (gap > size * 0.15 && !out.endsWith(" ") && !item.str.startsWith(" ")) out += " ";
      }
    }
    // 일부 PDF(크롬으로 인쇄한 PDF 등)는 띄어쓰기를 제어 문자(\u0001)로 담는다 → 공백으로
    out += item.str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
    if (item.hasEOL) out += "\n";
    prev = item;
  }
  return out.replace(/ {2,}/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** PDF와 워커 자원을 놓는다 */
export function closePdf(doc: PDFDocumentProxy) {
  void doc.loadingTask.destroy();
}

export async function openPdf(file: File | ArrayBuffer, name: string, onProgress?: (done: number, total: number) => void): Promise<LoadedPdf> {
  const data = file instanceof File ? await file.arrayBuffer() : file;
  if (data.byteLength > MAX_BYTES) throw new Error("PDF는 40MB까지 열 수 있어요.");
  const pdf = await pdfjs();
  let doc: PDFDocumentProxy;
  try {
    doc = await pdf.getDocument({
      data: new Uint8Array(data),
      cMapUrl: "/vendor/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/vendor/standard_fonts/",
      wasmUrl: "/vendor/pdf-wasm/",
      iccUrl: "/vendor/iccs/",
    }).promise;
  } catch (error) {
    const message = error instanceof Error && error.name === "PasswordException" ? "암호가 걸린 PDF는 열 수 없어요." : "PDF를 열지 못했어요. 파일이 손상되지 않았는지 확인해주세요.";
    throw new Error(message);
  }
  if (doc.numPages > MAX_PAGES) {
    await doc.loadingTask.destroy();
    throw new Error(`데모에서는 ${MAX_PAGES}쪽까지 열 수 있어요.`);
  }
  const pages: PdfPageText[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push({ page: n, text: joinItems(content.items.filter((i): i is TextItem => "str" in i)) });
    onProgress?.(n, doc.numPages);
  }
  return { doc, name, pages };
}

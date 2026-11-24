"use client";

/**
 * Render every page of a PDF (URL) to a PNG data URL with pdf.js — used to
 * print stored PDFs inside the HTML Order Form. scale 2 ≈ 150 dpi on Letter.
 */
export async function pdfUrlToImages(url, { scale = 2 } = {}) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  // pdf.js v6: cleanup lives on the loading task (PDFDocumentProxy has no destroy()).
  const task = pdfjs.getDocument({ url });
  const pages = [];
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      pages.push(canvas.toDataURL("image/png"));
    }
  } finally {
    // Never let cleanup throw away the rendered pages.
    try { await task.destroy(); } catch { /* ignore cleanup errors */ }
  }
  return pages;
}
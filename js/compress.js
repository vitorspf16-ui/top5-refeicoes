import { IMG } from "./config.js";
export const fmt = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

export function validar(file) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  if (!IMG.tipos.includes(file.type)) throw new Error("Formato não aceito. Use JPG, PNG ou WebP.");
  if (file.size > IMG.maxOriginalBytes) throw new Error(`Arquivo muito grande (${fmt(file.size)}). O máximo é ${fmt(IMG.maxOriginalBytes)}.`);
}

async function decodificar(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* tenta o método abaixo */ }
  }
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img; }
  catch (e) { throw new Error("Não foi possível ler esta imagem. Ela pode estar corrompida."); }
  finally { URL.revokeObjectURL(url); }
}

const paraBlob = (canvas, q) => new Promise(res => canvas.toBlob(res, "image/webp", q));

// Redimensiona (sem distorcer, máx. 800x800) e converte para WebP. Só o resultado é mantido.
export async function comprimir(file) {
  validar(file);
  const img = await decodificar(file);
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, IMG.maxLado / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  let q = IMG.qualidadeInicial, blob;
  for (;;) {
    blob = await paraBlob(c, q);
    if (!blob || blob.type !== "image/webp") throw new Error("Este navegador não consegue gerar WebP. Atualize-o ou use outro.");
    if (blob.size <= IMG.alvoBytes || q - IMG.passo < IMG.qualidadeMinima - 1e-9) break;
    q = Math.round((q - IMG.passo) * 100) / 100;
  }
  return { blob, largura: w, altura: h, qualidade: q, tamanhoOriginal: file.size, tamanhoFinal: blob.size, acimaDoAlvo: blob.size > IMG.alvoBytes };
}

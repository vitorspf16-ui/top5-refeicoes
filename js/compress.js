import { IMG } from "./config.js";
export const fmt = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

export const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const ROTULO = { "image/webp": "WebP", "image/jpeg": "JPEG", "image/png": "PNG" };
const ehHeic = f => /hei[cf]/i.test(f.type || "") || /\.hei[cf]$/i.test(f.name || "");

export function validar(file) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  // HEIC/HEIF entra para tentarmos decodificar (Safari consegue) e explicarmos a incompatibilidade nos demais.
  const ok = IMG.tipos.includes(file.type) || ehHeic(file) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name || ""));
  if (!ok) throw new Error("Formato não reconhecido. Escolha uma foto JPG, PNG, WebP ou HEIC/HEIF.");
  if (file.size === 0) throw new Error("O arquivo está vazio. Escolha outra foto.");
  if (file.size > IMG.maxOriginalBytes) throw new Error(`Arquivo muito grande (${fmt(file.size)}). O máximo é ${fmt(IMG.maxOriginalBytes)}.`);
}

async function decodificar(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* navegador antigo: tenta sem opções */ }
    try { return await createImageBitmap(file); } catch (e) { /* tenta o decodificador HTML */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error("Imagem sem dimensões válidas.");
    return img;
  } catch (e) {
    throw new Error(ehHeic(file)
      ? "Este navegador não conseguiu abrir esta foto HEIC/HEIF. Escolha uma foto em JPEG: no iPhone, vá em Ajustes → Câmera → Formatos → “Mais compatível” e tire uma foto nova, ou exporte a foto como JPEG."
      : "Não foi possível abrir esta imagem. Ela pode estar corrompida ou em formato não compatível; selecione uma foto em JPEG.");
  } finally { URL.revokeObjectURL(url); }
}

const paraBlob = (c, tipo, q) => new Promise(res => { // nunca fica pendurado: desiste após IMG.timeoutMs
  const t = setTimeout(() => res(null), IMG.timeoutMs);
  try { c.toBlob(b => { clearTimeout(t); res(b); }, tipo, q); } catch (e) { clearTimeout(t); res(null); }
});
// Só vale se o navegador realmente gerou o formato pedido (Safari devolve PNG quando não sabe WebP).
const tentar = async (c, tipo, q) => { const b = await paraBlob(c, tipo, q); return b && b.type === tipo ? b : null; };
const lerBytes = (blob, n) => new Promise(res => {
  try { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => res(null); r.readAsArrayBuffer(blob.slice(0, n)); } catch (e) { res(null); }
});
// Confere o MIME declarado contra os bytes reais (assinatura do arquivo).
export async function conferir(blob) {
  if (!blob || !EXT[blob.type] || !blob.size) return false;
  const b = await lerBytes(blob, 12); if (!b) return true; // não deu para ler: confia no type
  const asc = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (blob.type === "image/webp") return asc(0, 4) === "RIFF" && asc(8, 4) === "WEBP";
  if (blob.type === "image/jpeg") return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  return b[0] === 0x89 && asc(1, 3) === "PNG";
}

function novoCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); if (!x) throw new Error("Este navegador não conseguiu preparar a imagem. Tente outro navegador ou uma foto menor.");
  x.imageSmoothingQuality = "high"; return [c, x];
}
function temTransparencia(img) {
  try { const [, x] = novoCanvas(48, 48); x.drawImage(img, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; } catch (e) { return false; } // sem leitura de pixels: trata como opaca
  return false;
}
function achatar(c) { const [n, x] = novoCanvas(c.width, c.height); x.fillStyle = "#fff"; x.fillRect(0, 0, n.width, n.height); x.drawImage(c, 0, 0); return n; }

// Para cada dimensão (800 px e, se preciso, menores até o piso) tenta WebP → JPEG → PNG, cada um com qualidades decrescentes.
// PNG só vem antes do JPEG se a foto tem transparência; caso contrário é o último recurso. No máximo IMG.maxTentativas codificações.
async function converter(file, img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height, maior = Math.max(w0, h0);
  if (!(w0 > 0 && h0 > 0)) throw new Error("A foto não tem dimensões válidas.");
  const base = Math.min(maior, IMG.maxLado), piso = Math.min(base, IMG.ladoMinimo);
  const lados = [...new Set([1, 0.85, 0.7, 0.55, 0.42].map(e => Math.max(Math.round(base * e), piso)))];
  const alfa = /png|webp/i.test(file.type || file.name || "") && temTransparencia(img);
  const ordem = alfa ? ["image/webp", "image/png", "image/jpeg"] : ["image/webp", "image/jpeg", "image/png"];
  const fora = new Set(); let tent = 0, melhor = null;
  externo: for (const lado of lados) {
    const k = lado / maior, w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const [c, x] = novoCanvas(w, h); if (!alfa) { x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); } x.drawImage(img, 0, 0, w, h);
    let plano = null;
    for (const tipo of ordem) {
      if (fora.has(tipo)) continue;
      if (tipo === "image/png" && !alfa && !(fora.has("image/webp") && fora.has("image/jpeg"))) continue;
      let fonte = c; if (tipo === "image/jpeg" && alfa) fonte = plano || (plano = achatar(c));
      for (const q of tipo === "image/png" ? [undefined] : IMG.qualidades) {
        if (++tent > IMG.maxTentativas) break externo;
        const b = await tentar(fonte, tipo, q);
        if (!b || !(await conferir(b))) { fora.add(tipo); break; } // formato indisponível ou arquivo inválido
        const cand = { blob: b, largura: w, altura: h, qualidade: q === undefined ? "sem perda" : q };
        if (!melhor || b.size < melhor.blob.size) melhor = cand;
        if (b.size <= IMG.alvoBytes) break externo;
      }
    }
  }
  if (!melhor) throw new Error("Este navegador não conseguiu gerar a imagem (WebP, JPEG e PNG falharam). Tente outro navegador ou uma foto em JPEG.");
  if (melhor.blob.size > IMG.maxServidorBytes) throw new Error(`Não foi possível reduzir a foto abaixo de ${fmt(IMG.maxServidorBytes)}. Escolha uma foto com menos detalhes ou menor resolução.`);
  const tipo = melhor.blob.type;
  return { ...melhor, tipo, ext: EXT[tipo], rotulo: ROTULO[tipo], tentativas: tent, tamanhoOriginal: file.size, tamanhoFinal: melhor.blob.size, acimaDoAlvo: melhor.blob.size > IMG.alvoBytes };
}

export async function comprimir(file) {
  validar(file);
  const img = await decodificar(file);
  try { return await converter(file, img); } finally { if (img.close) img.close(); }
}

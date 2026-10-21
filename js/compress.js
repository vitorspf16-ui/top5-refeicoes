import { IMG } from "./config.js";

export const fmt = b => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(0) + " KB" : (b / 1048576).toFixed(1) + " MB";

export const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const ROTULO = { "image/webp": "WebP", "image/jpeg": "JPEG", "image/png": "PNG" };
const ehHeic = f => /hei[cf]/i.test(f.type || "") || /\.hei[cf]$/i.test(f.name || "");

export function validar(file) {
  if (!file) throw new Error("Nenhum arquivo selecionado.");
  // HEIC/HEIF é aceito como entrada para que possamos tentar decodificar e explicar a incompatibilidade.
  const ok = IMG.tipos.includes(file.type) || ehHeic(file) || (!file.type && /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name || ""));
  if (!ok) throw new Error("Formato não reconhecido. Escolha uma foto JPG, PNG, WebP ou HEIC/HEIF.");
  if (file.size > IMG.maxOriginalBytes) throw new Error(`Arquivo muito grande (${fmt(file.size)}). O máximo é ${fmt(IMG.maxOriginalBytes)}.`);
  if (file.size === 0) throw new Error("O arquivo está vazio. Escolha outra foto.");
}

async function decodificar(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) { /* tenta sem opções */ }
    try { return await createImageBitmap(file); } catch (_) { /* tenta o decodificador HTML */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error("Imagem sem dimensões válidas.");
    return img;
  } catch (_) {
    throw new Error(ehHeic(file)
      ? "Este navegador não conseguiu abrir esta foto HEIC/HEIF. No iPhone, tente compartilhar/exportar a foto como JPEG ou vá em Ajustes → Câmera → Formatos → Mais Compatível e escolha uma foto nova."
      : "Não foi possível abrir esta imagem. Ela pode estar corrompida ou em um formato não compatível; tente outra foto em JPG ou PNG.");
  } finally { URL.revokeObjectURL(url); }
}

const paraBlob = (canvas, tipo, qualidade) => new Promise(resolve => {
  try { canvas.toBlob(resolve, tipo, qualidade); } catch (_) { resolve(null); }
});
// Alguns navegadores ignoram o formato solicitado e devolvem PNG. Nunca confiar apenas no argumento.
const tentar = async (canvas, tipo, qualidade) => {
  const blob = await paraBlob(canvas, tipo, qualidade);
  return blob && blob.type === tipo && blob.size > 0 ? blob : null;
};

function qualidades() {
  const valores = [];
  const inicial = Math.max(0.1, Math.min(1, IMG.qualidadeInicial));
  const minima = Math.max(0.1, Math.min(inicial, IMG.qualidadeMinima));
  const passo = Math.max(0.01, IMG.passo);
  for (let q = inicial, i = 0; i < 20 && q >= minima - 1e-9; i++, q = Math.round((q - passo) * 100) / 100) {
    valores.push(Math.max(minima, q));
    if (q <= minima) break;
  }
  if (!valores.includes(minima)) valores.push(minima);
  return [...new Set(valores)];
}

// Tenta WebP e JPEG com várias qualidades antes de usar PNG. Reduz dimensões apenas quando necessário.
export async function comprimir(file) {
  validar(file);
  const img = await decodificar(file);
  try {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!(w0 > 0 && h0 > 0)) throw new Error("A foto não tem dimensões válidas.");
    const maior = Math.max(w0, h0);
    const lados = [...new Set([IMG.maxLado, 680, 560, 460].filter(n => Number.isFinite(n) && n > 0))];
    const dimensoes = [];
    const dimensoesVistas = new Set();
    for (const lado of lados) {
      const escala = Math.min(1, lado / maior);
      const w = Math.max(1, Math.round(w0 * escala)), h = Math.max(1, Math.round(h0 * escala));
      const chave = `${w}x${h}`;
      if (!dimensoesVistas.has(chave)) { dimensoesVistas.add(chave); dimensoes.push({ w, h }); }
    }
    let melhor = null;
    const qs = qualidades();

    for (const { w, h } of dimensoes) {
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Este navegador não conseguiu preparar a imagem. Tente outro navegador.");
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      // JPEG não suporta transparência; fundo branco também evita áreas pretas em algumas visualizações.
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);

      let encontrouAlvoNestaDimensao = false;
      for (const tipo of ["image/webp", "image/jpeg"]) {
        let melhorTipo = null;
        for (const q of qs) {
          const blob = await tentar(canvas, tipo, q);
          if (!blob) break; // formato não suportado: tenta o próximo
          const candidato = { blob, largura: w, altura: h, qualidade: q };
          if (!melhorTipo || blob.size < melhorTipo.blob.size) melhorTipo = candidato;
          if (blob.size <= IMG.alvoBytes) { melhorTipo = candidato; break; }
        }
        if (melhorTipo && (!melhor || melhorTipo.blob.size < melhor.blob.size)) melhor = melhorTipo;
        if (melhorTipo && melhorTipo.blob.size <= IMG.alvoBytes) {
          melhor = melhorTipo; encontrouAlvoNestaDimensao = true; break;
        }
      }

      // PNG é último recurso (não tem controle de qualidade). Só o usa se os formatos com perdas não couberem.
      if (!encontrouAlvoNestaDimensao) {
        const png = await tentar(canvas, "image/png");
        if (png) {
          const candidato = { blob: png, largura: w, altura: h, qualidade: null };
          if (!melhor || png.size < melhor.blob.size) melhor = candidato;
          if (png.size <= IMG.alvoBytes) { melhor = candidato; encontrouAlvoNestaDimensao = true; }
        }
      }
      if (encontrouAlvoNestaDimensao) break;
    }

    if (!melhor) throw new Error("Este navegador não conseguiu converter a imagem. Tente outro navegador ou escolha uma foto em JPG.");
    const tipo = melhor.blob.type;
    if (!EXT[tipo]) throw new Error("A conversão gerou um formato inesperado. Tente outra foto.");
    if (melhor.blob.size > IMG.maxServidorBytes) throw new Error(`Não foi possível reduzir a foto abaixo de ${fmt(IMG.maxServidorBytes)}. Escolha uma foto mais simples ou com menor resolução.`);
    return {
      ...melhor, tipo, ext: EXT[tipo], rotulo: ROTULO[tipo],
      tamanhoOriginal: file.size, tamanhoFinal: melhor.blob.size,
      acimaDoAlvo: melhor.blob.size > IMG.alvoBytes
    };
  } finally {
    if (typeof img.close === "function") img.close();
  }
}

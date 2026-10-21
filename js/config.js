export const CONFIG = {
  SUPABASE_URL: "https://qvpnuwqqdoilzonqrurk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_b2PBQ8nj5RPZGRb0kn8vkQ_uLpzY1Bg", // chave pública. NUNCA coloque service_role / sb_secret_ aqui.
  SITE_URL: "https://vitorspf16-ui.github.io/top5-refeicoes/",        // destino fixo do link de redefinição de senha
  BUCKET: "pratos"
};
export const IMG = {
  maxLado: 800, ladoMinimo: 400, qualidades: [0.75, 0.62, 0.5, 0.4], // dimensões e qualidades tentadas, nesta ordem
  maxTentativas: 40, timeoutMs: 10000,                              // no máximo 40 codificações; cada uma desiste após 10 s
  alvoBytes: 150 * 1024, maxServidorBytes: 300 * 1024, maxOriginalBytes: 15 * 1024 * 1024,
  tipos: ["image/jpeg", "image/png", "image/webp"]
};

export const CONFIG = {
  SUPABASE_URL: "https://qvpnuwqqdoilzonqrurk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_b2PBQ8nj5RPZGRb0kn8vkQ_uLpzY1Bg", // chave pública (anon). Nunca use service_role aqui.
  BUCKET: "pratos"
};
export const IMG = {
  maxLado: 800, qualidadeInicial: 0.75, qualidadeMinima: 0.4, passo: 0.07,
  alvoBytes: 150 * 1024, maxServidorBytes: 300 * 1024, maxOriginalBytes: 15 * 1024 * 1024,
  tipos: ["image/jpeg", "image/png", "image/webp"]
};

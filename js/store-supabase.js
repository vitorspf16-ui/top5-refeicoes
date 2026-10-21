import { CONFIG } from "./config.js";
let sb;
const B = () => CONFIG.BUCKET;
const msg = e => (e && e.message) || String(e);

async function garantirSessao() { // visitantes votam com login anônimo (identifica "uma pessoa")
  const { data } = await sb.auth.getSession();
  if (!data.session) { const { error } = await sb.auth.signInAnonymously(); if (error) console.warn("Login anônimo indisponível:", error.message); }
}
async function subir(pratoId, blob) { // nome único: nunca sobrescreve outra foto
  const path = `${pratoId}/${crypto.randomUUID()}.webp`;
  const { error } = await sb.storage.from(B()).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
  if (error) throw error; return path;
}
async function apagar(path) {
  if (!path) return;
  const { error } = await sb.storage.from(B()).remove([path]);
  if (error) console.warn("Não foi possível apagar o arquivo antigo:", path, error.message);
}
async function ehAdmin() { const { data, error } = await sb.rpc("sou_admin"); return !error && data === true; }
const pathDe = async id => (await sb.from("pratos").select("foto_path").eq("id", id).single()).data?.foto_path || null;

export async function criarStore() {
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes("SEU-PROJETO")) throw new Error("Preencha SUPABASE_URL e SUPABASE_ANON_KEY em js/config.js.");
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  await garantirSessao();
  return {
    async listar() {
      const [p, v, pr] = await Promise.all([
        sb.from("participantes").select("id,nome,apelido").order("nome"),
        sb.from("votos").select("participante_id"),
        sb.from("pratos").select("id,nome,descricao,foto_path,participante_id")
      ]);
      for (const r of [p, v, pr]) if (r.error) throw r.error;
      const cont = {}; v.data.forEach(x => cont[x.participante_id] = (cont[x.participante_id] || 0) + 1);
      const pp = {}; pr.data.forEach(x => pp[x.participante_id] = {
        id: x.id, nome: x.nome, descricao: x.descricao,
        fotoUrl: x.foto_path ? sb.storage.from(B()).getPublicUrl(x.foto_path).data.publicUrl : null });
      return p.data.map(x => ({ ...x, votos: cont[x.id] || 0, prato: pp[x.id] || null }));
    },
    async meuVoto() {
      const { data: { session } } = await sb.auth.getSession(); if (!session) return null;
      const { data, error } = await sb.rpc("meu_voto");
      if (error) throw error;
      return data || null;
    },
    async votar(id) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, motivo: "Votação indisponível: ative o login anônimo no Supabase (veja o README)." };
      const { error } = await sb.from("votos").insert({ participante_id: id, voter_id: session.user.id });
      if (!error) return { ok: true };
      return { ok: false, motivo: error.code === "23505" ? "Você já votou nesta votação." : "Não foi possível registrar o voto: " + error.message };
    },
    aoMudar(fn) {
      // Realtime apenas para pratos. A tabela votos não é publicada, pois contém registros individuais.
      let t; const f = () => { clearTimeout(t); t = setTimeout(fn, 150); };
      sb.channel("top5-pratos")
        .on("postgres_changes", { event: "*", schema: "public", table: "pratos" }, f)
        .subscribe();
      // Atualiza a contagem periodicamente sem transmitir linhas individuais de votos.
      setInterval(fn, 4000);
    },
    ehAdmin,
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("E-mail ou senha inválidos.");
      if (!(await ehAdmin())) { await sb.auth.signOut(); await garantirSessao(); throw new Error("Esta conta não tem permissão de administrador."); }
    },
    async sair() { await sb.auth.signOut(); await garantirSessao(); },

    async salvarPrato({ pratoId, participanteId, nome, descricao, blob }) {
      let id = pratoId, antigo = null;
      if (id) {
        const { data, error } = await sb.from("pratos").update({ nome, descricao }).eq("id", id).select("foto_path").single();
        if (error) throw error; antigo = data.foto_path;
      } else {
        const { data, error } = await sb.from("pratos").insert({ nome, descricao, participante_id: participanteId }).select("id").single();
        if (error) throw error; id = data.id;
      }
      if (!blob) return;
      let novo;
      try { novo = await subir(id, blob); }
      catch (e) { throw new Error("Prato salvo, mas o envio da foto falhou: " + msg(e) + ". Tente enviar a foto de novo."); }
      const { error } = await sb.from("pratos").update({ foto_path: novo }).eq("id", id);
      if (error) { await apagar(novo); throw new Error("A foto foi enviada, mas não foi vinculada ao prato: " + error.message); }
      await apagar(antigo); // só remove a antiga depois de a nova estar salva
    },
    async removerFoto(id) {
      const antigo = await pathDe(id);
      const { error } = await sb.from("pratos").update({ foto_path: null }).eq("id", id);
      if (error) throw error; await apagar(antigo);
    },
    async excluirPrato(id) {
      const antigo = await pathDe(id);
      const { error } = await sb.from("pratos").delete().eq("id", id);
      if (error) throw error; await apagar(antigo);
    }
  };
}

import { CONFIG } from "./config.js";
let sb;
const B = () => CONFIG.BUCKET;
const msg = e => (e && e.message) || String(e);
const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
function amigavel(e) { // traduz erros do Storage para algo que o administrador entenda
  const m = msg(e), c = String((e && (e.statusCode || e.status)) || "");
  if (/failed to fetch|networkerror|load failed|network request/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (/mime|not supported|invalid_mime/i.test(m) || c === "415") return "O servidor não aceita este formato de imagem. Aplique a migração 02 no Supabase (veja o README).";
  if (/exceeded|too large|maximum allowed size/i.test(m) || c === "413") return "A imagem passou do tamanho máximo permitido (300 KB). Tente outra foto.";
  if (/row-level security|unauthorized|jwt|forbidden/i.test(m) || /^40[13]$/.test(c)) return "Sem permissão para enviar fotos. Saia e entre de novo como administrador.";
  return m;
}

async function garantirSessao() { // visitantes votam com login anônimo (identifica "uma pessoa")
  const { data } = await sb.auth.getSession();
  if (!data.session) { const { error } = await sb.auth.signInAnonymously(); if (error) console.warn("Login anônimo indisponível:", error.message); }
}
async function subir(pratoId, blob) { // nome único: nunca sobrescreve outra foto
  const ext = EXT[blob.type]; if (!ext) throw new Error("Formato de imagem inesperado: " + (blob.type || "desconhecido"));
  const path = `${pratoId}/${crypto.randomUUID()}.${ext}`; // extensão e contentType sempre iguais ao blob real
  const { error } = await sb.storage.from(B()).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(amigavel(error)); return path;
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
        sb.from("participantes").select("id,nome,apelido,ativo").order("nome"),
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
      const m = msg(error);
      return { ok: false, motivo: error.code === "23505" ? "Você já votou nesta votação."
        : /VOTACAO_ENCERRADA|row-level security/i.test(m) ? "Votação encerrada."
        : /PARTICIPANTE_INATIVO/.test(m) ? "Este participante não está mais na votação."
        : "Não foi possível registrar o voto: " + m };
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
    async config() { // hora do servidor + prazo (o servidor é a referência, não o relógio do aparelho)
      const { data, error } = await sb.rpc("config_votacao"); if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      return { agora: Date.parse(r.agora), encerraEm: r.encerra_em ? Date.parse(r.encerra_em) : null };
    },
    async definirEncerramento(local) { // "YYYY-MM-DDTHH:MM" em America/Sao_Paulo; "" remove o prazo
      const { error } = await sb.rpc("definir_encerramento", { p_local: local });
      if (error) throw new Error(/Apenas administradores/.test(msg(error)) ? "Sem permissão de administrador." : msg(error));
    },
    async salvarParticipante({ id, nome, apelido }) {
      const { error } = await (id ? sb.from("participantes").update({ nome, apelido }).eq("id", id) : sb.from("participantes").insert({ nome, apelido }));
      if (error) throw error;
    },
    async definirAtivo(id, ativo) { const { error } = await sb.from("participantes").update({ ativo }).eq("id", id); if (error) throw error; },
    async excluirParticipante(id) { // o banco recusa (restrict) se houver votos
      const { data } = await sb.from("pratos").select("foto_path").eq("participante_id", id).maybeSingle();
      const { error } = await sb.from("participantes").delete().eq("id", id);
      if (error) throw new Error(error.code === "23503" ? "Este participante tem votos registrados. Desative-o em vez de excluir." : msg(error));
      await apagar(data && data.foto_path);
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("E-mail ou senha inválidos.");
      if (!(await ehAdmin())) { await sb.auth.signOut(); await garantirSessao(); throw new Error("Esta conta não tem permissão de administrador."); }
    },
    async sair() { await sb.auth.signOut(); await garantirSessao(); },
    async atualizarSenha(senha) {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) throw error;
    },
    async redefinirSenha(email) {
      const redirectTo = new URL("./", window.location.href).href;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async ehMaster() {
      const { data, error } = await sb.rpc("sou_admin_master");
      return !error && data === true;
    },
    async listarAdmins() {
      const { data, error } = await sb.rpc("listar_admins");
      if (error) throw error;
      return data || [];
    },
    async gerenciarAdmin(acao, payload) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data, error } = await sb.functions.invoke("gerenciar-admins", {
        body: { acao, ...payload },
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (error) throw new Error(error.message || "Falha ao gerenciar administrador.");
      if (data?.error) throw new Error(data.error);
      return data;
    },

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

// Mesma interface do store-supabase.js, mas tudo local. Fotos só em memória.
const PARTICIPANTES = [
  { id: "p1", nome: "Ana Beatriz", apelido: "Bia" }, { id: "p2", nome: "Carlos Eduardo", apelido: "Cadu" },
  { id: "p3", nome: "Marcos Vinícius", apelido: "Marquinhos" }, { id: "p4", nome: "Juliana Prado", apelido: "Ju" },
  { id: "p5", nome: "Rafael Souza", apelido: "Rafa" }, { id: "p6", nome: "Fernanda Lima", apelido: "Fê" },
  { id: "p7", nome: "Thiago Mendes", apelido: "Tigrão" }, { id: "p8", nome: "Luciana Alves", apelido: "Lu" }
];
const INICIAIS = { p1: 5, p2: 5, p3: 3, p4: 2, p5: 2, p6: 1, p7: 1, p8: 0 };
const CHAVE = "top5-demo-v2";

export function criarStoreDemo() {
  let est = { votos: { ...INICIAIS }, meuVoto: null };
  try { const s = JSON.parse(localStorage.getItem(CHAVE)); if (s && s.votos) est = s; } catch (e) {}
  const pratos = {}; let admin = false; const ouv = [];
  const avisar = () => ouv.forEach(f => f());
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(est)); } catch (e) {} avisar(); };
  const livre = u => { if (u) URL.revokeObjectURL(u); };
  const porId = id => Object.values(pratos).find(p => p.id === id);
  return {
    async listar() { return PARTICIPANTES.map(p => ({ ...p, votos: est.votos[p.id] || 0, prato: pratos[p.id] || null })); },
    async meuVoto() { return est.meuVoto; },
    async votar(id) {
      if (est.meuVoto) return { ok: false, motivo: "Você já votou nesta votação." };
      est.votos[id] = (est.votos[id] || 0) + 1; est.meuVoto = id; salvar(); return { ok: true };
    },
    aoMudar(f) { ouv.push(f); },
    async ehAdmin() { return admin; }, async entrar() { admin = true; }, async sair() { admin = false; },
    async salvarPrato({ pratoId, participanteId, nome, descricao, blob }) {
      await new Promise(r => setTimeout(r, 600)); // simula o tempo de envio
      let p = pratoId ? porId(pratoId) : null;
      if (!p) p = pratos[participanteId] = { id: "d" + Date.now(), participanteId, fotoUrl: null };
      p.nome = nome; p.descricao = descricao;
      if (blob) { livre(p.fotoUrl); p.fotoUrl = URL.createObjectURL(blob); }
      avisar();
    },
    async removerFoto(id) { const p = porId(id); if (p) { livre(p.fotoUrl); p.fotoUrl = null; avisar(); } },
    async excluirPrato(id) { const p = porId(id); if (p) { livre(p.fotoUrl); delete pratos[p.participanteId]; avisar(); } },
    simularOutros() { const p = PARTICIPANTES[Math.floor(Math.random() * PARTICIPANTES.length)]; est.votos[p.id] = (est.votos[p.id] || 0) + 1; salvar(); },
    reiniciar() { est = { votos: { ...INICIAIS }, meuVoto: null }; salvar(); }
  };
}

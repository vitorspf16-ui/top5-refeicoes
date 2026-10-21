import { comprimir, fmt } from "./compress.js";
import { criarStore } from "./store-supabase.js";

const $ = id => document.getElementById(id);
const texto = e => (e && e.message) || String(e);
const iniciais = n => n.split(" ").slice(0, 2).map(s => s[0]).join("");
const pct = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
let store, lista = [], meu = null, admin = false, compactado = null, urlPrevia = null, ocupado = false, ultimos = {};
const linhas = new Map();
const TZ = "America/Sao_Paulo";
let cfg = { offset: 0, encerraEm: null }, jaEncerrada = false, prazoMostrado;
const agora = () => Date.now() + cfg.offset;
const encerrada = () => cfg.encerraEm !== null && agora() >= cfg.encerraEm;
const fmtData = ms => new Date(ms).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "long", timeStyle: "short" });
const paraInput = ms => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
const resta = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${h}h ${m}min` : h ? `${h}h ${m}min ${s % 60}s` : `${m}min ${s % 60}s`; };
function aviso() {
  const a = $("aviso"), e = encerrada(); a.classList.toggle("fechada", e);
  a.textContent = e ? `Votação encerrada em ${fmtData(cfg.encerraEm)} (Brasília). Resultado final abaixo.`
    : cfg.encerraEm ? `Votação aberta até ${fmtData(cfg.encerraEm)} (Brasília) · faltam ${resta(cfg.encerraEm - agora())}` : "Votação aberta";
  if (e !== jaEncerrada) { jaEncerrada = e; cartoes(); ranking(); }
}
setInterval(aviso, 1000);

/* ---------- Classificação: posição = 1 + quem tem MAIS votos; mesmo total = empate ---------- */
function classificar(l) {
  const total = l.reduce((s, p) => s + p.votos, 0);
  const itens = l.map(p => ({ ...p, pos: 1 + l.filter(o => o.votos > p.votos).length,
    empate: l.filter(o => o.votos === p.votos).length > 1, pct: total ? p.votos / total * 100 : 0 }));
  itens.sort((a, b) => a.pos - b.pos);
  return { total, itens };
}

/* ---------- Fotos ---------- */
function criarFoto(extra) {
  const d = document.createElement("div"); d.className = "foto " + extra;
  d.innerHTML = '<img alt="" loading="lazy"><span class="sem-foto" aria-hidden="true">🍽️</span>';
  const i = d.firstChild; i.onerror = () => { i.hidden = true; delete i.dataset.u; d.lastChild.hidden = false; };
  return d;
}
function poeFoto(el, prato) {
  const img = el.firstChild, ph = el.lastChild, url = prato && prato.fotoUrl;
  if (url) { if (img.dataset.u !== url) { img.dataset.u = url; img.src = url; } img.alt = prato.nome; img.hidden = false; ph.hidden = true; }
  else { img.hidden = true; img.removeAttribute("src"); delete img.dataset.u; ph.hidden = false; }
}

/* ---------- Votação ---------- */
function cartoes() {
  const box = $("cards");
  const ativos = lista.filter(p => p.ativo);
  if (!ativos.length) { box.innerHTML = '<p class="empty">Nenhum participante cadastrado.</p>'; return; }
  if (!box.querySelector(".card")) box.replaceChildren();
  [...box.querySelectorAll(".card")].forEach(c => { if (!ativos.some(p => "card-" + p.id === c.id)) c.remove(); });
  ativos.forEach((p, i) => {
    let c = $("card-" + p.id);
    if (!c) {
      c = document.createElement("article"); c.className = "card"; c.id = "card-" + p.id; c.style.animationDelay = i * 60 + "ms";
      c.innerHTML = `<div class="who"><div class="avatar" aria-hidden="true"></div><div><div class="name"></div><div class="nick"></div></div></div>
        <div class="prato"><b class="pn"></b><p class="pd"></p></div><button class="vote" type="button">Votar</button>`;
      c.prepend(criarFoto(""));
      c.querySelector(".avatar").textContent = iniciais(p.nome);
      c.querySelector(".name").textContent = p.nome;
      c.querySelector(".nick").textContent = "“" + p.apelido + "”";
      c.querySelector("button").onclick = () => votar(p);
      box.appendChild(c);
    }
    poeFoto(c.firstChild, p.prato);
    c.querySelector(".name").textContent = p.nome; c.querySelector(".nick").textContent = "“" + p.apelido + "”";
    c.querySelector(".avatar").textContent = iniciais(p.nome);
    c.querySelector(".pn").textContent = p.prato ? p.prato.nome : "Prato ainda não cadastrado";
    c.querySelector(".pd").textContent = (p.prato && p.prato.descricao) || "";
    const b = c.querySelector("button");
    c.classList.toggle("mine", meu === p.id); b.disabled = !!meu || encerrada();
    b.classList.toggle("done", meu === p.id); b.textContent = meu === p.id ? "✓ Seu voto" : encerrada() ? "Encerrada" : "Votar";
  });
}

function ranking() {
  const { total, itens } = classificar(lista.filter(p => p.ativo)), ol = $("ranking");
  $("status").textContent = total ? `${total} ${total === 1 ? "voto" : "votos"} · ${encerrada() ? "resultado final" : meu ? "seu voto já foi registrado" : "você ainda não votou"}` : "Ainda não há votos.";
  if (!total) { ol.innerHTML = '<li class="empty">Seja o primeiro a votar!</li>'; linhas.clear(); $("rank-note").textContent = ""; return; }
  if (ol.querySelector(".empty")) ol.replaceChildren();
  const vis = itens.filter(p => p.pos <= 5);
  const antes = new Map([...linhas].map(([id, el]) => [id, el.getBoundingClientRect().top]));
  const ids = new Set(vis.map(p => p.id));
  [...linhas].forEach(([id, el]) => { if (!ids.has(id)) { el.remove(); linhas.delete(id); } });
  vis.forEach(p => {
    let li = linhas.get(p.id);
    if (!li) {
      li = document.createElement("li");
      li.innerHTML = `<div class="pos"></div><div class="info"><div class="top"><span class="rn"></span><span class="rk"></span><span class="tie" hidden>Empate</span></div>
        <div class="bar"><i></i></div></div><div class="nums"><b></b><small></small></div>`;
      li.insertBefore(criarFoto("thumb"), li.children[1]);
      li.querySelector(".rn").textContent = p.nome; li.querySelector(".rk").textContent = "“" + p.apelido + "”";
      linhas.set(p.id, li);
    }
    li.className = "row" + (p.pos <= 3 ? " r" + p.pos : "");
    li.querySelector(".pos").textContent = p.pos + "º";
    poeFoto(li.children[1], p.prato);
    li.querySelector(".tie").hidden = !p.empate;
    li.querySelector(".bar i").style.width = p.pct + "%";
    const b = li.querySelector("b"); b.textContent = p.votos + (p.votos === 1 ? " voto" : " votos");
    li.querySelector("small").textContent = pct(p.pct);
    if (ultimos[p.id] !== undefined && ultimos[p.id] !== p.votos) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
    ol.appendChild(li);
  });
  vis.forEach(p => { const li = linhas.get(p.id), t = antes.get(p.id); if (t === undefined) return;
    const dy = t - li.getBoundingClientRect().top;
    if (dy) { li.style.transition = "none"; li.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { li.style.transition = ""; li.style.transform = ""; })); } });
  ultimos = Object.fromEntries(lista.map(p => [p.id, p.votos]));
  $("rank-note").textContent = (vis.length > 5 ? "Há empate na 5ª posição, por isso aparecem mais de cinco nomes. " : "") +
    (vis.some(p => p.empate) ? "Quem tem o mesmo total de votos aparece como empate, sem critério de desempate." : "");
}

async function votar(p) {
  if (encerrada()) { aviso(); $("status").textContent = "Votação encerrada."; return; }
  $("status").textContent = "Registrando voto…";
  const r = await store.votar(p.id);
  await desenhar();
  $("status").textContent = r.ok ? `Voto registrado em ${p.apelido}!` : r.motivo;
}

/* ---------- Administração de pratos ---------- */
function msg(t, erro) { const m = $("f-msg"); m.textContent = t; m.className = "msg" + (erro ? " erro" : ""); }
function setOcupado(v, rotulo) {
  ocupado = v; $("f-salvar").disabled = v; $("f-file").disabled = v; $("f-cam").disabled = v;
  $("f-salvar").textContent = v ? rotulo : "Confirmar e salvar";
}
function limparFoto() {
  if (urlPrevia) URL.revokeObjectURL(urlPrevia);
  urlPrevia = null; compactado = null; $("prev").hidden = true; $("prev-img").removeAttribute("src"); $("f-file").value = ""; $("f-cam").value = "";
}
function carregar() {
  const p = lista.find(x => x.id === $("f-part").value);
  $("f-nome").value = p && p.prato ? p.prato.nome : ""; $("f-desc").value = (p && p.prato && p.prato.descricao) || "";
  limparFoto();
}
function btn(t, fn, cls = "") { const b = document.createElement("button"); b.type = "button"; b.className = "tool " + cls; b.textContent = t; b.onclick = fn; return b; }
async function agir(fn, ok, pergunta) {
  if (!confirm(pergunta)) return;
  msg("Processando…");
  try { await fn(); msg(ok); carregar(); } catch (e) { msg(texto(e), true); }
  await desenhar();
}
function painelAdmin() {
  $("admin").hidden = !admin; $("btn-admin").hidden = admin; $("btn-sair").hidden = !admin;
  if (!admin) return;
  const sel = $("f-part"), atual = sel.value, atv = lista.filter(p => p.ativo), sig = atv.map(p => p.id + p.nome + p.apelido).join("|");
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig; sel.replaceChildren(...atv.map(p => new Option(`${p.nome} (${p.apelido})`, p.id)));
    if (atual && atv.some(p => p.id === atual)) sel.value = atual; else carregar();
  }
  listaPessoas();
  if (prazoMostrado !== cfg.encerraEm) { prazoMostrado = cfg.encerraEm; $("p-data").value = cfg.encerraEm ? paraInput(cfg.encerraEm) : ""; }
  const ul = $("lista-pratos"); ul.replaceChildren();
  const com = lista.filter(p => p.ativo && p.prato);
  if (!com.length) { const li = document.createElement("li"); li.textContent = "Nenhum prato cadastrado ainda."; ul.append(li); }
  com.forEach(p => {
    const li = document.createElement("li"), f = criarFoto("thumb"); poeFoto(f, p.prato);
    const t = document.createElement("div"); t.className = "txt";
    const b = document.createElement("b"); b.textContent = p.prato.nome;
    const s = document.createElement("div"); s.className = "nick"; s.textContent = `${p.nome} · ${p.prato.fotoUrl ? "com foto" : "sem foto"}`;
    t.append(b, s); li.append(f, t, btn(p.prato.fotoUrl ? "Trocar foto / editar" : "Adicionar foto / editar", () => {
      $("f-part").value = p.id; carregar(); $("f-part").scrollIntoView({ behavior: "smooth", block: "center" }); }));
    if (p.prato.fotoUrl) li.append(btn("Remover foto", () => agir(() => store.removerFoto(p.prato.id), "Foto removida.", "Remover a foto deste prato?")));
    li.append(btn("Excluir prato", () => agir(() => store.excluirPrato(p.prato.id), "Prato excluído.", "Excluir o prato e a foto?"), "perigo"));
    ul.append(li);
  });
}

$("f-part").onchange = carregar;
$("f-limpar").onclick = () => { carregar(); msg(""); };
const escolher = async e => {
  const file = e.target.files[0]; if (!file) return;
  limparFoto(); setOcupado(true, "Compactando…"); msg("Compactando imagem…");
  try {
    const r = await comprimir(file); // o arquivo original não é guardado nem enviado
    compactado = r; urlPrevia = URL.createObjectURL(r.blob);
    $("prev-img").src = urlPrevia; $("prev").hidden = false;
    const d = Math.round((1 - r.tamanhoFinal / r.tamanhoOriginal) * 100);
    const detalheQualidade = r.qualidade == null ? "PNG (sem ajuste de qualidade)" : `${r.rotulo}, qualidade ${r.qualidade}`;
    $("prev-info").textContent = `Original: ${fmt(r.tamanhoOriginal)} → compactada: ${fmt(r.tamanhoFinal)} (${d >= 0 ? "−" + d : "+" + -d}%) · ${r.largura}×${r.altura} px · ${detalheQualidade}` +
      (r.acimaDoAlvo ? " · ⚠ acima de 150 KB; o servidor aceita até 300 KB" : "");
    msg("Confira a prévia e confirme para enviar.");
  } catch (err) { msg(texto(err), true); }
  finally { setOcupado(false); }
};
$("f-file").onchange = escolher; $("f-cam").onchange = escolher;
$("f-prato").onsubmit = async e => {
  e.preventDefault(); if (ocupado) return;
  const part = lista.find(p => p.id === $("f-part").value), prato = part && part.prato, nome = $("f-nome").value.trim();
  if (!nome) return msg("Informe o nome do prato.", true);
  if (!prato && !compactado) return msg("Escolha uma foto para o novo prato.", true);
  setOcupado(true, "Enviando…"); msg("Enviando…");
  try {
    await store.salvarPrato({ pratoId: prato && prato.id, participanteId: part.id, nome, descricao: $("f-desc").value.trim() || null, blob: compactado && compactado.blob });
    limparFoto(); msg("Prato salvo!");
  } catch (err) { msg(texto(err), true); }
  finally { setOcupado(false); await desenhar(); }
};

async function atualizarListaAdmins() {
  const ul = $("lista-admins");
  try {
    const admins = await store.listarAdmins();
    ul.replaceChildren();
    if (!admins.length) { const li = document.createElement("li"); li.textContent = "Nenhum administrador cadastrado."; ul.append(li); return; }
    admins.forEach(a => {
      const li = document.createElement("li"), t = document.createElement("div"); t.className = "txt";
      const b = document.createElement("b"); b.textContent = a.nome || a.email;
      const sub = document.createElement("div"); sub.className = "nick"; sub.textContent = `${a.email} · ${a.role === "master" ? "Master" : "Administrador"}`;
      t.append(b, sub); li.append(t);
      if (a.role !== "master") li.append(btn("Remover acesso", async () => {
        if (!confirm(`Remover a permissão de administrador de ${a.email}? A conta de login também será excluída.`)) return;
        try { await store.gerenciarAdmin("remover", { user_id: a.user_id }); aviso2("ad-msg", "Acesso removido e conta excluída."); await atualizarListaAdmins(); }
        catch (e) { aviso2("ad-msg", texto(e), true); }
      }, "perigo"));
      ul.append(li);
    });
  } catch (e) { aviso2("ad-msg", "Não foi possível listar administradores: " + texto(e), true); }
}
$("f-admin").onsubmit = async e => {
  e.preventDefault();
  if (!master) return aviso2("ad-msg", "Apenas o administrador master pode fazer isso.", true);
  const nome = $("ad-nome").value.trim(), email = $("ad-email").value.trim(), senha = $("ad-senha").value;
  aviso2("ad-msg", "Criando conta…");
  try {
    await store.gerenciarAdmin("criar", { nome, email, senha });
    $("ad-nome").value = ""; $("ad-email").value = ""; $("ad-senha").value = "";
    aviso2("ad-msg", "Administrador criado. Ele poderá redefinir a senha pela tela de login.");
    await atualizarListaAdmins();
  } catch (e) { aviso2("ad-msg", texto(e), true); }
};
$("f-nova-senha").onsubmit = async e => {
  e.preventDefault();
  const senha = $("nova-senha").value;
  if (senha.length < 8) { $("nova-senha-msg").textContent = "Use pelo menos 8 caracteres."; return; }
  $("nova-senha-msg").textContent = "Salvando…";
  try {
    await store.atualizarSenha(senha);
    $("nova-senha").value = "";
    $("nova-senha-msg").textContent = "Senha alterada. Você já pode entrar com a nova senha.";
    history.replaceState({}, document.title, location.pathname + location.search);
    setTimeout(() => $("dlg-nova-senha").close(), 1600);
  } catch (err) { $("nova-senha-msg").textContent = "Não foi possível alterar a senha: " + texto(err); }
};
$("l-reset").onclick = async () => {
  const email = $("l-email").value.trim();
  if (!email) { $("login-msg").textContent = "Informe seu e-mail para receber o link de redefinição."; $("l-email").focus(); return; }
  $("login-msg").textContent = "Enviando link de redefinição…";
  try { await store.redefinirSenha(email); $("login-msg").textContent = "Se esse e-mail estiver cadastrado, você receberá instruções para redefinir a senha."; }
  catch (e) { $("login-msg").textContent = "Não foi possível solicitar a redefinição: " + texto(e); }
};

$("btn-admin").onclick = () => {
  $("login-msg").textContent = ""; $("dlg-login").showModal();
};
$("l-cancel").onclick = () => $("dlg-login").close();
$("f-login").onsubmit = async e => {
  e.preventDefault(); $("login-msg").textContent = "Entrando…";
  try { await store.entrar($("l-email").value.trim(), $("l-senha").value); admin = true; $("l-senha").value = ""; $("dlg-login").close(); await desenhar(); }
  catch (err) { $("login-msg").textContent = texto(err); }
};
$("btn-sair").onclick = async () => { await store.sair(); admin = false; await desenhar(); };

/* ---------- Administração: participantes e prazo ---------- */
let editando = null;
const aviso2 = (id, t, erro) => { const m = $(id); m.textContent = t; m.className = "msg" + (erro ? " erro" : ""); };
function limparPessoa() { editando = null; $("pe-nome").value = ""; $("pe-apelido").value = ""; $("pe-salvar").textContent = "Cadastrar participante"; $("pe-cancel").hidden = true; }
async function agirP(fn, ok, pergunta) {
  if (pergunta && !confirm(pergunta)) return;
  aviso2("pe-msg", "Processando…");
  try { await fn(); aviso2("pe-msg", ok); } catch (e) { aviso2("pe-msg", texto(e), true); }
  await desenhar();
}
function listaPessoas() {
  const ul = $("lista-part"); ul.replaceChildren();
  if (!lista.length) { const li = document.createElement("li"); li.textContent = "Nenhum participante cadastrado."; ul.append(li); return; }
  lista.forEach(p => {
    const li = document.createElement("li"), t = document.createElement("div"); t.className = "txt";
    const b = document.createElement("b"); b.textContent = p.nome + (p.ativo ? "" : " (inativo)");
    const s = document.createElement("div"); s.className = "nick"; s.textContent = `“${p.apelido}” · ${p.votos} ${p.votos === 1 ? "voto" : "votos"}`;
    t.append(b, s); li.append(t,
      btn("Editar", () => { editando = p.id; $("pe-nome").value = p.nome; $("pe-apelido").value = p.apelido; $("pe-salvar").textContent = "Salvar alterações"; $("pe-cancel").hidden = false; $("pe-nome").focus(); }),
      btn(p.ativo ? "Desativar" : "Reativar", () => agirP(() => store.definirAtivo(p.id, !p.ativo), p.ativo ? "Participante desativado. Os votos foram preservados." : "Participante reativado.",
        p.ativo ? `Desativar ${p.nome}? Ele sai da votação e do ranking, mas os votos ficam guardados.` : null)));
    if (p.votos === 0) li.append(btn("Excluir", () => agirP(() => store.excluirParticipante(p.id), "Participante excluído.", `Excluir ${p.nome} e o prato dele? Não há votos para perder.`), "perigo"));
    ul.append(li);
  });
}
$("pe-cancel").onclick = () => { limparPessoa(); aviso2("pe-msg", ""); };
$("f-pessoa").onsubmit = async e => {
  e.preventDefault(); const nome = $("pe-nome").value.trim(), apelido = $("pe-apelido").value.trim();
  if (!nome || !apelido) return aviso2("pe-msg", "Informe nome e apelido.", true);
  try { await store.salvarParticipante({ id: editando, nome, apelido }); aviso2("pe-msg", editando ? "Participante atualizado." : "Participante cadastrado."); limparPessoa(); }
  catch (err) { aviso2("pe-msg", texto(err), true); }
  await desenhar();
};
$("f-prazo").onsubmit = async e => {
  e.preventDefault(); const v = $("p-data").value; if (!v) return aviso2("p-msg", "Escolha a data e o horário.", true);
  try { await store.definirEncerramento(v); aviso2("p-msg", "Prazo salvo (horário de Brasília)."); } catch (err) { aviso2("p-msg", texto(err), true); }
  prazoMostrado = undefined; await desenhar();
};
$("p-limpar").onclick = async () => {
  if (!confirm("Remover o prazo? A votação ficará aberta sem data para encerrar.")) return;
  try { await store.definirEncerramento(""); aviso2("p-msg", "Prazo removido."); } catch (err) { aviso2("p-msg", texto(err), true); }
  prazoMostrado = undefined; await desenhar();
};

/* ---------- Início ---------- */
async function desenhar() {
  try {
    lista = await store.listar(); meu = await store.meuVoto();
    const c = await store.config(); cfg = { offset: c.agora - Date.now(), encerraEm: c.encerraEm };
  }
  catch (e) { $("status").textContent = "Erro ao carregar os dados: " + texto(e); return; }
  cartoes(); ranking(); painelAdmin().catch(e => console.warn("Painel admin:", e)); aviso();
}
(async () => {
  try {
    store = await criarStore();
    if (location.hash.includes("type=recovery")) $("dlg-nova-senha").showModal();
    admin = await store.ehAdmin();
    store.aoMudar(desenhar); await desenhar();
  } catch (e) { $("status").textContent = "Não foi possível iniciar: " + texto(e); $("cards").textContent = ""; }
})();

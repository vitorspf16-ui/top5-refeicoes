// Edge Function "gerenciar-admins": criar e remover administradores. Só o master pode chamar.
// A chave privilegiada (SUPABASE_SERVICE_ROLE_KEY) é injetada pelo Supabase no servidor; nunca vai ao navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Origens autorizadas a chamar a função pelo navegador. Ajuste com: supabase secrets set ALLOWED_ORIGINS="https://a,https://b"
const ORIGENS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://vitorspf16-ui.github.io").split(",").map((s) => s.trim()).filter(Boolean);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const origem = req.headers.get("Origin") ?? "";
  const cab: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json",
  };
  if (ORIGENS.includes(origem)) cab["Access-Control-Allow-Origin"] = origem;
  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cab });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cab });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (!url || !anon || !service) { console.error("Variáveis de ambiente ausentes."); return json({ error: "Função mal configurada." }, 500); }
  if (!auth.startsWith("Bearer ")) return json({ error: "Sessão ausente. Entre novamente." }, 401);

  // 1) Identidade: o Auth valida o JWT (assinatura e expiração).
  const doUsuario = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user }, error: erroUsuario } = await doUsuario.auth.getUser();
  if (erroUsuario || !user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  // 2) Autorização: o papel é lido no banco com a chave de servidor. Nada do que o navegador enviar define o papel.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: papel, error: erroPapel } = await admin.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (erroPapel) { console.error("Falha ao consultar admins:", erroPapel.message); return json({ error: "Não foi possível verificar a permissão." }, 500); }
  if (!papel || papel.role !== "master") return json({ error: "Apenas o administrador master pode fazer isso." }, 403);

  // 3) Entrada validada rigorosamente.
  let corpo: Record<string, unknown>;
  try { const b = await req.json(); if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error(); corpo = b; }
  catch { return json({ error: "Corpo da requisição inválido." }, 400); }
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (corpo.acao === "criar") {
    const nome = texto(corpo.nome), email = texto(corpo.email).toLowerCase(), senha = typeof corpo.senha === "string" ? corpo.senha : "";
    if (!nome || nome.length > 80) return json({ error: "Informe um nome de até 80 caracteres." }, 400);
    if (!EMAIL.test(email) || email.length > 254) return json({ error: "Informe um e-mail válido." }, 400);
    if (senha.length < 8 || senha.length > 72) return json({ error: "A senha deve ter entre 8 e 72 caracteres." }, 400);

    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    if (error || !data.user) {
      console.error("createUser:", error?.message);
      return json({ error: /already|registered|exists/i.test(error?.message ?? "") ? "Já existe uma conta com esse e-mail." : "Não foi possível criar a conta." }, 400);
    }
    // O papel é SEMPRE 'admin' aqui; promover alguém a master só é possível por SQL, direto no painel do Supabase.
    const { error: erroInsert } = await admin.from("admins").insert({ user_id: data.user.id, role: "admin" });
    if (erroInsert) {
      console.error("insert admins:", erroInsert.message);
      await admin.auth.admin.deleteUser(data.user.id); // desfaz apenas a conta recém-criada nesta chamada
      return json({ error: "Não foi possível conceder a permissão. A criação foi desfeita." }, 500);
    }
    return json({ ok: true, user_id: data.user.id });
  }

  if (corpo.acao === "remover") {
    const alvo = texto(corpo.user_id);
    if (!UUID.test(alvo)) return json({ error: "Administrador inválido." }, 400);
    if (alvo === user.id) return json({ error: "Você não pode remover o seu próprio acesso." }, 400);
    // Remove só a permissão (linha em admins) e só de role = 'admin'. A conta de login é preservada; o master nunca é afetado.
    const { data, error } = await admin.from("admins").delete().eq("user_id", alvo).eq("role", "admin").select("user_id");
    if (error) { console.error("delete admins:", error.message); return json({ error: "Não foi possível remover o acesso." }, 500); }
    if (!data || data.length === 0) return json({ error: "Administrador comum não encontrado (o master não pode ser removido por aqui)." }, 404);
    return json({ ok: true });
  }

  return json({ error: "Ação inválida." }, 400);
});

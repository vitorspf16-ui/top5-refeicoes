import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") || "";
  if (!url || !anon || !service || !auth.startsWith("Bearer ")) {
    return json({ error: "Configuração ou sessão ausente." }, 401);
  }

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

  const adminClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: role, error: roleError } = await adminClient
    .from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (roleError || role?.role !== "master") return json({ error: "Apenas o administrador master pode fazer isso." }, 403);

  let body: { acao?: string; nome?: string; email?: string; senha?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Corpo da requisição inválido." }, 400); }

  if (body.acao === "criar") {
    const nome = (body.nome || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const senha = body.senha || "";
    if (!nome || !email || senha.length < 8) return json({ error: "Informe nome, e-mail e senha com pelo menos 8 caracteres." }, 400);
    if (email === "vitorspf16@gmail.com") return json({ error: "A conta master não pode ser recriada por este formulário." }, 400);

    const { data, error } = await adminClient.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome }
    });
    if (error || !data.user) return json({ error: error?.message || "Não foi possível criar a conta." }, 400);

    const { error: insertError } = await adminClient.from("admins").insert({ user_id: data.user.id, role: "admin" });
    if (insertError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return json({ error: "Conta criada, mas não foi possível conceder permissão. A conta foi revertida: " + insertError.message }, 400);
    }
    return json({ ok: true, user_id: data.user.id });
  }

  if (body.acao === "remover") {
    const target = body.user_id;
    if (!target) return json({ error: "Informe o administrador a remover." }, 400);
    if (target === user.id) return json({ error: "Você não pode remover sua própria conta master." }, 400);
    const { data: targetAdmin, error: targetError } = await adminClient
      .from("admins").select("role").eq("user_id", target).maybeSingle();
    if (targetError || !targetAdmin) return json({ error: "Administrador não encontrado." }, 404);
    if (targetAdmin.role === "master") return json({ error: "Não é permitido remover um administrador master por este painel." }, 400);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(target);
    if (deleteError) return json({ error: deleteError.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Ação inválida." }, 400);
});

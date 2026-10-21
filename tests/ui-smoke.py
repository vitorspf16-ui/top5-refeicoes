"""Teste de interface com Supabase SIMULADO (nenhuma chamada real). Requer: pip install playwright && playwright install chromium.
Uso (na raiz do projeto): python3 tests/ui-smoke.py"""
import asyncio, functools, http.server, json, socketserver, threading
from playwright.async_api import async_playwright
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory="."); H.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", 8125), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
STUB = """
const F = globalThis.__fake;
const resp = (data, error = null) => ({ data, error });
const cad = (get) => { const r = { order: () => r, eq: () => r, select: () => r, single: () => Promise.resolve(get()), maybeSingle: () => Promise.resolve(get()), then: (a, b) => Promise.resolve(get()).then(a, b) }; return r; };
export const createClient = () => ({
  auth: { getSession: async () => resp({ session: F.logado ? { user: { id: 'u' }, access_token: 't' } : { user: { id: 'anon' }, access_token: 'a' } }),
          signInAnonymously: async () => resp({}), signInWithPassword: async () => { F.logado = true; return resp({}); },
          signOut: async () => { F.logado = false; return {}; }, onAuthStateChange: () => ({ data: { subscription: {} } }), updateUser: async () => resp({}) },
  from: (t) => ({ select: () => cad(() => resp(F.tab[t] || [])), insert: () => cad(() => resp({ id: 'n' })), update: () => cad(() => resp([{ id: 'x' }])), delete: () => cad(() => resp([])) }),
  rpc: async (n, a) => { F.chamadas.push([n, a || null]); if (n === 'sou_admin') return resp(F.admin && F.logado); if (n === 'sou_admin_master') return resp(F.master && F.logado);
    if (n === 'meu_voto') return resp(null); if (n === 'config_votacao') return resp([{ agora: new Date().toISOString(), encerra_em: F.encerra }]);
    if (n === 'listar_admins') return resp([{ user_id: 'm', email: 'master@x.com', nome: 'M', role: 'master' }, { user_id: 'a', email: 'adm@x.com', nome: 'A', role: 'admin' }]);
    if (n === 'iniciar_nova_votacao') return resp({ votos_apagados: 3 }); return resp(null); },
  functions: { invoke: async () => resp({ ok: true }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'about:blank' } }) }) },
});"""
def inicial(admin, master, encerra=None, logado=False):
    return "globalThis.__fake=" + json.dumps({"admin": admin, "master": master, "logado": logado, "encerra": encerra, "chamadas": [],
      "tab": {"participantes": [{"id": "p1", "nome": "Ana Silva", "apelido": "Aninha", "ativo": True}, {"id": "p2", "nome": "Beto Souza", "apelido": "Bet", "ativo": True}],
              "votos": [{"participante_id": "p1"}, {"participante_id": "p1"}, {"participante_id": "p2"}],
              "pratos": [{"id": "r1", "nome": "Lasanha", "descricao": None, "foto_path": None, "participante_id": "p1"}]}})
async def cenario(br, nome, init, acoes=None):
    pg = await br.new_page(viewport={"width": 390, "height": 800}); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e))); pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    await pg.add_init_script(init); await pg.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    await pg.goto("http://127.0.0.1:8125/index.html"); await pg.wait_for_selector(".card"); await pg.wait_for_timeout(300)
    if acoes: await acoes(pg)
    vis = lambda s: pg.is_visible(s)
    res = {"nome": nome, "erros_console": erros, "frase": await pg.inner_text(".sub"), "aviso": await pg.inner_text("#aviso"), "ranking": await pg.inner_text("#status"),
           "admin_visivel": await vis("#admin"), "prazo": await vis("#f-prazo"), "sec_admins": await vis("#sec-admins"), "sec_master": await vis("#sec-master"),
           "lista_admins": (await pg.inner_text("#lista-admins")).replace("\n", " | ") if await vis("#sec-admins") else None,
           "largura_ok": await pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")}
    await pg.close(); return res
async def login(pg):
    await pg.click("#btn-admin"); await pg.fill("#l-email", "a@b.co"); await pg.fill("#l-senha", "x"); await pg.click("#f-login button[type=submit]"); await pg.wait_for_selector("#admin", state="visible"); await pg.wait_for_timeout(500)
async def reset(pg):
    await login(pg); await pg.click("#btn-nova"); await pg.check("#nv-ok"); await pg.click("#nv-go"); await pg.wait_for_timeout(600)
    print("   mensagem do reset:", await pg.inner_text("#nv-msg")); print("   rpcs:", [c[0] for c in await pg.evaluate("__fake.chamadas") if c[0] == "iniciar_nova_votacao"])
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        for nome, init, ac in [("visitante", inicial(False, False), None), ("admin comum", inicial(True, False, logado=True), None), ("master", inicial(True, True, logado=True), None),
                               ("master + votação encerrada", inicial(True, True, "2020-01-01T00:00:00Z", True), None), ("login + nova votação", inicial(True, True), reset)]:
            print(json.dumps(await cenario(br, nome, init, ac), ensure_ascii=False, indent=1))
        await br.close()
asyncio.run(main())

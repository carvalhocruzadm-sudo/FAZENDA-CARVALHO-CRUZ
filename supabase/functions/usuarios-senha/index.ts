// Senhas dos usuários (tela Usuários): criar o login, trocar a senha e ver a
// senha que foi criada por aqui.
// Roda no Supabase (Edge Functions) porque só daqui dá para mexer no login dos
// outros (Authentication → Users) — a chave de administrador nunca vai para o app.
//
// Criar:  Edge Functions → Deploy a new function → Via Editor
//         → nome usuarios-senha → colar este arquivo → Deploy
//         ou: supabase functions deploy usuarios-senha
// Antes, rode de novo o supabase/schema.sql (cria a tabela senhas_usuarios).
//
// Quem pode: só quem está em Usuários com perfil "Administrador (tudo)" e
// acesso liberado. (Se ainda não houver nenhum administrador cadastrado,
// qualquer login do escritório pode, para não trancar a primeira vez.)
//
// Ações (POST { acao, ... }, com o login do app):
//   ver { email }            → o login existe? qual a senha guardada?
//   ver_todos                → as mesmas informações de todos os e-mails de Usuários
//   definir { email, senha } → cria o login (se não existir) ou troca a senha, e guarda
//   anotar_minha { senha }   → quem trocou a própria senha no app guarda a nova aqui

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const limpo = (e: unknown) => String(e ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    return await atender(req);
  } catch (e) {
    return json({ erro: `Falha na função usuarios-senha: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});

/** Todos os logins do Supabase (Authentication → Users), por e-mail. */
async function logins() {
  const mapa = new Map<string, string>();
  for (let pagina = 1; pagina < 100; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email) mapa.set(limpo(u.email), u.id);
    if (data.users.length < 1000) break;
  }
  return mapa;
}

async function guardar(email: string, senha: string, quem: string) {
  const { error } = await admin.from("senhas_usuarios")
    .upsert({ email, senha, definida_por: quem, atualizado_em: new Date().toISOString() });
  if (error) {
    throw new Error(error.message.includes("senhas_usuarios")
      ? "Falta a tabela senhas_usuarios no banco: rode de novo o supabase/schema.sql no SQL Editor."
      : error.message);
  }
}

async function atender(req: Request) {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(jwt);
  const meuEmail = limpo(quem?.user?.email);
  if (!meuEmail) return json({ erro: "Entre no sistema de novo (login vencido)." }, 401);

  const corpo = await req.json().catch(() => ({}));

  // Trocou a própria senha no app ("Trocar senha"): confere e guarda a nova.
  if (corpo.acao === "anotar_minha") {
    const senha = String(corpo.senha ?? "");
    const teste = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { error } = await teste.auth.signInWithPassword({ email: meuEmail, password: senha });
    if (error) return json({ erro: "A senha não confere." }, 400);
    await guardar(meuEmail, senha, meuEmail);
    return json({ ok: true });
  }

  // Daqui em diante, só administrador.
  const { data: cadastro, error: erroCad } = await admin.from("usuarios").select("email, perfil, ativo");
  if (erroCad) throw new Error(erroCad.message);
  const admins = (cadastro ?? []).filter((u) => u.perfil === "admin" && u.ativo !== false);
  const souAdmin = admins.some((u) => limpo(u.email) === meuEmail);
  const souCampo = (cadastro ?? []).some((u) => limpo(u.email) === meuEmail && ["campo", "ticket"].includes(u.perfil));
  if (!(souAdmin || (admins.length === 0 && !souCampo))) {
    return json({
      erro: `Você entrou como ${meuEmail}, e esse e-mail não está em Usuários como "Administrador (tudo)" com acesso liberado. `
        + "Cadastre esse e-mail lá como Administrador (ou entre com o login de um administrador) e tente de novo.",
    }, 403);
  }

  switch (corpo.acao) {
    case "ver":
    case "ver_todos": {
      const emails = corpo.acao === "ver"
        ? [limpo(corpo.email)]
        : [...new Set((cadastro ?? []).map((u) => limpo(u.email)).filter(Boolean))];
      const existentes = await logins();
      const { data: senhas } = await admin.from("senhas_usuarios").select("email, senha, atualizado_em").in("email", emails);
      const porEmail = new Map((senhas ?? []).map((s) => [s.email, s]));
      return json({
        usuarios: emails.map((email) => ({
          email,
          tem_login: existentes.has(email),
          senha: porEmail.get(email)?.senha ?? null,
          atualizado_em: porEmail.get(email)?.atualizado_em ?? null,
        })),
      });
    }

    case "definir": {
      const email = limpo(corpo.email);
      const senha = String(corpo.senha ?? "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
      if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      const id = (await logins()).get(email);
      if (id) {
        const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
        if (error) return json({ erro: error.message }, 400);
      } else {
        // Login novo já confirmado: a pessoa entra direto, sem e-mail de confirmação.
        const { error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
        if (error) return json({ erro: error.message }, 400);
      }
      await guardar(email, senha, meuEmail);
      return json({ ok: true, criado: !id });
    }

    default:
      return json({ erro: "Ação desconhecida." }, 400);
  }
}

-- ════════════════════════════════════════════════════════════════════════
-- Fazenda Carvalho Cruz — aviso de despesa nova pelo ntfy
--
-- Toda despesa nova lançada pelo app (que tem "lançado por") manda uma
-- notificação para o ntfy, mesmo com o app fechado em todos os aparelhos:
-- quem manda é o próprio banco, assim que a despesa chega na nuvem.
--
-- Como usar:
--   1. SQL Editor do Supabase → cole tudo → Run. Pode rodar de novo quando
--      quiser trocar o tópico (o nome logo abaixo; maiúsculas contam).
--   2. No celular: app "ntfy" assinando o tópico FAZENDA-CC (ntfy.sh/FAZENDA-CC).
--
-- Para desligar:  drop trigger if exists despesas_ntfy on public.despesas;
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.ntfy_topico() returns text
language sql immutable as $$ select 'FAZENDA-CC' $$;

-- pg_net: o que deixa o banco chamar um endereço da internet.
create extension if not exists pg_net with schema extensions;

/** 1234.5 → 'R$ 1.234,50' */
create or replace function public.ntfy_brl(v numeric) returns text
language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,')
$$;

create or replace function public.avisar_despesa_ntfy() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Só o que veio do app: a importação das planilhas não tem "lançado por".
  if new.lancado_por is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ntfy.sh',
    body := jsonb_build_object(
      'topic', public.ntfy_topico(),
      'title', 'Despesa nova — ' || new.lancado_por,
      'message', coalesce(new.descricao, '(sem descrição)') || ' — ' || public.ntfy_brl(new.valor)
        || E'\n' || coalesce(new.categoria, 'Sem categoria')
        || coalesce(' · ' || to_char(new.data, 'DD/MM/YYYY'), '')
        || coalesce(' · ' || new.favorecido, ''),
      'tags', jsonb_build_array('money_with_wings')
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- Se o aviso falhar, a despesa grava do mesmo jeito.
  return new;
end;
$$;

drop trigger if exists despesas_ntfy on public.despesas;
create trigger despesas_ntfy
  after insert on public.despesas
  for each row execute function public.avisar_despesa_ntfy();

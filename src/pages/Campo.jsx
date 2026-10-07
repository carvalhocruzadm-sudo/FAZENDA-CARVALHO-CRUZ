import { useMemo, useState } from "react";

import Crud from "../components/Crud";
import { Abas, Icone } from "../components/ui";
import { useDados } from "../hooks/useDados";
import { gravarPessoaCampo, lerPessoaCampo } from "../lib/aparelho";

/**
 * Celular de campo: o aparelho do motorista ou do tratorista. Não tem login —
 * o administrador entra uma vez, liga o "modo campo" e daí em diante quem pega
 * o celular só toca no próprio nome. Tudo o que for lançado já sai com o nome
 * dele (operador / motorista).
 */

const DO_CAMPO = /tratorista|motorista|operador/i;
const ehMotorista = (p) => /motorista/i.test(p?.funcao ?? "");

function EscolherPessoa({ funcionarios, escolher, sair }) {
  const [todos, setTodos] = useState(false);
  const ativos = funcionarios.filter((f) => f.ativo !== false);
  const doCampo = ativos.filter((f) => DO_CAMPO.test(f.funcao ?? ""));
  const lista = (todos || !doCampo.length ? ativos : doCampo).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="login">
      <div className="cartao" style={{ maxWidth: 440 }}>
        <img src="/logo-fazenda.png" alt="Fazenda Carvalho Cruz" />
        <h2 style={{ textAlign: "center", marginBottom: 6 }}>Quem é você?</h2>
        <p className="descricao" style={{ textAlign: "center" }}>Toque no seu nome.</p>
        {lista.length === 0 ? (
          <div className="vazio">
            Nenhum funcionário neste celular ainda. Ligue a internet e espere sincronizar, ou cadastre em
            Funcionários no computador.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {lista.map((p) => (
              <button key={p.id} className="btn" onClick={() => escolher(p.id)}
                style={{ justifyContent: "space-between", padding: "14px 16px", fontSize: 16 }}>
                <b>{p.nome}</b>
                <small style={{ color: "var(--texto-2)" }}>{p.funcao}</small>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
          {doCampo.length > 0 && doCampo.length < ativos.length && (
            <button className="btn" onClick={() => setTodos(!todos)}>
              {todos ? "Só motoristas e tratoristas" : "Não estou na lista"}
            </button>
          )}
          <button className="btn" onClick={sair} title="Precisa da senha do administrador para voltar">
            <Icone nome="sair" /> Sair do modo campo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Campo({ indicador, sair }) {
  const { dados, pronto, erro, salvar, remover } = useDados();
  const [pessoaId, setPessoaId] = useState(lerPessoaCampo);
  const [aba, setAba] = useState("operacoes");

  const pessoa = dados.funcionarios.find((f) => f.id === pessoaId);

  const escolher = (id) => {
    gravarPessoaCampo(id);
    setPessoaId(id);
    window.scrollTo(0, 0);
  };

  const abas = useMemo(() => {
    if (!pessoa) return [];
    const doOperador = (r) => r.operador_id === pessoa.id;
    const lista = [
      ["operacoes", "Horímetro / serviço", { colecao: "operacoes", filtro: doOperador, padrao: { operador_id: pessoa.id } }],
      ["abastecimentos", "Abastecimento", { colecao: "abastecimentos", filtro: doOperador, padrao: { operador_id: pessoa.id } }],
    ];
    if (ehMotorista(pessoa)) {
      lista.push(["fretes", "Fretes", { colecao: "fretes", filtro: (r) => r.motorista_id === pessoa.id, padrao: { motorista_id: pessoa.id } }]);
    }
    return lista;
  }, [pessoa]);

  if (!pronto) return <div className="vazio">Carregando…</div>;
  if (!pessoa) {
    return (
      <>
        {erro && <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>}
        <EscolherPessoa funcionarios={dados.funcionarios} escolher={escolher} sair={sair} />
      </>
    );
  }

  const [atual, , config] = abas.find(([id]) => id === aba) ?? abas[0];

  return (
    <div className="app">
      <main className="principal">
        <header className="topo">
          <h1>{pessoa.nome}</h1>
          <button className="btn" onClick={() => escolher(null)}><Icone nome="pessoas" /> Trocar</button>
          {indicador}
        </header>
        <div className="conteudo">
          {erro && <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>}
          <Abas abas={abas.map(([id, rotulo]) => [id, rotulo])} atual={atual} aoTrocar={setAba} />
          <Crud key={atual} {...config} dados={dados} salvar={salvar} remover={remover} />
        </div>
      </main>
    </div>
  );
}

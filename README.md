# 🌾 Fazenda Carvalho Cruz — Sistema de Gestão

Sistema de gestão da **Fazenda Carvalho Cruz**, uma fazenda de várias culturas (milho, laranja, abóbora,
amendoim, silagem, milho verde, confinamento) espalhadas por várias fazendas e talhões.

É um app **React + Vite** que se instala no celular como **PWA**. Ele **funciona sem internet**
(os dados ficam no aparelho, em IndexedDB, e sobem para a nuvem quando o sinal volta) e guarda tudo no
**Supabase**. É o mesmo jeito de funcionar do sistema da Distribuidora, mas é um sistema separado, com
banco próprio.

## ✅ O que já tem

| Menu | O que faz |
|---|---|
| **Painel** | Vendas, entrou/saiu do caixa, resultado, a receber, diesel no tanque e avisos: revisão vencendo, estoque baixo ou negativo, contas vencendo. |
| **Lavoura e talhões** | Fazendas, talhões/sítios (área, cultura, nº de pés), culturas (dá para **adicionar culturas novas**; cada uma diz o tipo — citros, grãos, hortaliças, forragem, pecuária —, em que é colhida e vendida, o peso da saca, a medida de produtividade — t/ha, sc/ha, kg/pé, cx/pé — e se a colheita é por turma), colheitas e **planejamento da safra** por fase (dessecação, plantio, coberturas, pulverizações), com dose/ha × hectares × preço, como na aba PLANEJAMENTO. |
| **Ticket da balança** | Tela rápida para lançar os tickets que o gerente manda no grupo do WhatsApp: venda de quê, data, peso, talhão e, na laranja, a turma de colheita e o valor dela por tonelada. Abre direto pelo link **`/ticket`** (fixe no grupo). A carga entra em Vendas sem comprador e sem preço, para completar depois. |
| **Vendas** | Uma linha por **carga**, como nas planilhas de milho, laranja e silagem: tara, peso bruto e líquido, placa, sítio, tipo (BOA/SUKITA/CASQUINOL), desconto em kg, preço por t, saca, arroba ou saco, custo/ton, frete, comissão e juros. **Recebimentos** separados e o **saldo a receber de cada comprador**. |
| **Financeiro** | Despesas nas categorias da planilha FINANCEIRO (Alimentação, Produtos químicos, Adubos, Peças, Serviços, Combustíveis, Salários, Taxas, Benfeitorias, Investimentos, Arrendamentos, Empréstimos, Retiradas…), com forma de pagamento, favorecido e **centro de custo** (geral, cultura ou talhão). Outras entradas (aditivo dos sócios, empréstimos). **Custo por cultura e por talhão** (R$/ha). **Comprovante** anexado em cada despesa (foto ou PDF). |
| **Máquinas e horímetro** | Inventário de tratores, implementos, caminhões e veículos. Lançamento de **horímetro por operação** (máquina, operador, talhão, horas). Revisões feitas e **aviso de revisão** pelo intervalo em horas ou km. Consumo em L/h ou km/L. |
| **Diesel** | O **tanque da fazenda**: compras (entrada) e abastecimentos (saída), com saldo em litros e preço médio. Abastecimentos em **posto** também. |
| **Químicos e insumos** | Produtos, entradas (compras) e aplicações por talhão. **Estoque** = entradas − aplicações, com custo médio, estoque mínimo e valor em estoque. |
| **Caminhões e fretes** | Fretes próprios (contratante, produto, origem, destino, peso, R$/ton, km), abastecimentos e custos do caminhão; resultado e **R$/km**, como na planilha FRETES. |
| **Funcionários** | Gerentes, tratoristas, trabalhadores de campo, motoristas, secretária… |
| **Sincronização** | O que ainda falta enviar para a nuvem, erros e "recarregar tudo da nuvem". |

Toda lista tem busca, filtro de período, total no rodapé, botão **Planilha** (baixa CSV que abre no
Excel) e **repetir lançamento** (o botão `+` da linha), bom para lançar várias cargas parecidas.

O cadastro inicial já vem com as culturas, as fazendas e os sítios da laranja com área e nº de pés
(tirados da aba CADASTROS da planilha VENDAS_LARANJA).

### 📎 Lançar despesa pelo comprovante do banco
No **Android**, com o app instalado na tela inicial ("Adicionar à tela inicial" / "Instalar app" no
Chrome): no app do banco, toque em **Compartilhar** no comprovante e escolha **Fazenda CC**. O app abre
com o comprovante na tela; é só tocar na **categoria**, escrever a **descrição**, conferir o valor e
**Salvar despesa**. Funciona sem internet: o comprovante sobe para a nuvem na próxima sincronização.

No **iPhone** o sistema não deixa app de navegador aparecer no Compartilhar: lance a despesa em
Financeiro → Despesas → Novo e use **Anexar foto ou PDF** no campo Comprovante.

Os arquivos ficam no Storage do Supabase, numa pasta privada (`comprovantes`) criada pelo
`supabase/schema.sql` — rode o SQL de novo depois de atualizar.

### Próximas etapas
- **Emissão de NF-e** (por enquanto a venda guarda só o número da nota).
- Perfis de acesso (o que cada funcionário pode ver e lançar).
- Venda de laranja de terceiros, cotação de produtos.

## 🚀 Como rodar

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm run build      # gera a versão de produção em dist/
npm run lint
```

Sem Supabase configurado o app abre em **modo demonstração**: funciona, mas guarda tudo só no navegador.

## 🗄️ Ligar ao Supabase (banco na nuvem)

1. Crie um projeto novo em [supabase.com](https://supabase.com) — **um projeto só da fazenda**, separado do
   da Distribuidora.
2. No projeto, abra **SQL Editor**, cole todo o arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique
   em **Run**. Ele cria as tabelas, as regras de acesso e o cadastro inicial. Pode rodar de novo sempre que o
   sistema ganhar campos novos: ele só acrescenta, nunca apaga.
3. Em **Authentication → Users → Add user**, crie o login (e-mail e senha) de cada pessoa que vai usar.
4. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (**Project Settings → Data API / API Keys**).

## 👨‍🌾 Link do agrônomo

Em **Químicos e insumos → Link do agrônomo**, escreva o nome do agrônomo e clique em **Criar link**. Copie o
link (ou use **Enviar pelo WhatsApp**). Quem abre o link **não precisa de senha** e vê **só o estoque de
químicos** (sem preços, vendas ou financeiro). Ele pode:

- ver o estoque **por produto, fabricante, tipo, princípio ativo ou validade**, com busca e foto do rótulo;
- marcar os produtos, clicar em **Criar aplicação** (talhão, área, alvo, dose por hectare) e **enviar para a
  fazenda** e/ou **baixar o PDF**.

A aplicação enviada aparece em **Químicos e insumos → Aplicações do agrônomo**, onde você baixa o PDF, aprova ou
**dá baixa no estoque** (isso lança as saídas no talhão). Para desligar o acesso, desative ou apague o link.

Para funcionar, rode de novo o `supabase/schema.sql` no SQL Editor (ele cria as funções do link).
Para o agrônomo ver a **validade**, lance a data de validade nas **Entradas / compras**.

## 🤖 Consulta de produto (uso, dose e substitutos)

No cadastro de um produto, o botão **Consultar uso, dose e substitutos** pesquisa pelo nome comercial e
fabricante. Para funcionar, uma vez só (precisa do [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy consultar-produto
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # chave de console.anthropic.com
```

A chave fica guardada no Supabase (nunca no app) e só quem está logado consegue consultar. Cada consulta
tem um pequeno custo na conta da Anthropic. O resultado é apoio: vale o rótulo/bula e o agrônomo.

## 📥 Histórico das planilhas

[`supabase/importacao-historico.sql`](supabase/importacao-historico.sql) traz o histórico das planilhas
(vendas de milho, silagem e laranja de 2025 e 2026 com os recebimentos, despesas das planilhas
FINANCEIRO 2025 e 2026, aditivos dos sócios e os fretes do caminhão). Cole no **SQL Editor** e clique em **Run**. Pode rodar de novo sem duplicar.
Para desfazer: `delete from public.<tabela> where importado is not null;`.

Para gerar de novo a partir das planilhas atualizadas:

```bash
pip install openpyxl
python3 scripts/importar-planilhas.py <pasta com os .xlsx>
```

O script confere se o valor líquido de cada venda bate com a conta do sistema e lista as datas que
estavam digitadas erradas (e como ficaram).

[`supabase/importacao-comprovantes.sql`](supabase/importacao-comprovantes.sql) traz as despesas do grupo
de WhatsApp *COMPROVANTES - CARVALHO CRUZ* (dez/2025 a set/2026), lidas dos comprovantes e cruzadas com as
planilhas FINANCEIRO — o que já estava nelas não entra de novo. Para desfazer:
`delete from public.despesas where importado = 'WHATSAPP';`.

## ☁️ Publicar no Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e escolha este repositório.
2. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. **Deploy**. O `vercel.json` já está pronto.
4. Em **Settings → Environments → Production**, deixe a *Branch Tracking* em `main`: o site oficial
   sai sempre da `main`.

No celular, abra o endereço do site e use **Adicionar à tela inicial** para instalar como app.

## 🛠️ Para quem for mexer no código

- **Tudo nasce do esquema**: [`src/lib/esquema.js`](src/lib/esquema.js) descreve cada tabela: campos,
  rótulos, contas automáticas e o que se preenche sozinho. A tela de cadastro, o formulário e o banco saem daí.
- Mudou o esquema? Rode `npm run schema` para regerar `supabase/schema.sql` e rode o SQL no Supabase.
  Coleção nova também exige subir `DB_VERSAO` em [`src/lib/db.js`](src/lib/db.js).
- As contas (estoque, diesel, custos, a receber, revisões) ficam em
  [`src/lib/calculos.js`](src/lib/calculos.js) e são sempre refeitas a partir dos lançamentos.
- Offline: [`src/lib/db.js`](src/lib/db.js) (IndexedDB + fila) e [`src/lib/sync.js`](src/lib/sync.js)
  (envia a fila em ordem e depois puxa tudo da nuvem).

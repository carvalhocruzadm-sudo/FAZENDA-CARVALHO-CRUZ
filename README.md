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
| **Avisos do campo** | Tudo o que é lançado no **Modo Campo** (abastecimento, depósito) e cada **ticket da balança**, com **sininho e contador** no alto da tela e balão quando chega algo novo. Também vai para o celular pelo app **ntfy** (veja abaixo). |
| **Lavoura e talhões** | Fazendas, talhões/sítios (área, cultura, nº de pés), culturas (dá para **adicionar culturas novas**; cada uma diz o tipo — citros, grãos, hortaliças, forragem, pecuária —, em que é colhida e vendida, o peso da saca, a medida de produtividade — t/ha, sc/ha, kg/pé, cx/pé — e se a colheita é por turma), colheitas e **planejamento da safra** por fase (dessecação, plantio, coberturas, pulverizações), com dose/ha × hectares × preço, como na aba PLANEJAMENTO. |
| **Ticket da balança** | Tela rápida para lançar os tickets que o gerente manda no grupo do WhatsApp: venda de quê, data, peso, talhão e, na laranja, a turma de colheita e o valor dela por tonelada. Abre direto pelo link **`/ticket`** (fixe no grupo). A carga entra em Vendas sem comprador e sem preço, para completar depois. |
| **Vendas** | Uma linha por **carga**, como nas planilhas de milho, laranja e silagem: tara, peso bruto e líquido, placa, sítio, tipo (BOA/SUKITA/CASQUINOL), desconto em kg, preço por t, saca, arroba ou saco, custo/ton, frete, comissão e juros. **Recebimentos** separados e o **saldo a receber de cada comprador**. **Emissão de NF-e pelo Bling** (aba *Notas fiscais*) e cadastro dos **Compradores** com os dados da nota. |
| **Financeiro** | Despesas nas categorias da planilha FINANCEIRO (Alimentação, Produtos químicos, Adubos, Peças, Serviços, Combustíveis, Salários, Taxas, Benfeitorias, Investimentos, Arrendamentos, Empréstimos, Retiradas…), com forma de pagamento, favorecido e **centro de custo** (geral, cultura ou talhão). Outras entradas (aditivo dos sócios, empréstimos). **Custo por cultura e por talhão** (R$/ha). **Comprovante** anexado em cada despesa (foto ou PDF). |
| **Programação de pagamentos** | Contas a pagar por **boleto, PIX, transferência, cartão, cheque ou dinheiro**. No boleto, **lê o código** pela câmera do celular (código de barras), por uma foto ou pela linha digitável colada/digitada: o **valor**, o **vencimento** e o banco se preenchem sozinhos; só falta dizer a **empresa**. Os boletos aparecem num **calendário do mês** (vermelho = vencido, amarelo = vence nesta semana, verde = pago), com total a pagar e pago no mês. Ao **pagar**, já lança em Despesas com a forma de pagamento escolhida. O Painel avisa dos pagamentos vencidos e dos que vencem em 7 dias. |
| **Máquinas e horímetro** | Inventário de tratores, implementos, caminhões e veículos. Lançamento de **horímetro por operação** (máquina, operador, talhão, horas). Revisões feitas e **aviso de revisão** pelo intervalo em horas ou km. Consumo em L/h ou km/L. |
| **Diesel** | O **tanque da fazenda**: compras (entrada) e abastecimentos (saída), com saldo em litros e preço médio. Abastecimentos em **posto** também. |
| **Químicos e insumos** | Produtos, entradas (compras) e aplicações por talhão. **Estoque** = entradas − aplicações, com custo médio, estoque mínimo e valor em estoque. |
| **Caminhões e fretes** | Fretes próprios (contratante, produto, origem, destino, peso, R$/ton, km), abastecimentos e custos do caminhão; resultado e **R$/km**, como na planilha FRETES. |
| **Pluviômetro** | A chuva da fazenda: cada leitura com os milímetros, quem leu e a **foto do pluviômetro** (obrigatória). Mostra a chuva de hoje, dos últimos 7 dias, do mês, do ano e **mês a mês**. No celular (Modo Campo), tratoristas e o **Lançador de ticket** têm o botão **Lançar chuva**. |
| **Funcionários** | Gerentes, tratoristas, trabalhadores de campo, motoristas, secretária… |
| **Sincronização** | O que ainda falta enviar para a nuvem, erros e "recarregar tudo da nuvem". |

Toda lista tem busca, filtro de período, total no rodapé, botão **Planilha** (baixa CSV que abre no
Excel) e **repetir lançamento** (o botão `+` da linha), bom para lançar várias cargas parecidas.

O cadastro inicial já vem com as culturas, as fazendas e os sítios da laranja com área e nº de pés
(tirados da aba CADASTROS da planilha VENDAS_LARANJA).

### 🚜 Modo Campo (tratoristas, no celular)

Telas feitas para quem não lê: uma pergunta por tela, fotos e figuras grandes, teclado de números
gigante e o botão 🔊 que lê a pergunta em voz alta. O Modo Campo abre com três botões grandes:
**⛽ Abastecer trator**, **📤 Tirar do depósito** e **📥 Guardar no depósito**.

**Abastecer trator** (no PA, todo fim de dia): toca na foto do trator e responde:
1. **Quem é você?** (toca na própria foto)
2. **Qual serviço?** (figuras)
3. **Qual fazenda?** (só aparece com mais de uma fazenda)
4. **Qual talhão?** (só os da fazenda escolhida; pode marcar mais de um)
5. **Horímetro agora** + foto do painel
6. **Litros de diesel** + foto da bomba
7. **Está certo?** → Salvar

O sistema pega o último horímetro do trator e calcula as horas trabalhadas e os litros por hora. Com
mais de um talhão, **as horas e o diesel são divididos pela área (ha)** de cada um. Os lançamentos
aparecem sozinhos em **Diesel → Abastecimentos** (baixa o tanque) e em **Máquinas → Horímetro /
operações**. Horímetro menor que o anterior, ou mais de 24 h desde o último, sai marcado com
"CONFERIR" na observação.

**Tudo se cadastra pelo sistema**, no menu **Modo Campo**:
- **Serviços**: nome, figura (🚜 🌱 💦 ✂️ 🍊…) e, se quiser, uma foto. Serviço que não se usa mais:
  desmarque Ativo. (Abrindo o Modo Campo com o login do escritório, a tela "Qual serviço?" tem o botão
  **Cadastrar ou editar serviços**.)
- **Operadores (fotos)**: a foto do rosto de cada tratorista (é por ela que ele se acha na tela).
- **Tratores (fotos)**: a foto de cada trator.
- **Talhões**: nome, fazenda, área (ha, usada na divisão) e foto, se quiser.
- **Produtos do depósito (fotos)**: as fotos do rótulo (a primeira é a que o tratorista vê).

Os números no alto mostram quantos tratoristas, tratores e produtos ainda estão sem foto.

**Áudio**: o botão 🔊 grande no alto lê a pergunta da tela (e, no horímetro e nos litros, o número
digitado; na tela "Está certo?", o resumo inteiro). Cada foto/figura tem um 🔊 pequeno que lê o nome
sem escolher, para o tratorista ouvir antes de tocar.

**Para ligar** (uma vez):
1. Rode de novo o [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor** (cria o lugar das fotos
   e as regras da conta de campo).
2. Em **Authentication → Users → Add user**, crie **um** usuário para todos os celulares do campo, por
   exemplo `campo@fazendacarvalhocruz.com` (o e-mail não precisa existir; marque Auto Confirm User).
   Depois, no sistema, em **Usuários → Novo**, coloque o mesmo e-mail com o perfil **Tratorista (só o
   Modo Campo, no celular)**. Os tratoristas não precisam de login próprio: cada um se identifica
   tocando na própria foto.
   Essa conta só abre o Modo Campo: não vê financeiro, vendas nem compras, e não apaga nada.
3. Em cada celular, abra o site, entre com essa conta **uma vez** e use **Adicionar à tela inicial**.

Quem tem o login do escritório também pode abrir o Modo Campo pelo botão no menu **Modo Campo**, para testar.

### 🧴 Depósito de químicos

**No escritório**
- **Químicos → Produtos**: fotos do rótulo (a primeira é a que o tratorista vê), tipo e tamanho da
  embalagem (ex.: Galão de 5 L). Com a embalagem, o tratorista vê "pegue 2 galões de 5 L e mais 3,2 L".
- **Químicos → Ordens de pulverização**: o gerente cria a ordem com talhão (a área vem sozinha),
  trator e produtos com a dose por ha. O total é dose × área. Dá para **copiar os produtos do
  Planejamento da safra**.

**Tirar do depósito (separar a pulverização)**
1. Escolhe a pulverização (cartão com o talhão e as fotos dos produtos) e toca na própria foto.
2. Vê a lista de produtos. Em cada um: foto grande, as embalagens desenhadas e o botão
   **✓ Peguei este** — confere pela foto e toca. A saída é lançada e o estoque baixa.
3. Todos separados → a ordem fica "Separada".

**Guardar no depósito**
- **Produto novo**: toca na foto do produto, escolhe quantas embalagens com os botões − e +, tira foto
  do produto ou da nota. Chega no sistema **sem preço e marcada "Falta conferir"**; o Painel e a aba
  Estoque avisam. O escritório completa valor e nota e desmarca. O custo médio só conta as entradas
  com preço.
- **Sobrou da pulverização**: escolhe a pulverização e o produto e digita quanto voltou (não deixa
  voltar mais do que saiu). Vira uma aplicação negativa: o estoque sobe e o custo do talhão fica só com
  o que foi usado. Ao terminar, a ordem fica "Concluída".

### 📎 Lançar despesa pelo comprovante do banco
No **Android**, com o app instalado na tela inicial ("Adicionar à tela inicial" / "Instalar app" no
Chrome): no app do banco, toque em **Compartilhar** no comprovante e escolha **Fazenda CC**. O app abre
com o comprovante na tela; é só tocar na **categoria**, escrever a **descrição**, conferir o valor e
**Salvar despesa**. Funciona sem internet: o comprovante sobe para a nuvem na próxima sincronização.

No **iPhone** o sistema não deixa app de navegador aparecer no Compartilhar, então o caminho é um
**Atalho** (app *Atalhos*), igual ao da Distribuidora: no app do banco, **Compartilhar → Comprovante
Fazenda**. O Atalho manda o arquivo para `api/comprovante.js`, que o guarda na pasta `caixa/`, e abre
o app, que já mostra a tela *Lançar comprovante* com PIX e **valor, data e favorecido** lidos dele. O que não for lançado fica em **Comprovantes recebidos**, no alto de Financeiro → Despesas
(*Ver*, *Lançar* ou jogar fora). Precisa de internet.

Configuração (uma vez):
1. Vercel → Settings → Environment Variables, sem `VITE_` na frente: `COMPROVANTE_TOKEN` (uma senha
   longa inventada; vai no Atalho) e `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API
   Keys → *service_role*; fica só na Vercel). Depois, Redeploy.
2. No iPhone, app **Atalhos** → **+**, nome **Comprovante Fazenda** (ou duplique o da Distribuidora):
   - **ⓘ** → ligue **Mostrar na Planilha de Compartilhamento**, tipos **Imagens** e **PDFs**.
   - **Se** *Entrada do Atalho* **é** *Imagem* → **Converter Imagem** → **JPEG** (foto HEIC é recusada).
   - **Obter Conteúdo da URL**: `https://fazenda-carvalho-cruz.vercel.app/api/comprovante`, método
     **POST**, cabeçalho `Authorization` = `Bearer SUA-SENHA`, corpo **Arquivo**.
   - **Mostrar Notificação** com o *Conteúdo da URL* (mostra "ok" ou o erro).
   - **Abrir URLs**: `https://fazenda-carvalho-cruz.vercel.app/?comprovantes`.

**Várias culturas ou fazendas no mesmo comprovante.** Na tela *Lançar comprovante*, com centro de custo
*Geral* ou *Cultura*, dá para marcar uma, várias ou **todas** as culturas e fazendas. O valor é dividido
igual ou pela área (ha) — dá para corrigir cada parte — e cada combinação vira uma despesa com o mesmo
comprovante. A soma das partes precisa bater com o valor pago.

Limite de 4 MB por arquivo. Se o celular for perdido, troque o `COMPROVANTE_TOKEN` na Vercel.
Abrir `https://fazenda-carvalho-cruz.vercel.app/api/comprovante` no navegador mostra se falta algo.

**Leitura do valor e do favorecido.** O PDF com texto é lido no próprio aparelho; foto, print e PDF
escaneado vão para a IA do Google (Gemini, a mesma chave da leitura do ticket). Só preenche o que está
vazio — confira antes de salvar. Vale para o Atalho do iPhone e para o Compartilhar do Android.
Uma vez só, com a `GEMINI_API_KEY` já cadastrada (ver *Leitura do ticket*): Supabase → **Edge Functions
→ Deploy a new function → Via Editor**, nome `ler-comprovante`, cole
[`supabase/functions/ler-comprovante/index.ts`](supabase/functions/ler-comprovante/index.ts) → **Deploy**.

Os arquivos ficam no Storage do Supabase, numa pasta privada (`comprovantes`) criada pelo
`supabase/schema.sql` — rode o SQL de novo depois de atualizar.

### Próximas etapas
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

## 🤖 Consulta de produto (princípio ativo, uso, dose e substitutos)

No cadastro de um produto, o botão **Consultar uso, dose e substitutos** pesquisa pelo nome comercial e
fabricante; na aba Produtos, **Preencher princípios ativos** pesquisa os que a tabela do app não conhece.
Usa a IA do Google (Gemini) com pesquisa na internet, com a mesma chave `GEMINI_API_KEY` do ticket.
Para funcionar, uma vez só: no Supabase, **Edge Functions → Deploy a new function → Via Editor**, nome
`consultar-produto`, cole o arquivo `supabase/functions/consultar-produto/index.ts` e clique em **Deploy**
(ou `supabase functions deploy consultar-produto`).

O resultado é apoio: vale o rótulo/bula e o agrônomo.

## 📷 Leitura da foto do ticket da balança

A foto do ticket é lida pela IA: **placa, tipo de carro, tara (entrada), bruto (saída), peso líquido,
desconto, comprador, motorista e nota fiscal** vêm preenchidos sozinhos.

- No **Ticket da balança** (lançamento do gerente), é só mandar a foto: os campos aparecem preenchidos para conferir.
- No **Editar venda** / **Editar ticket**, uma venda com foto e sem placa/pesos é lida sozinha ao abrir
  (e o botão **Puxar os dados da foto do ticket** lê de novo). Só preenche o que está vazio.
- Ticket repartido em vários talhões/turmas: tara e bruto são do caminhão inteiro, então vão para a observação.

Usa a IA do Google (Gemini), no **plano gratuito**. Uma vez só:

1. Em **aistudio.google.com**, entre com a conta Google → **Get API key** → **Create API key** e copie a chave.
2. No Supabase → **Edge Functions → Secrets**: Name `GEMINI_API_KEY`, Value a chave → **Save**.
3. Publique a função `ler-ticket` (Edge Functions → Deploy a new function → Via Editor, colando
   `supabase/functions/ler-ticket/index.ts`; ou `supabase functions deploy ler-ticket`).

O plano gratuito tem um limite por dia (bem acima do número de tickets da fazenda) e o Google pode usar
as fotos para melhorar a IA dele.

## 🧾 Emissão de NF-e pelo Bling

A nota é emitida na conta do Bling da fazenda: o sistema monta a nota a partir da venda e o Bling manda para a
SEFAZ. Os impostos e o CFOP vêm da **natureza de operação** cadastrada no Bling (peça ao contador para deixar
pronta a de venda da produção). Configuração, uma vez só:

1. **Criar o aplicativo no Bling**: no Bling, menu **Preferências → Sistema → Central de extensões → Área do
   integrador → Criar aplicativo** (tipo *Aplicativo privado/API*). Em **Link de redirecionamento** coloque
   `https://SEU-PROJETO.supabase.co/functions/v1/bling`. Em **Escopos**, marque *Notas Fiscais* (com
   as opções de dentro). Se existir, marque também *Naturezas de Operação*; se não existir, o app pede o número
   da natureza em vez de mostrar a lista. Salve e copie o **Client ID** e o **Client Secret**.
2. **Publicar a função no Supabase** (precisa do [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase functions deploy bling --no-verify-jwt
   supabase secrets set BLING_CLIENT_ID=... BLING_CLIENT_SECRET=...
   ```
   (O `--no-verify-jwt` é porque o Bling chama a função de volta sem login; as ações do app conferem o login lá dentro.)
3. **Rodar o `supabase/schema.sql`** de novo no SQL Editor (cria Compradores, Notas fiscais e a conexão com o Bling).
4. No app, **Vendas → Notas fiscais (Bling) → Conectar ao Bling**, autorize e clique em **Já autorizei**. Escolha
   a natureza de operação.
5. Em **Lavoura → Culturas**, preencha o **NCM** de cada cultura vendida; em **Vendas → Compradores**, os dados
   de cada comprador (o nome igual ao das vendas).

Daí em diante: **Notas fiscais → Nota** na venda → **Emitir NF-e**. Autorizada, o número entra sozinho na venda e
aparece o link do DANFE. Rejeitada, aparece o motivo; corrija e clique em **Emitir de novo** (corrige a mesma
nota no Bling). **Cancelar** ou **carta de correção**: pelo próprio Bling.

As chaves do Bling ficam só no Supabase (tabela `bling_conexao`, trancada) e se renovam sozinhas. Se ficar mais
de 30 dias sem emitir, o Bling pede para conectar de novo.

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

[`supabase/importacao-atualizacao-out2026.sql`](supabase/importacao-atualizacao-out2026.sql) traz só o que
era novo nas planilhas de 13/10/2026 (4 cargas de milho do NEWTON e 4 de silagem). O resto já batia linha a
linha com o sistema. O script de importação aceita a pasta com só algumas planilhas: as que faltarem ficam de fora.

[`supabase/importacao-planejamento.sql`](supabase/importacao-planejamento.sql) traz o planejamento do milho
(abas PLANEJAMENTO de MILHO_2025 e MILHO_2026 e SOCIEDADE GILBERTO): um item por produto de cada fase e um
item para operacional, colheita, arrendamento e juros de cada fazenda. Cria só os produtos e fazendas que
faltam no cadastro (compara o nome sem acento). Para desfazer:
`delete from public.planejamento where importado is not null;`. Para gerar de novo:

```bash
python3 scripts/importar-planejamento.py <pasta com os .xlsx>
```

## ☁️ Publicar no Vercel

1. Em [vercel.com](https://vercel.com), **Add New → Project** e escolha este repositório.
2. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. **Deploy**. O `vercel.json` já está pronto.
4. Em **Settings → Environments → Production**, deixe a *Branch Tracking* em `main`: o site oficial
   sai sempre da `main`.

No celular, abra o endereço do site e use **Adicionar à tela inicial** para instalar como app.

### 🔔 Notificação no celular (app ntfy)

1. Invente um nome difícil de adivinhar para o canal, por exemplo `fazenda-cc-avisos-8k3p2`
   (quem souber o nome recebe as mensagens — por isso ele não fica aqui no GitHub, que é público).
2. No Vercel, em **Settings → Environment Variables**, cadastre `VITE_NTFY_TOPICO` com esse nome e
   faça um **Redeploy**.
3. Em cada celular que vai receber: instale o app **ntfy**, toque em **+** e digite o mesmo nome.

Pronto: cada lançamento do celular de campo chega como notificação. Se o celular de campo estiver sem
internet, a notificação sai quando o sinal voltar.

## 🛠️ Para quem for mexer no código

- **Tudo nasce do esquema**: [`src/lib/esquema.js`](src/lib/esquema.js) descreve cada tabela: campos,
  rótulos, contas automáticas e o que se preenche sozinho. A tela de cadastro, o formulário e o banco saem daí.
- Mudou o esquema? Rode `npm run schema` para regerar `supabase/schema.sql` e rode o SQL no Supabase.
  Coleção nova também exige subir `DB_VERSAO` em [`src/lib/db.js`](src/lib/db.js).
- As contas (estoque, diesel, custos, a receber, revisões) ficam em
  [`src/lib/calculos.js`](src/lib/calculos.js) e são sempre refeitas a partir dos lançamentos.
- Offline: [`src/lib/db.js`](src/lib/db.js) (IndexedDB + fila) e [`src/lib/sync.js`](src/lib/sync.js)
  (envia a fila em ordem e depois puxa tudo da nuvem).

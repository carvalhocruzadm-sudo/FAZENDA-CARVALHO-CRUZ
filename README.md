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
| **Lavoura e talhões** | Fazendas, talhões/sítios (área, cultura, nº de pés), culturas (dá para **adicionar culturas novas**), colheitas e **planejamento da safra** por fase (dessecação, plantio, coberturas, pulverizações), com dose/ha × hectares × preço, como na aba PLANEJAMENTO. |
| **Vendas** | Uma linha por **carga**, como nas planilhas de milho, laranja e silagem: tara, peso bruto e líquido, placa, sítio, tipo (BOA/SUKITA/CASQUINOL), desconto em kg, preço por t, saca, arroba ou saco, custo/ton, frete, comissão e juros. **Recebimentos** separados e o **saldo a receber de cada comprador**. |
| **Financeiro** | Despesas nas categorias da planilha FINANCEIRO (Alimentação, Produtos químicos, Adubos, Peças, Serviços, Combustíveis, Salários, Taxas, Benfeitorias, Investimentos, Arrendamentos, Empréstimos, Retiradas…), com forma de pagamento, favorecido e **centro de custo** (geral, cultura ou talhão). Outras entradas (aditivo dos sócios, empréstimos). **Custo por cultura e por talhão** (R$/ha). |
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

### 🚜 Modo Campo (tratoristas, pelo QR code)

Telas feitas para quem não lê: uma pergunta por tela, fotos e figuras grandes, teclado de números
gigante e o botão 🔊 que lê a pergunta em voz alta.

**Abastecimento no PA**: cada trator tem um QR code (menu **Modo Campo (QR) → QR codes para imprimir**). O tratorista lê o QR com a câmera do celular e responde:
1. **Quem é você?** (toca na própria foto)
2. **Qual serviço?** (figuras)
3. **Qual talhão?** (pode marcar mais de um)
4. **Horímetro agora** + foto do painel
5. **Litros de diesel** + foto da bomba
6. **Está certo?** → Salvar

O sistema pega o último horímetro do trator e calcula as horas trabalhadas e os litros por hora. Com
mais de um talhão, **as horas e o diesel são divididos pela área (ha)** de cada um. Os lançamentos
aparecem sozinhos em **Diesel → Abastecimentos** (baixa o tanque) e em **Máquinas → Horímetro /
operações**. Horímetro menor que o anterior, ou mais de 24 h desde o último, sai marcado com
"CONFERIR" na observação.

**Tudo se cadastra pelo sistema**, no menu **Modo Campo (QR)**:
- **Serviços**: nome, figura (🚜 🌱 💦 ✂️ 🍊…) e, se quiser, uma foto. Serviço que não se usa mais: desmarque Ativo.
- **Operadores (fotos)**: a foto do rosto de cada tratorista (é por ela que ele se acha na tela).
- **Tratores (fotos)**: a foto de cada trator (sai também na etiqueta QR).
- **Talhões**: nome, área (ha, usada na divisão) e foto, se quiser.
- **QR codes para imprimir**.

Os números no alto mostram quantos tratoristas e tratores ainda estão sem foto.

**Áudio**: o botão 🔊 grande no alto lê a pergunta da tela (e, no horímetro e nos litros, o número
digitado; na tela "Está certo?", o resumo inteiro). Cada foto/figura tem um 🔊 pequeno que lê o nome
sem escolher, para o tratorista ouvir antes de tocar.

**Para ligar** (uma vez):
1. Rode de novo o [`supabase/schema.sql`](supabase/schema.sql) no **SQL Editor** (cria o lugar das fotos
   e as regras da conta de campo).
2. Em **Authentication → Users → Add user**, crie um usuário para os celulares dos tratoristas, por
   exemplo `campo@fazendacarvalhocruz.com`, e rode no SQL Editor (trocando o e-mail):
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"perfil":"campo"}'
   where email = 'campo@fazendacarvalhocruz.com';
   ```
   Essa conta só abre o Modo Campo: não vê financeiro, vendas nem compras, e não apaga nada.
3. No celular de cada tratorista, abra o site, entre com essa conta **uma vez** e use **Adicionar à
   tela inicial**. Depois é só ler os QR codes.

Quem tem o login do escritório também pode abrir o Modo Campo pelo botão **Modo Campo** no menu, para testar.

### Próximas etapas
- **Depósito de químicos pelo QR code**: foto dos produtos, ordens de pulverização criadas pelo gerente,
  separação conferida pelo QR code colado na frente de cada produto, entrada de compra e de sobra.
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

## 📥 Histórico das planilhas

[`supabase/importacao-historico.sql`](supabase/importacao-historico.sql) traz o histórico das planilhas
(vendas de milho, silagem e laranja de 2025 e 2026 com os recebimentos, despesas de janeiro/2026 e os
fretes do caminhão). Cole no **SQL Editor** e clique em **Run**. Pode rodar de novo sem duplicar.
Para desfazer: `delete from public.<tabela> where importado is not null;`.

Para gerar de novo a partir das planilhas atualizadas:

```bash
pip install openpyxl
python3 scripts/importar-planilhas.py <pasta com os .xlsx>
```

O script confere se o valor líquido de cada venda bate com a conta do sistema e lista as datas que
estavam digitadas erradas (e como ficaram).

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

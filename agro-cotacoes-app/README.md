# Agro Cotações

Aplicativo web simples para exibir cotações do agronegócio em uma única tela, partindo de fontes públicas como Scot Consultoria e CEPEA.

## O que esta versão já entrega

- Boi gordo por praça
- Vaca gorda por praça
- Milho por praça
- Soja por praça
- Indicadores CEPEA para boi, bezerro, milho e soja
- Mercado futuro do boi
- API própria em `/api/cotacoes`
- Cache local para reduzir falhas temporárias
- Interface pronta sem precisar de build frontend separado

## Estrutura

- `server.js`: backend Express + coleta das fontes + API
- `public/`: frontend estático
- `render.yaml`: deploy simplificado no Render
- `data/cache.json`: cache local, criado automaticamente

## Rodar localmente

```bash
npm install
npm start
```

Depois abra:

```bash
http://localhost:10000
```

## Deploy no Render

1. Crie um repositório com estes arquivos.
2. No Render, clique em **New > Web Service**.
3. Conecte o repositório.
4. O Render deve ler automaticamente o `render.yaml`.
5. Aguarde o deploy.
6. Acesse a URL pública do serviço.

## Próxima etapa sugerida

1. Normalizar a tabela completa de reposição da Scot
2. Adicionar filtros por UF e cidade
3. Criar histórico diário salvo em banco
4. Gerar alertas de preço
5. Criar versão mobile/PWA

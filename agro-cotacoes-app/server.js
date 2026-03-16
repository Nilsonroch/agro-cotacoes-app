import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 10000;

const CACHE_FILE = path.join(__dirname, 'data', 'cache.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const URLS = {
  scotIndicadores: 'https://www.scotconsultoria.com.br/cotacoes/indicadores/?ref=foo',
  scotBoi: 'https://www.scotconsultoria.com.br/cotacoes/boi-gordo/?ref=foo',
  scotVaca: 'https://www.scotconsultoria.com.br/cotacoes/vaca-gorda/?ref=foo',
  scotGraos: 'https://www.scotconsultoria.com.br/cotacoes/graos/?ref=foo',
  scotFuturo: 'https://www.scotconsultoria.com.br/cotacoes/mercado-futuro/?ref=foo',
  cepeaHome: 'https://www.cepea.org.br/br',
  cepeaBoi: 'https://www.cepea.org.br/br/indicador/boi-gordo.aspx',
  cepeaBezerro: 'https://www.cepea.org.br/br/indicador/bezerro.aspx'
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function brNumberToFloat(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoNow() {
  return new Date().toISOString();
}

async function safeFetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'no-cache'
    }
  });

  if (!res.ok) {
    throw new Error(`Falha ao acessar ${url}: ${res.status}`);
  }

  return await res.text();
}

function extractDateByRegex(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseScotIndicadores(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [
    /Indicador do boi gordo da Scot Consultoria \(R\$\/@\) - (\d{2}\/\d{2}\/\d{4})/i
  ]);

  const matches = [
    ...text.matchAll(
      /\b([A-Z]{2}\s(?:Barretos|Araçatuba|Triângulo|BH|Norte|Sul|Goiânia|Reg\. Sul|Dourados|C\. Grande|Três Lagoas|Oeste \(kg\)|Pelotas \(kg\)|Oeste|Sudoeste|Cuiabá\*|Sudeste|Noroeste|SC|Alagoas|Marabá|Redenção|Paragominas|Acre|ES|RJ))\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g
    )
  ];

  const items = matches.map((m) => ({
    praca: cleanText(m[1]),
    hoje: brNumberToFloat(m[2]),
    ontem: brNumberToFloat(m[3]),
    unidade: m[1].includes('(kg)') ? 'R$/kg' : 'R$/@',
    fonte: 'Scot Consultoria'
  }));

  return { date, items };
}

function parseScotCategoria(html, categoriaNome) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [
    new RegExp(`${categoriaNome}.*?(\\d{2}\\/\\d{2}\\/\\d{4})`, 'i')
  ]);

  const regex =
    /\b([A-Z]{2}\s(?:Barretos|Araçatuba|Triângulo|BH|Norte|Sul|Goiânia|Reg\. Sul|Dourados|C\. Grande|Três Lagoas|Oeste \(kg\)|Pelotas \(kg\)|Oeste|Sudoeste|Cuiabá\*|Sudeste|Noroeste|SC|Alagoas|Marabá|Redenção|Paragominas|Acre|ES|RJ|Roraima))\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g;

  const items = [...text.matchAll(regex)].map((m) => ({
    praca: cleanText(m[1]),
    a_vista: brNumberToFloat(m[2]),
    a_prazo: brNumberToFloat(m[3]),
    unidade: m[1].includes('(kg)') ? 'R$/kg' : 'R$/@',
    fonte: 'Scot Consultoria'
  }));

  return { date, items };
}

function parseScotGraos(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const milhoDate = extractDateByRegex(text, [/MILHO - (\d{2}\/\d{2}\/\d{4})/i]);
  const sojaDate = extractDateByRegex(text, [/SOJA - (\d{2}\/\d{2}\/\d{4})/i]);

  const milhoStart = text.indexOf('MILHO -');
  const sojaStart = text.indexOf('SOJA -');

  const milhoBlock =
    milhoStart >= 0 && sojaStart > milhoStart ? text.slice(milhoStart, sojaStart) : '';
  const sojaBlock = sojaStart >= 0 ? text.slice(sojaStart) : '';

  const grainRegex =
    /\b([A-Z]{2})\s+([A-Za-zÀ-ÿ.\- ]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+[A-Z]{2}\s+[A-Za-zÀ-ÿ]|\s*\*|$)/g;

  const milho = [...milhoBlock.matchAll(grainRegex)].map((m) => ({
    uf: m[1],
    cidade: cleanText(m[2]),
    compra: brNumberToFloat(m[3]),
    unidade: 'R$/sc 60kg',
    fonte: 'Scot Consultoria / AgRural'
  }));

  const soja = [...sojaBlock.matchAll(grainRegex)].map((m) => ({
    uf: m[1],
    cidade: cleanText(m[2]),
    compra: brNumberToFloat(m[3]),
    unidade: 'R$/sc 60kg',
    fonte: 'Scot Consultoria / AgRural'
  }));

  return {
    milhoDate,
    sojaDate,
    milho,
    soja
  };
}

function parseScotFuturo(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [
    /MERCADO FUTURO DO BOI GORDO - (\d{2}\/\d{2}\/\d{4})/i
  ]);

  const futures = [
    ...text.matchAll(
      /\b([A-Z][a-z]{2}\/\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d+)\s+([\-0-9,]+)\s+(\d{1,2},\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g
    )
  ].map((m) => ({
    vencimento: m[1],
    ajuste_anterior: brNumberToFloat(m[2]),
    ajuste_atual: brNumberToFloat(m[3]),
    contratos_abertos: Number(m[4]),
    variacao: brNumberToFloat(m[5]),
    cambio: brNumberToFloat(m[6]),
    us_a_vista: brNumberToFloat(m[7]),
    unidade: 'R$/@',
    fonte: 'Scot Consultoria / B3'
  }));

  return { date, futures };
}

function parseCepeaHome(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [/Preços CEPEA\s+(\d{2}\|\d{2}\|\d{4})/i]);

  function extract(label, unit) {
    const regex = new RegExp(`${label}\\s+R\\$\\s+([0-9\\.]+,\\d{2})\\s+\\|\\s+${unit}`, 'i');
    const match = text.match(regex);
    return match ? brNumberToFloat(match[1]) : null;
  }

  return {
    date: date ? date.replace(/\|/g, '/') : null,
    boi: extract('Boi', '@'),
    bezerro: extract('Bezerro', 'cab'),
    milho: extract('Milho', 'sc'),
    soja: extract('Soja', 'sc')
  };
}

function parseCepeaIndicador(html, label, unidade) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const match = text.match(
    /(\d{2}\/\d{2}\/\d{4})\s+([0-9.]+,\d{2})\s+[\-0-9,%]+\s+[\-0-9,%]+\s+[0-9.]+,\d{2}/
  );

  return {
    date: match?.[1] || null,
    valor: match?.[2] ? brNumberToFloat(match[2]) : null,
    label,
    unidade,
    fonte: 'CEPEA'
  };
}

function parseScotReposicao(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [/MACHO NELORE - (\d{2}\/\d{2}\/\d{4})/i]);

  return {
    date,
    disponivel: true,
    observacao:
      'A página de reposição da Scot está disponível, mas a primeira versão do app ainda não normaliza a tabela completa por categoria e UF.'
  };
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCache(data) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function buildDataset() {
  const [
    scotIndicadoresHtml,
    scotBoiHtml,
    scotVacaHtml,
    scotGraosHtml,
    scotFuturoHtml,
    cepeaHomeHtml,
    cepeaBoiHtml,
    cepeaBezerroHtml,
    scotReposicaoHtml
  ] = await Promise.all([
    safeFetchText(URLS.scotIndicadores),
    safeFetchText(URLS.scotBoi),
    safeFetchText(URLS.scotVaca),
    safeFetchText(URLS.scotGraos),
    safeFetchText(URLS.scotFuturo),
    safeFetchText(URLS.cepeaHome),
    safeFetchText(URLS.cepeaBoi),
    safeFetchText(URLS.cepeaBezerro),
    safeFetchText(URLS.scotGraos.replace('graos', 'reposicao'))
  ]);

  const scotIndicadores = parseScotIndicadores(scotIndicadoresHtml);
  const scotBoi = parseScotCategoria(scotBoiHtml, 'Boi');
  const scotVaca = parseScotCategoria(scotVacaHtml, 'Vaca');
  const scotGraos = parseScotGraos(scotGraosHtml);
  const scotFuturo = parseScotFuturo(scotFuturoHtml);
  const cepeaHome = parseCepeaHome(cepeaHomeHtml);
  const cepeaBoi = parseCepeaIndicador(cepeaBoiHtml, 'Boi CEPEA', 'R$/@');
  const cepeaBezerro = parseCepeaIndicador(cepeaBezerroHtml, 'Bezerro CEPEA', 'R$/cab');
  const reposicao = parseScotReposicao(scotReposicaoHtml);

  return {
    ok: true,
    generatedAt: isoNow(),
    cacheTtlHours: CACHE_TTL_MS / 3600000,
    fontes: ['Scot Consultoria', 'CEPEA', 'AgRural', 'B3'],
    resumo: {
      scotIndicadorBoiData: scotIndicadores.date,
      scotBoiData: scotBoi.date,
      scotVacaData: scotVaca.date,
      scotMilhoData: scotGraos.milhoDate,
      scotSojaData: scotGraos.sojaDate,
      scotFuturoData: scotFuturo.date,
      cepeaPainelData: cepeaHome.date,
      cepeaBoiData: cepeaBoi.date,
      cepeaBezerroData: cepeaBezerro.date
    },
    cepea: {
      painel: cepeaHome,
      boi: cepeaBoi,
      bezerro: cepeaBezerro
    },
    scot: {
      indicador_boi: scotIndicadores,
      boi_gordo: scotBoi,
      vaca_gorda: scotVaca,
      graos: scotGraos,
      mercado_futuro_boi: scotFuturo,
      reposicao
    }
  };
}

async function getDataset(forceRefresh = false) {
  const cache = await loadCache();
  const cacheAge = cache ? Date.now() - new Date(cache.generatedAt).getTime() : Infinity;

  if (!forceRefresh && cache && cacheAge < CACHE_TTL_MS) {
    return {
      ...cache,
      cache: { hit: true, ageMs: cacheAge }
    };
  }

  try {
    const fresh = await buildDataset();
    await saveCache(fresh);
    return {
      ...fresh,
      cache: { hit: false, ageMs: 0 }
    };
  } catch (error) {
    if (cache) {
      return {
        ...cache,
        ok: true,
        warning: `Falha na atualização em tempo real. Exibindo cache salvo. Motivo: ${error.message}`,
        cache: { hit: true, stale: true, ageMs: cacheAge }
      };
    }

    throw error;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'agro-cotacoes-app',
    now: isoNow()
  });
});

app.get('/api/cotacoes', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const data = await getDataset(forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

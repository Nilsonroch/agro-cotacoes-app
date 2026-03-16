import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

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
  scotReposicao: 'https://www.scotconsultoria.com.br/cotacoes/reposicao/?ref=foo',
  cepeaHome: 'https://www.cepea.org.br/br',
  cepeaBoi: 'https://www.cepea.org.br/br/indicador/boi-gordo.aspx',
  cepeaBezerro: 'https://www.cepea.org.br/br/indicador/bezerro.aspx'
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function brNumberToFloat(value) {
  if (value === null || value === undefined || value === '') return null;
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

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function extractDateByRegex(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]);
  }
  return null;
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function safeFetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'no-cache',
      pragma: 'no-cache'
    }
  });

  if (!res.ok) {
    throw new Error(`Falha ao acessar ${url}: ${res.status}`);
  }

  return await res.text();
}

async function safeFetchReposicaoWithPlaywright(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      locale: 'pt-BR'
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(5000);

    return await page.content();
  } finally {
    await browser.close();
  }
}

async function tryFetch(url, label) {
  try {
    const html =
      label === 'Scot reposição'
        ? await safeFetchReposicaoWithPlaywright(url)
        : await safeFetchText(url);

    return { ok: true, label, html, error: null };
  } catch (error) {
    return {
      ok: false,
      label,
      html: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseScotIndicadores(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [
    /Indicador do boi gordo da Scot Consultoria \(R\$\/@\) - (\d{2}\/\d{2}\/\d{4})/i
  ]);

  const regex =
    /\b([A-Z]{2}\s(?:Barretos|Araçatuba|Triângulo|BH|Norte|Sul|Goiânia|Reg\. Sul|Dourados|C\. Grande|Três Lagoas|Oeste \(kg\)|Pelotas \(kg\)|Oeste|Sudoeste|Cuiabá\*|Sudeste|Noroeste|SC|Alagoas|Marabá|Redenção|Paragominas|Acre|ES|RJ))\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g;

  const items = [...text.matchAll(regex)].map((m) => ({
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

function parseGrainBlock(blockText, defaultUnit = 'R$/sc 60kg') {
  const grainRegex =
    /\b([A-Z]{2})\s+([A-Za-zÀ-ÿ.\- ]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+[A-Z]{2}\s+[A-Za-zÀ-ÿ]|\s*\*|$)/g;

  return [...blockText.matchAll(grainRegex)].map((m) => ({
    uf: cleanText(m[1]),
    cidade: cleanText(m[2]),
    compra: brNumberToFloat(m[3]),
    unidade: defaultUnit,
    fonte: 'Scot Consultoria / AgRural'
  }));
}

function sortGrains(items) {
  return [...items].sort((a, b) => {
    const ufA = String(a.uf || '');
    const ufB = String(b.uf || '');
    if (ufA === ufB) {
      return String(a.cidade || '').localeCompare(String(b.cidade || ''), 'pt-BR');
    }
    return ufA.localeCompare(ufB, 'pt-BR');
  });
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

  const milho = parseGrainBlock(milhoBlock);
  const soja = parseGrainBlock(sojaBlock);

  return {
    milhoDate,
    sojaDate,
    milho: sortGrains(milho),
    soja: sortGrains(soja)
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

function buildReposicaoEmpty() {
  return {
    date: null,
    disponivel: false,
    observacao: 'Reposição GO ainda não confirmada pela fonte.',
    indicadores_pecuarios: {
      boi_magro: null,
      garrote: null,
      bezerro: null,
      desmama: null,
      vaca_boiadeira: null,
      novilha: null,
      bezerra: null,
      desmama_femea: null
    },
    goias: {
      macho_nelore: [],
      femea_nelore: []
    },
    macho_nelore: [],
    femea_nelore: []
  };
}

function parseReposicaoFromRenderedText(html, warnings = []) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDateByRegex(text, [
    /MACHO NELORE\s*-\s*(\d{2}\/\d{2}\/\d{4})/i,
    /FEMEA NELORE\s*-\s*(\d{2}\/\d{2}\/\d{4})/i,
    /FÊMEA NELORE\s*-\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})/
  ]);

  const empty = buildReposicaoEmpty();
  empty.date = date;

  const macho_nelore = [];
  const femea_nelore = [];

  const explicitRowRegex =
    /\b(GO)\b\s+([A-Za-zÀ-ÿ.\- ]+?)\s+(Boi Magro|Garrote|Bezerro|Desmama|Vaca Boiadeira|Novilha|Bezerra)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/gi;

  const matches = [...text.matchAll(explicitRowRegex)];

  for (const match of matches) {
    const uf = cleanText(match[1]);
    const local = cleanText(match[2]);
    const categoriaBruta = cleanText(match[3]);
    const valor = brNumberToFloat(match[4]);

    if (valor === null) continue;

    const categoriaNorm = normalizeString(categoriaBruta);
    const sexo =
      categoriaNorm === 'vaca boiadeira' ||
      categoriaNorm === 'novilha' ||
      categoriaNorm === 'bezerra'
        ? 'femea'
        : 'macho';

    const item = {
      categoria: categoriaBruta.toUpperCase(),
      uf,
      local,
      valor,
      unidade: 'R$/cab',
      sexo,
      fonte: 'Scot Consultoria'
    };

    if (sexo === 'macho') macho_nelore.push(item);
    else femea_nelore.push(item);
  }

  const hasExplicitReposicaoGo = macho_nelore.length > 0 || femea_nelore.length > 0;

  if (!hasExplicitReposicaoGo) {
    warnings.push('Reposição GO: preços ocultados até confirmação explícita da fonte.');
    return empty;
  }

  const indicadores_pecuarios = {
    boi_magro: macho_nelore.find((i) => i.categoria === 'BOI MAGRO')?.valor ?? null,
    garrote: macho_nelore.find((i) => i.categoria === 'GARROTE')?.valor ?? null,
    bezerro: macho_nelore.find((i) => i.categoria === 'BEZERRO')?.valor ?? null,
    desmama: macho_nelore.find((i) => i.categoria === 'DESMAMA')?.valor ?? null,
    vaca_boiadeira: femea_nelore.find((i) => i.categoria === 'VACA BOIADEIRA')?.valor ?? null,
    novilha: femea_nelore.find((i) => i.categoria === 'NOVILHA')?.valor ?? null,
    bezerra: femea_nelore.find((i) => i.categoria === 'BEZERRA')?.valor ?? null,
    desmama_femea: femea_nelore.find((i) => i.categoria === 'DESMAMA')?.valor ?? null
  };

  return {
    date,
    disponivel: true,
    observacao: null,
    indicadores_pecuarios,
    goias: {
      macho_nelore,
      femea_nelore
    },
    macho_nelore,
    femea_nelore
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

function safeParse(parser, html, fallback, warnings, label) {
  if (!html) return fallback;

  try {
    return parser(html);
  } catch (error) {
    warnings.push(`${label}: erro ao interpretar HTML (${error.message})`);
    return fallback;
  }
}

async function buildDataset() {
  const [
    scotIndicadoresRes,
    scotBoiRes,
    scotVacaRes,
    scotGraosRes,
    scotFuturoRes,
    cepeaHomeRes,
    cepeaBoiRes,
    cepeaBezerroRes,
    scotReposicaoRes
  ] = await Promise.all([
    tryFetch(URLS.scotIndicadores, 'Scot indicadores'),
    tryFetch(URLS.scotBoi, 'Scot boi'),
    tryFetch(URLS.scotVaca, 'Scot vaca'),
    tryFetch(URLS.scotGraos, 'Scot grãos'),
    tryFetch(URLS.scotFuturo, 'Scot futuro'),
    tryFetch(URLS.cepeaHome, 'CEPEA painel'),
    tryFetch(URLS.cepeaBoi, 'CEPEA boi'),
    tryFetch(URLS.cepeaBezerro, 'CEPEA bezerro'),
    tryFetch(URLS.scotReposicao, 'Scot reposição')
  ]);

  const warnings = [];

  const responses = [
    scotIndicadoresRes,
    scotBoiRes,
    scotVacaRes,
    scotGraosRes,
    scotFuturoRes,
    cepeaHomeRes,
    cepeaBoiRes,
    cepeaBezerroRes,
    scotReposicaoRes
  ];

  for (const item of responses) {
    if (!item.ok) {
      warnings.push(`${item.label}: ${item.error}`);
    }
  }

  const scotIndicadores = safeParse(
    parseScotIndicadores,
    scotIndicadoresRes.html,
    { date: null, items: [] },
    warnings,
    'Scot indicadores'
  );

  const scotBoi = safeParse(
    (html) => parseScotCategoria(html, 'Boi'),
    scotBoiRes.html,
    { date: null, items: [] },
    warnings,
    'Scot boi'
  );

  const scotVaca = safeParse(
    (html) => parseScotCategoria(html, 'Vaca'),
    scotVacaRes.html,
    { date: null, items: [] },
    warnings,
    'Scot vaca'
  );

  const scotGraos = safeParse(
    parseScotGraos,
    scotGraosRes.html,
    { milhoDate: null, sojaDate: null, milho: [], soja: [] },
    warnings,
    'Scot grãos'
  );

  const scotFuturo = safeParse(
    parseScotFuturo,
    scotFuturoRes.html,
    { date: null, futures: [] },
    warnings,
    'Scot futuro'
  );

  const cepeaHome = safeParse(
    parseCepeaHome,
    cepeaHomeRes.html,
    { date: null, boi: null, bezerro: null, milho: null, soja: null },
    warnings,
    'CEPEA painel'
  );

  const cepeaBoi = safeParse(
    (html) => parseCepeaIndicador(html, 'Boi CEPEA', 'R$/@'),
    cepeaBoiRes.html,
    { date: null, valor: null, label: 'Boi CEPEA', unidade: 'R$/@', fonte: 'CEPEA' },
    warnings,
    'CEPEA boi'
  );

  const cepeaBezerro = safeParse(
    (html) => parseCepeaIndicador(html, 'Bezerro CEPEA', 'R$/cab'),
    cepeaBezerroRes.html,
    {
      date: null,
      valor: null,
      label: 'Bezerro CEPEA',
      unidade: 'R$/cab',
      fonte: 'CEPEA'
    },
    warnings,
    'CEPEA bezerro'
  );

  const reposicao = scotReposicaoRes.html
    ? parseReposicaoFromRenderedText(scotReposicaoRes.html, warnings)
    : buildReposicaoEmpty();

  return {
    ok: true,
    generatedAt: isoNow(),
    cacheTtlHours: CACHE_TTL_MS / 3600000,
    fontes: ['Scot Consultoria', 'CEPEA', 'AgRural', 'B3'],
    warning: warnings.length ? warnings.join(' | ') : null,
    resumo: {
      scotIndicadorBoiData: scotIndicadores.date,
      scotBoiData: scotBoi.date,
      scotVacaData: scotVaca.date,
      scotMilhoData: scotGraos.milhoDate,
      scotSojaData: scotGraos.sojaDate,
      scotFuturoData: scotFuturo.date,
      scotReposicaoData: reposicao.date,
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
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

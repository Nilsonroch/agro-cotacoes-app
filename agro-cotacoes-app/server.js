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
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const URLS = {
  boi: 'https://www.scotconsultoria.com.br/cotacoes/boi-gordo/',
  vaca: 'https://www.scotconsultoria.com.br/cotacoes/vaca-gorda/?ref=smn',
  novilha: 'https://www.scotconsultoria.com.br/cotacoes/novilha/?ref=smn',
  reposicao: 'https://www.scotconsultoria.com.br/cotacoes/reposicao/?ref=smn',
  graos: 'https://www.scotconsultoria.com.br/cotacoes/graos/?ref=smn'
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isoNow() {
  return new Date().toISOString();
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function brNumberToFloat(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractDate(text) {
  const match = String(text).match(/(\d{2}\/\d{2}\/\d{4})/);
  return match?.[1] || null;
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

async function tryFetch(url, label) {
  try {
    const html = await safeFetchText(url);
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

function parseScotAnimalPage(html, categoria) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDate(text);

  const regex =
    /\b((?:SP|GO)\s(?:Barretos|Araçatuba|Goiânia|Reg\. Sul))\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g;

  const items = [...text.matchAll(regex)].map((m) => ({
    praca: cleanText(m[1]),
    a_vista: brNumberToFloat(m[2]),
    a_prazo: brNumberToFloat(m[3]),
    unidade: 'R$/@',
    fonte: 'Scot Consultoria',
    categoria
  }));

  return { date, items };
}

function parseScotGraos(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');

  const milhoDate = extractDate(text);
  const sojaDate = extractDate(text);

  const milhoStart = text.indexOf('MILHO -');
  const sojaStart = text.indexOf('SOJA -');

  const milhoBlock =
    milhoStart >= 0 && sojaStart > milhoStart ? text.slice(milhoStart, sojaStart) : '';
  const sojaBlock = sojaStart >= 0 ? text.slice(sojaStart) : '';

  const grainRegex =
    /\b([A-Z]{2})\s+([A-Za-zÀ-ÿ.\- ]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+[A-Z]{2}\s+[A-Za-zÀ-ÿ]|\s*\*|$)/g;

  const milho = [...milhoBlock.matchAll(grainRegex)]
    .map((m) => ({
      uf: cleanText(m[1]),
      cidade: cleanText(m[2]),
      compra: brNumberToFloat(m[3]),
      unidade: 'R$/sc 60kg',
      fonte: 'Scot Consultoria / AgRural'
    }))
    .filter((item) => ['GO', 'SP'].includes(item.uf));

  const soja = [...sojaBlock.matchAll(grainRegex)]
    .map((m) => ({
      uf: cleanText(m[1]),
      cidade: cleanText(m[2]),
      compra: brNumberToFloat(m[3]),
      unidade: 'R$/sc 60kg',
      fonte: 'Scot Consultoria / AgRural'
    }))
    .filter((item) => ['GO', 'SP'].includes(item.uf));

  return {
    milhoDate,
    sojaDate,
    milho,
    soja
  };
}

function buildReposicaoEmpty(date = null) {
  return {
    date,
    disponivel: false,
    observacao: 'Reposição GO/SP exibida apenas quando a fonte confirmar com segurança.',
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
    sao_paulo: {
      macho_nelore: [],
      femea_nelore: []
    },
    macho_nelore: [],
    femea_nelore: []
  };
}

function parseReposicao(html, warnings) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDate(text);
  const result = buildReposicaoEmpty(date);

  const patterns = [
    { categoria: 'BOI MAGRO', sexo: 'macho', indicador: 'boi_magro' },
    { categoria: 'GARROTE', sexo: 'macho', indicador: 'garrote' },
    { categoria: 'BEZERRO', sexo: 'macho', indicador: 'bezerro' },
    { categoria: 'DESMAMA', sexo: 'macho', indicador: 'desmama' },
    { categoria: 'VACA BOIADEIRA', sexo: 'femea', indicador: 'vaca_boiadeira' },
    { categoria: 'NOVILHA', sexo: 'femea', indicador: 'novilha' },
    { categoria: 'BEZERRA', sexo: 'femea', indicador: 'bezerra' },
    { categoria: 'DESMAMA', sexo: 'femea', indicador: 'desmama_femea' }
  ];

  function tryExtractForUF(uf, categoria, sectionHint = '') {
    const attempts = [
      `${sectionHint}[\\s\\S]{0,500}?${categoria}[\\s\\S]{0,200}?\\b${uf}\\b[\\s\\S]{0,80}?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})`,
      `${sectionHint}[\\s\\S]{0,500}?\\b${uf}\\b[\\s\\S]{0,120}?${categoria}[\\s\\S]{0,80}?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})`
    ];

    for (const attempt of attempts) {
      const regex = new RegExp(attempt, 'i');
      const match = text.match(regex);
      if (match?.[1]) return brNumberToFloat(match[1]);
    }

    return null;
  }

  for (const p of patterns) {
    const sectionHint =
      p.sexo === 'macho'
        ? 'MACHO NELORE'
        : '(?:FEMEA NELORE|FÊMEA NELORE)';

    const goValue = tryExtractForUF('GO', p.categoria, sectionHint);
    const spValue = tryExtractForUF('SP', p.categoria, sectionHint);

    if (goValue !== null) {
      const item = {
        categoria: p.categoria,
        uf: 'GO',
        local: 'Goiás',
        valor: goValue,
        unidade: 'R$/cab',
        sexo: p.sexo,
        fonte: 'Scot Consultoria'
      };

      if (p.sexo === 'macho') result.goias.macho_nelore.push(item);
      else result.goias.femea_nelore.push(item);

      result.indicadores_pecuarios[p.indicador] = goValue;
    }

    if (spValue !== null) {
      const item = {
        categoria: p.categoria,
        uf: 'SP',
        local: 'São Paulo',
        valor: spValue,
        unidade: 'R$/cab',
        sexo: p.sexo,
        fonte: 'Scot Consultoria'
      };

      if (p.sexo === 'macho') result.sao_paulo.macho_nelore.push(item);
      else result.sao_paulo.femea_nelore.push(item);
    }
  }

  result.macho_nelore = [
    ...result.goias.macho_nelore,
    ...result.sao_paulo.macho_nelore
  ];

  result.femea_nelore = [
    ...result.goias.femea_nelore,
    ...result.sao_paulo.femea_nelore
  ];

  const hasConfirmed =
    result.goias.macho_nelore.length > 0 ||
    result.goias.femea_nelore.length > 0 ||
    result.sao_paulo.macho_nelore.length > 0 ||
    result.sao_paulo.femea_nelore.length > 0;

  if (!hasConfirmed) {
    warnings.push('Reposição GO/SP: preços ocultados até confirmação explícita da fonte.');
    return buildReposicaoEmpty(date);
  }

  result.disponivel = true;
  result.observacao = null;
  return result;
}

function parseScotFuturo(html) {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ');
  const date = extractDate(text);

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
    boiRes,
    vacaRes,
    novilhaRes,
    graosRes,
    reposicaoRes
  ] = await Promise.all([
    tryFetch(URLS.boi, 'Scot boi'),
    tryFetch(URLS.vaca, 'Scot vaca'),
    tryFetch(URLS.novilha, 'Scot novilha'),
    tryFetch(URLS.graos, 'Scot graos'),
    tryFetch(URLS.reposicao, 'Scot reposicao')
  ]);

  const warnings = [];

  for (const item of [boiRes, vacaRes, novilhaRes, graosRes, reposicaoRes]) {
    if (!item.ok) warnings.push(`${item.label}: ${item.error}`);
  }

  const boi = boiRes.ok
    ? parseScotAnimalPage(boiRes.html, 'Boi Gordo')
    : { date: null, items: [] };

  const vaca = vacaRes.ok
    ? parseScotAnimalPage(vacaRes.html, 'Vaca Gorda')
    : { date: null, items: [] };

  const novilha = novilhaRes.ok
    ? parseScotAnimalPage(novilhaRes.html, 'Novilha')
    : { date: null, items: [] };

  const graos = graosRes.ok
    ? parseScotGraos(graosRes.html)
    : { milhoDate: null, sojaDate: null, milho: [], soja: [] };

  const reposicao = reposicaoRes.ok
    ? parseReposicao(reposicaoRes.html, warnings)
    : buildReposicaoEmpty();

  const futuro = { date: null, futures: [] };

  const cepea = {
    painel: { date: null, boi: null, bezerro: null, milho: null, soja: null },
    boi: { date: null, valor: null, label: 'Boi CEPEA', unidade: 'R$/@', fonte: 'CEPEA' },
    bezerro: { date: null, valor: null, label: 'Bezerro CEPEA', unidade: 'R$/cab', fonte: 'CEPEA' }
  };

  warnings.push('App operando somente com Scot Consultoria.');

  return {
    ok: true,
    generatedAt: isoNow(),
    cacheTtlHours: CACHE_TTL_MS / 3600000,
    fontes: ['Scot Consultoria'],
    warning: warnings.length ? warnings.join(' | ') : null,
    resumo: {
      scotBoiData: boi.date,
      scotVacaData: vaca.date,
      scotNovilhaData: novilha.date,
      scotMilhoData: graos.milhoDate,
      scotSojaData: graos.sojaDate,
      scotReposicaoData: reposicao.date,
      scotFuturoData: futuro.date,
      cepeaPainelData: null,
      cepeaBoiData: null,
      cepeaBezerroData: null
    },
    cepea,
    scot: {
      boi_gordo: boi,
      vaca_gorda: vaca,
      novilha_gorda: novilha,
      graos,
      reposicao,
      mercado_futuro_boi: futuro
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

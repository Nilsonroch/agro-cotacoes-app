async function buildDataset() {
  const results = await Promise.allSettled([
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
  ] = results;

  const warnings = [];

  function getValue(result, label) {
    if (result.status === 'fulfilled') return result.value;
    warnings.push(`${label}: ${result.reason?.message || 'falha desconhecida'}`);
    return null;
  }

  const scotIndicadoresHtml = getValue(scotIndicadoresRes, 'Scot indicadores');
  const scotBoiHtml = getValue(scotBoiRes, 'Scot boi');
  const scotVacaHtml = getValue(scotVacaRes, 'Scot vaca');
  const scotGraosHtml = getValue(scotGraosRes, 'Scot grãos');
  const scotFuturoHtml = getValue(scotFuturoRes, 'Scot futuro');
  const cepeaHomeHtml = getValue(cepeaHomeRes, 'CEPEA painel');
  const cepeaBoiHtml = getValue(cepeaBoiRes, 'CEPEA boi');
  const cepeaBezerroHtml = getValue(cepeaBezerroRes, 'CEPEA bezerro');
  const scotReposicaoHtml = getValue(scotReposicaoRes, 'Scot reposição');

  const scotIndicadores = scotIndicadoresHtml
    ? parseScotIndicadores(scotIndicadoresHtml)
    : { date: null, items: [] };

  const scotBoi = scotBoiHtml
    ? parseScotCategoria(scotBoiHtml, 'Boi')
    : { date: null, items: [] };

  const scotVaca = scotVacaHtml
    ? parseScotCategoria(scotVacaHtml, 'Vaca')
    : { date: null, items: [] };

  const scotGraos = scotGraosHtml
    ? parseScotGraos(scotGraosHtml)
    : { milhoDate: null, sojaDate: null, milho: [], soja: [] };

  const scotFuturo = scotFuturoHtml
    ? parseScotFuturo(scotFuturoHtml)
    : { date: null, futures: [] };

  const cepeaHome = cepeaHomeHtml
    ? parseCepeaHome(cepeaHomeHtml)
    : { date: null, boi: null, bezerro: null, milho: null, soja: null };

  const cepeaBoi = cepeaBoiHtml
    ? parseCepeaIndicador(cepeaBoiHtml, 'Boi CEPEA', 'R$/@')
    : { date: null, valor: null, label: 'Boi CEPEA', unidade: 'R$/@', fonte: 'CEPEA' };

  const cepeaBezerro = cepeaBezerroHtml
    ? parseCepeaIndicador(cepeaBezerroHtml, 'Bezerro CEPEA', 'R$/cab')
    : { date: null, valor: null, label: 'Bezerro CEPEA', unidade: 'R$/cab', fonte: 'CEPEA' };

  const reposicao = scotReposicaoHtml
    ? parseScotReposicao(scotReposicaoHtml)
    : {
        date: null,
        disponivel: false,
        observacao: 'Falha ao acessar a página de reposição da Scot.'
      };

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

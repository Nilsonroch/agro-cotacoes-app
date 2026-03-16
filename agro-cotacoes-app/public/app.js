const generatedAtEl = document.getElementById('generatedAt');
const cacheStatusEl = document.getElementById('cacheStatus');
const refreshBtn = document.getElementById('refreshBtn');
const warningBox = document.getElementById('warningBox');

const boiDateEl = document.getElementById('boiDate');
const vacaDateEl = document.getElementById('vacaDate');
const milhoDateEl = document.getElementById('milhoDate');
const sojaDateEl = document.getElementById('sojaDate');
const cepeaDateEl = document.getElementById('cepeaDate');
const futuroDateEl = document.getElementById('futuroDate');
const goiasDateEl = document.getElementById('goiasDate');

const boiSummaryEl = document.getElementById('boiSummary');
const vacaSummaryEl = document.getElementById('vacaSummary');

const boiTableEl = document.getElementById('boiTable');
const vacaTableEl = document.getElementById('vacaTable');
const milhoTableEl = document.getElementById('milhoTable');
const sojaTableEl = document.getElementById('sojaTable');
const cepeaGridEl = document.getElementById('cepeaGrid');
const futuroTableEl = document.getElementById('futuroTable');

const goiasBoiEl = document.getElementById('goiasBoi');
const goiasBoiPrazoEl = document.getElementById('goiasBoiPrazo');
const goiasVacaEl = document.getElementById('goiasVaca');
const goiasVacaPrazoEl = document.getElementById('goiasVacaPrazo');
const goiasMilhoEl = document.getElementById('goiasMilho');
const goiasMilhoCidadeEl = document.getElementById('goiasMilhoCidade');
const goiasSojaEl = document.getElementById('goiasSoja');
const goiasSojaCidadeEl = document.getElementById('goiasSojaCidade');

function formatNumber(value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}${suffix}`;
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function renderWarning(message) {
  if (!message) {
    warningBox.classList.add('hidden');
    warningBox.textContent = '';
    return;
  }

  warningBox.classList.remove('hidden');
  warningBox.textContent = message;
}

function fillSummary(container, items, unitSuffix) {
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<div class="empty">Sem dados disponíveis.</div>';
    return;
  }

  const media =
    items.reduce((sum, item) => sum + (Number(item.a_vista) || 0), 0) / items.length;

  const maior = items.reduce((acc, item) => {
    if (!acc) return item;
    return Number(item.a_vista) > Number(acc.a_vista) ? item : acc;
  }, null);

  container.innerHTML = `
    <div class="summary-box">
      <span>Média à vista</span>
      <strong>${formatNumber(media, ` ${unitSuffix}`)}</strong>
    </div>
    <div class="summary-box">
      <span>Maior praça</span>
      <strong>${maior?.praca || '--'}</strong>
    </div>
    <div class="summary-box">
      <span>Valor maior praça</span>
      <strong>${formatNumber(maior?.a_vista, ` ${unitSuffix}`)}</strong>
    </div>
    <div class="summary-box">
      <span>Qtd. praças</span>
      <strong>${items.length}</strong>
    </div>
  `;
}

function renderCategoriaTable(container, items) {
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<tr><td colspan="4">Sem dados disponíveis.</td></tr>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.praca || '--'}</td>
          <td>${formatNumber(item.a_vista)}</td>
          <td>${formatNumber(item.a_prazo)}</td>
          <td>${item.unidade || '--'}</td>
        </tr>
      `
    )
    .join('');
}

function renderGraosTable(container, items) {
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<tr><td colspan="3">Sem dados disponíveis.</td></tr>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.uf || '--'}</td>
          <td>${item.cidade || '--'}</td>
          <td>${formatNumber(item.compra)}</td>
        </tr>
      `
    )
    .join('');
}

function renderCepea(data) {
  const cards = [
    { titulo: 'Painel Boi', valor: data?.painel?.boi, unidade: 'R$/@' },
    { titulo: 'Painel Bezerro', valor: data?.painel?.bezerro, unidade: 'R$/cab' },
    { titulo: 'Painel Milho', valor: data?.painel?.milho, unidade: 'R$/sc' },
    { titulo: 'Painel Soja', valor: data?.painel?.soja, unidade: 'R$/sc' },
    { titulo: 'Boi CEPEA', valor: data?.boi?.valor, unidade: data?.boi?.unidade || '' },
    { titulo: 'Bezerro CEPEA', valor: data?.bezerro?.valor, unidade: data?.bezerro?.unidade || '' }
  ];

  cepeaGridEl.innerHTML = cards
    .map(
      (item) => `
        <div class="cepea-card">
          <span>${item.titulo}</span>
          <strong>${formatNumber(item.valor)}</strong>
          <small>${item.unidade}</small>
        </div>
      `
    )
    .join('');
}

function renderFuturo(container, items) {
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<tr><td colspan="4">Sem dados disponíveis.</td></tr>';
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.vencimento || '--'}</td>
          <td>${formatNumber(item.ajuste_atual)}</td>
          <td>${formatNumber(item.variacao)}</td>
          <td>${formatNumber(item.us_a_vista)}</td>
        </tr>
      `
    )
    .join('');
}

function findGoiasAnimal(items) {
  if (!Array.isArray(items)) return null;
  return (
    items.find((item) => String(item.praca || '').toLowerCase().includes('go goiânia')) ||
    items.find((item) => String(item.praca || '').toLowerCase().includes('go goiania')) ||
    items.find((item) => String(item.praca || '').toLowerCase().includes('go')) ||
    null
  );
}

function findGoiasGrain(items) {
  if (!Array.isArray(items)) return null;
  return items.find((item) => String(item.uf || '').toUpperCase() === 'GO') || null;
}

function renderGoias(data) {
  const goiasBoi = findGoiasAnimal(data?.scot?.boi_gordo?.items);
  const goiasVaca = findGoiasAnimal(data?.scot?.vaca_gorda?.items);
  const goiasMilho = findGoiasGrain(data?.scot?.graos?.milho);
  const goiasSoja = findGoiasGrain(data?.scot?.graos?.soja);

  goiasDateEl.textContent =
    data?.resumo?.scotBoiData ||
    data?.resumo?.scotVacaData ||
    data?.resumo?.scotMilhoData ||
    '--';

  goiasBoiEl.textContent = goiasBoi ? `${formatNumber(goiasBoi.a_vista)} ${goiasBoi.unidade}` : '--';
  goiasBoiPrazoEl.textContent = goiasBoi
    ? `Prazo: ${formatNumber(goiasBoi.a_prazo)} ${goiasBoi.unidade}`
    : 'Prazo: --';

  goiasVacaEl.textContent = goiasVaca ? `${formatNumber(goiasVaca.a_vista)} ${goiasVaca.unidade}` : '--';
  goiasVacaPrazoEl.textContent = goiasVaca
    ? `Prazo: ${formatNumber(goiasVaca.a_prazo)} ${goiasVaca.unidade}`
    : 'Prazo: --';

  goiasMilhoEl.textContent = goiasMilho ? `${formatNumber(goiasMilho.compra)} R$/sc` : '--';
  goiasMilhoCidadeEl.textContent = goiasMilho
    ? `Cidade: ${goiasMilho.cidade || '--'}`
    : 'Cidade: --';

  goiasSojaEl.textContent = goiasSoja ? `${formatNumber(goiasSoja.compra)} R$/sc` : '--';
  goiasSojaCidadeEl.textContent = goiasSoja
    ? `Cidade: ${goiasSoja.cidade || '--'}`
    : 'Cidade: --';
}

function renderAll(data) {
  generatedAtEl.textContent = formatDateTime(data.generatedAt);

  if (data?.cache?.hit && data?.cache?.stale) {
    cacheStatusEl.textContent = 'Cache antigo';
  } else if (data?.cache?.hit) {
    cacheStatusEl.textContent = 'Cache';
  } else {
    cacheStatusEl.textContent = 'Carga nova';
  }

  renderWarning(data.warning);

  boiDateEl.textContent = data?.scot?.boi_gordo?.date || '--';
  vacaDateEl.textContent = data?.scot?.vaca_gorda?.date || '--';
  milhoDateEl.textContent = data?.scot?.graos?.milhoDate || '--';
  sojaDateEl.textContent = data?.scot?.graos?.sojaDate || '--';
  cepeaDateEl.textContent = data?.cepea?.painel?.date || '--';
  futuroDateEl.textContent = data?.scot?.mercado_futuro_boi?.date || '--';

  fillSummary(boiSummaryEl, data?.scot?.boi_gordo?.items || [], 'R$/@');
  fillSummary(vacaSummaryEl, data?.scot?.vaca_gorda?.items || [], 'R$/@');

  renderCategoriaTable(boiTableEl, data?.scot?.boi_gordo?.items || []);
  renderCategoriaTable(vacaTableEl, data?.scot?.vaca_gorda?.items || []);
  renderGraosTable(milhoTableEl, data?.scot?.graos?.milho || []);
  renderGraosTable(sojaTableEl, data?.scot?.graos?.soja || []);
  renderCepea(data?.cepea || {});
  renderFuturo(futuroTableEl, data?.scot?.mercado_futuro_boi?.futures || []);
  renderGoias(data);
}

async function loadData(forceRefresh = false) {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Atualizando...';

    const url = forceRefresh ? '/api/cotacoes?refresh=1' : '/api/cotacoes';
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Falha ao carregar cotações.');
    }

    renderAll(data);
  } catch (error) {
    renderWarning(error.message || 'Erro ao carregar os dados.');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Atualizar agora';
  }
}

refreshBtn.addEventListener('click', () => loadData(true));

loadData(false);

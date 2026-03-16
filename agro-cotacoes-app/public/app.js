function formatDateTime(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('pt-BR');
}

function formatMoney(value, suffix = '') {
  if (value == null || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value) + (suffix ? ` ${suffix}` : '');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function createKpi(label, value) {
  const div = document.createElement('div');
  div.className = 'kpi';
  div.innerHTML = `<span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong>`;
  return div;
}

function renderKpis(targetId, items) {
  const root = document.getElementById(targetId);
  root.innerHTML = '';
  items.forEach((item) => root.appendChild(createKpi(item.label, item.value)));
}

function renderRows(targetId, rows, mapper) {
  const tbody = document.getElementById(targetId);
  tbody.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = mapper(row);
    tbody.appendChild(tr);
  });
}

function average(list, key) {
  if (!list.length) return null;
  const nums = list.map((x) => x[key]).filter((v) => typeof v === 'number');
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maxBy(list, key) {
  return list.reduce((acc, item) => (acc == null || item[key] > acc[key] ? item : acc), null);
}

async function loadData(refresh = false) {
  const url = refresh ? '/api/cotacoes?refresh=1' : '/api/cotacoes';
  const res = await fetch(url);
  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.error || 'Falha ao carregar dados');
  }

  setText('generatedAt', formatDateTime(data.generatedAt));
  setText('cacheInfo', data.cache?.hit ? 'Usando cache' : 'Carga nova');

  const boi = data.scot.boi_gordo.items || [];
  const vaca = data.scot.vaca_gorda.items || [];
  const milho = data.scot.graos.milho || [];
  const soja = data.scot.graos.soja || [];
  const futuro = data.scot.mercado_futuro_boi.futures || [];

  setText('scotBoiDate', data.scot.boi_gordo.date || '--');
  setText('scotVacaDate', data.scot.vaca_gorda.date || '--');
  setText('milhoDate', data.scot.graos.milhoDate || '--');
  setText('sojaDate', data.scot.graos.sojaDate || '--');
  setText('cepeaDate', data.cepea.painel.date || '--');
  setText('futuroDate', data.scot.mercado_futuro_boi.date || '--');

  renderKpis('boiKpis', [
    { label: 'Média à vista', value: formatMoney(average(boi, 'a_vista'), 'R$/@') },
    { label: 'Maior praça', value: `${maxBy(boi, 'a_vista')?.praca || '--'}` },
    { label: 'Valor maior praça', value: formatMoney(maxBy(boi, 'a_vista')?.a_vista, 'R$/@') },
    { label: 'Qtd. praças', value: `${boi.length}` }
  ]);

  renderKpis('vacaKpis', [
    { label: 'Média à vista', value: formatMoney(average(vaca, 'a_vista'), 'R$/@') },
    { label: 'Maior praça', value: `${maxBy(vaca, 'a_vista')?.praca || '--'}` },
    { label: 'Valor maior praça', value: formatMoney(maxBy(vaca, 'a_vista')?.a_vista, 'R$/@') },
    { label: 'Qtd. praças', value: `${vaca.length}` }
  ]);

  renderKpis('milhoKpis', [
    { label: 'Média compra', value: formatMoney(average(milho, 'compra'), 'R$/sc') },
    { label: 'Itumbiara/GO', value: formatMoney((milho.find((x) => x.uf === 'GO' && x.cidade.includes('Itumbiara')) || {}).compra, 'R$/sc') },
    { label: 'Rio Verde/GO', value: formatMoney((milho.find((x) => x.uf === 'GO' && x.cidade.includes('Rio Verde')) || {}).compra, 'R$/sc') },
    { label: 'Qtd. praças', value: `${milho.length}` }
  ]);

  renderKpis('sojaKpis', [
    { label: 'Média compra', value: formatMoney(average(soja, 'compra'), 'R$/sc') },
    { label: 'Jataí/GO', value: formatMoney((soja.find((x) => x.uf === 'GO' && x.cidade.includes('Jataí')) || {}).compra, 'R$/sc') },
    { label: 'Rio Verde/GO', value: formatMoney((soja.find((x) => x.uf === 'GO' && x.cidade.includes('Rio Verde')) || {}).compra, 'R$/sc') },
    { label: 'Qtd. praças', value: `${soja.length}` }
  ]);

  renderKpis('cepeaGrid', [
    { label: 'Boi CEPEA', value: formatMoney(data.cepea.boi.valor, 'R$/@') },
    { label: 'Bezerro CEPEA', value: formatMoney(data.cepea.bezerro.valor, 'R$/cab') },
    { label: 'Milho CEPEA', value: formatMoney(data.cepea.painel.milho, 'R$/sc') },
    { label: 'Soja CEPEA', value: formatMoney(data.cepea.painel.soja, 'R$/sc') }
  ]);

  renderRows('boiTable', boi, (row) => `
    <td>${row.praca}</td>
    <td>${formatMoney(row.a_vista)}</td>
    <td>${formatMoney(row.a_prazo)}</td>
    <td>${row.unidade}</td>
  `);

  renderRows('vacaTable', vaca, (row) => `
    <td>${row.praca}</td>
    <td>${formatMoney(row.a_vista)}</td>
    <td>${formatMoney(row.a_prazo)}</td>
    <td>${row.unidade}</td>
  `);

  renderRows('milhoTable', milho, (row) => `
    <td>${row.uf}</td>
    <td>${row.cidade}</td>
    <td>${formatMoney(row.compra)}</td>
  `);

  renderRows('sojaTable', soja, (row) => `
    <td>${row.uf}</td>
    <td>${row.cidade}</td>
    <td>${formatMoney(row.compra)}</td>
  `);

  renderRows('futuroTable', futuro, (row) => `
    <td>${row.vencimento}</td>
    <td>${formatMoney(row.ajuste_atual)}</td>
    <td>${formatMoney(row.variacao)}</td>
    <td>${formatMoney(row.us_a_vista)}</td>
  `);
}

async function init() {
  try {
    await loadData(false);
  } catch (error) {
    alert(error.message);
  }

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Atualizando...';
    try {
      await loadData(true);
    } catch (error) {
      alert(error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

init();

// Estoque: quanto cada pedido gasta (sem DOM, sem Firebase). Chave = o que o site já conhece:
// 'pao', uma camada de burger (carne, cheddar, bacon...) ou o id de um item vendido inteiro (bebida, sobremesa).
// O produto do estoque aponta pra uma chave em `liga`; produto sem liga só muda por entrada e contagem.

// burger: 1 pão (cima + baixo) + receita − o que o cliente tirou + adicionais. Item com `estoque` no cardápio usa
// esse mapa (pacote de pães = 6 pães); o resto gasta 1 dele mesmo. Item que saiu do cardápio não gasta nada.
export function consumo(itens, cardapio) {
  const c = {};
  const soma = (k, n) => { c[k] = (c[k] || 0) + n; };
  for (const i of itens) {
    const m = cardapio.find(x => x.id === i.id);
    if (!m) continue;
    if (m.camadas) {
      const tirar = (i.sem || []).map(r => m.tiraCamada?.[r]).filter(Boolean);
      for (const k of ['pao', ...m.camadas.filter(x => !tirar.includes(x)), ...(i.extras || [])]) soma(k, i.qtd);
    } else if (m.estoque) for (const [k, n] of Object.entries(m.estoque)) soma(k, n * i.qtd);
    else soma(m.id, i.qtd);
  }
  return c;
}

// consumo → quanto sai de cada produto cadastrado (id do produto → n). Chave sem produto é ignorada
export function baixaDe(c, produtos = {}) {
  const b = {};
  for (const [id, p] of Object.entries(produtos)) if (p.liga && c[p.liga]) b[id] = c[p.liga];
  return b;
}

// quanto mexer em cada produto pra ir de `antes` (baixa gravada no pedido) pra `depois`; só o que muda
export function delta(depois = {}, antes = {}) {
  const d = {};
  for (const id of new Set([...Object.keys(depois), ...Object.keys(antes)])) {
    const n = (depois[id] || 0) - (antes[id] || 0);
    if (n) d[id] = n;
  }
  return d;
}

export const negar = m => Object.fromEntries(Object.entries(m).map(([id, n]) => [id, -n]));

// mapa com sinal → campos do update (`qtd.<id>`: inc(n)). Com a lista de produtos, só os que ainda existem
// (produto apagado não volta como fantasma); sem a lista (painel offline), todos
export const camposQtd = (m, produtos, inc) => Object.fromEntries(Object.entries(m)
  .filter(([id, n]) => n && (!produtos || produtos[id])).map(([id, n]) => [`qtd.${id}`, inc(n)]));

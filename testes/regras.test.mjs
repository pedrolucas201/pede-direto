import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, collection, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, where, orderBy, runTransaction, increment, Timestamp } from 'firebase/firestore';

const P = 'lojas/lacarne';
let env;
const pedido = (extra = {}) => ({
  cod: 'AB12C', criadoEm: serverTimestamp(), status: 'novo', entrega: true, pag: 'Pix', troco: 0, obs: '',
  cliente: { nome: 'Ana', fone: '(81) 9 9999-9999', rua: 'Rua A', numero: '1', bairro: 'Matriz', compl: '', ref: '' },
  itens: [{ id: 'bruto', nome: 'Bruto', unit: 32, qtd: 1, escolhas: { 'Ponto da carne': 'Ao ponto' }, sem: [], obs: '' }],
  subtotal: 32, taxa: 5, ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-lacarne',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, P), { nome: 'La Carne' });
    await setDoc(doc(db, P, 'admins', 'dono@x.com'), {});
    await setDoc(doc(db, P, 'funcionarios', 'func@x.com'), {});
    await setDoc(doc(db, P, 'pedidos', 'p1'), { ...pedido(), criadoEm: new Date() });
    await setDoc(doc(db, P, 'convites', 'p1'), { nome: 'Ana', ids: ['bruto', 'manso'],
      burgers: [{ id: 'bruto', nome: 'Bruto' }, { id: 'manso', nome: 'Manso' }], entregueEm: new Date() });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const logado = (email, verificado = true) => env.authenticatedContext(email, { email, email_verified: verificado }).firestore();
const pedidos = db => collection(db, P, 'pedidos');
// a loja só muda com a linha do registro no mesmo lote, sobre o mesmo alvo (registro.js)
const linha = (alvo, extra = {}) => ({ em: serverTimestamp(), quem: 'dono@x.com', acao: 'teste', alvo, dados: {}, aparelho: 'teste', ...extra });
const comReg = (db, alvo, caminho, dados, { criar = false, reg, quem } = {}) => {
  const b = writeBatch(db), r = doc(collection(db, P, 'registro')), ref = doc(db, caminho);
  b.set(r, linha(alvo, quem ? { quem } : {}));
  criar ? b.set(ref, { ...dados, reg: reg ?? r.id }) : b.update(ref, { ...dados, reg: reg ?? r.id });
  return b.commit();
};
const adm = () => logado('dono@x.com');
const P1 = `${P}/pedidos/p1`;

test('qualquer um lê a loja', () => assertSucceeds(getDoc(doc(anon(), P))));
test('estranho não altera a loja', () => assertFails(setDoc(doc(anon(), P), { fechadaHoje: '2026-10-01' }, { merge: true })));
test('admin altera a loja com registro; sem registro não', async () => {
  await assertSucceeds(comReg(adm(), 'loja', P, { 'esgotados.bruto': '2026-10-01' }));
  await assertFails(updateDoc(doc(adm(), P), { 'esgotados.bruto': '2026-10-02' }));
});
test('cliente cria pedido válido', () => assertSucceeds(addDoc(pedidos(anon()), pedido())));
test('retirada com taxa 0 e bairro fora da tabela com taxa null', async () => {
  await assertSucceeds(addDoc(pedidos(anon()), pedido({ entrega: false, taxa: 0 })));
  await assertSucceeds(addDoc(pedidos(anon()), pedido({ taxa: null })));
});
test('pedido já aceito é negado', () => assertFails(addDoc(pedidos(anon()), pedido({ status: 'preparo' }))));
test('campo extra é negado', () => assertFails(addDoc(pedidos(anon()), pedido({ pago: true }))));
test('subtotal fora da faixa é negado', () => assertFails(addDoc(pedidos(anon()), pedido({ subtotal: 99999 }))));
test('hora do cliente é negada', () => assertFails(addDoc(pedidos(anon()), pedido({ criadoEm: new Date(0) }))));
test('nome gigante é negado', () => assertFails(addDoc(pedidos(anon()), pedido({ cliente: { ...pedido().cliente, nome: 'x'.repeat(61) } }))));
test('sacola vazia é negada', () => assertFails(addDoc(pedidos(anon()), pedido({ itens: [] }))));
test('estranho não lê pedido', () => assertFails(getDoc(doc(anon(), P, 'pedidos', 'p1'))));
test('logado fora da lista não lê pedido', () => assertFails(getDoc(doc(logado('outro@x.com'), P, 'pedidos', 'p1'))));
test('e-mail não verificado não vale', () => assertFails(getDoc(doc(logado('dono@x.com', false), P, 'pedidos', 'p1'))));
test('admin lê pedido', () => assertSucceeds(getDoc(doc(logado('dono@x.com'), P, 'pedidos', 'p1'))));
test('admin muda status', () =>
  assertSucceeds(comReg(adm(), 'p1', P1, { status: 'preparo', aceitoEm: serverTimestamp() })));
test('status sem registro é negado', () => assertFails(updateDoc(doc(adm(), P1), { status: 'preparo', aceitoEm: serverTimestamp() })));
test('admin não muda valor', () => assertFails(comReg(adm(), 'p1', P1, { subtotal: 1 })));
// ---------- acompanhar: etapa do pedido pro cliente (sem dado pessoal) ----------
const ACOMP = `${P}/acompanhar/p1`;
test('qualquer um lê o acompanhar pelo id, mesmo antes de existir', async () => {
  await assertSucceeds(getDoc(doc(anon(), P, 'acompanhar', 'nao-existe')));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), ACOMP), { status: 'preparo', modo: 'entrega' }));
  const s = await assertSucceeds(getDoc(doc(anon(), ACOMP)));
  assert.equal(s.data().status, 'preparo');
});
test('ninguém lista o acompanhar', () => assertFails(getDocs(collection(anon(), P, 'acompanhar'))));
test('cliente não grava o acompanhar', async () => {
  await assertFails(setDoc(doc(anon(), ACOMP), { status: 'entregue', modo: 'entrega' }));
  await assertFails(setDoc(doc(logado('outro@x.com'), ACOMP), { status: 'entregue', modo: 'entrega' }));
});
test('admin grava o acompanhar junto com o status', async () => {
  const db = adm(), b = writeBatch(db), r = doc(collection(db, P, 'registro'));
  b.set(r, linha('p1'));
  b.update(doc(db, P1), { status: 'preparo', aceitoEm: serverTimestamp(), reg: r.id });
  b.set(doc(db, ACOMP), { status: 'preparo', modo: 'entrega' });
  await assertSucceeds(b.commit());
  await assertSucceeds(setDoc(doc(db, ACOMP), { status: 'saiu', modo: 'retirada' }));
});
test('acompanhar com campo extra, status ou modo inventado é negado', async () => {
  await assertFails(setDoc(doc(adm(), ACOMP), { status: 'preparo', modo: 'entrega', nome: 'Ana' }));
  await assertFails(setDoc(doc(adm(), ACOMP), { status: 'pago', modo: 'entrega' }));
  await assertFails(setDoc(doc(adm(), ACOMP), { status: 'preparo', modo: 'drone' }));
  await assertFails(setDoc(doc(adm(), ACOMP), { status: 'preparo' }));
});
test('ninguém apaga o acompanhar', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), ACOMP), { status: 'novo', modo: 'entrega' }));
  await assertFails(deleteDoc(doc(adm(), ACOMP)));
});
// ---------- alterar pedido (painel > Editar) ----------
const alterar = (db, extra = {}, id = 'p1') => comReg(db, id, `${P}/pedidos/${id}`, { itens: [...pedido().itens, { id: 'coca', nome: 'Coca-Cola', unit: 6, qtd: 1 }],
  subtotal: 38, pag: 'Dinheiro', troco: 50, obs: 'sem gelo', alteradoEm: serverTimestamp(), antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix', fone: pedido().cliente.fone }, ...extra });
test('admin altera itens e pagamento', () => assertSucceeds(alterar(logado('dono@x.com'))));
test('estranho não altera pedido', () => assertFails(alterar(logado('outro@x.com'))));
test('alteração com hora do aparelho, sacola vazia ou pagamento inventado é negada', async () => {
  const adm = logado('dono@x.com');
  await assertFails(alterar(adm, { alteradoEm: new Date(0) }));
  await assertFails(alterar(adm, { itens: [] }));
  await assertFails(alterar(adm, { pag: 'Fiado' }));
});
test('alteração não mexe no cliente nem na taxa', async () => {
  const adm = logado('dono@x.com');
  await assertFails(alterar(adm, { taxa: 0 }));
  await assertFails(alterar(adm, { 'cliente.nome': 'Outro' }));
});
test('a primeira alteração grava o pedido como chegou; depois o antes não muda', async () => {
  const adm = logado('dono@x.com');
  await assertFails(alterar(adm, { antes: { itens: pedido().itens, subtotal: 1, pag: 'Pix', fone: pedido().cliente.fone } }));
  await assertFails(alterar(adm, { antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix' } }));
  await assertFails(updateDoc(doc(adm, P, 'pedidos', 'p1'), { subtotal: 38, alteradoEm: serverTimestamp() }));
  await assertSucceeds(alterar(adm));
  await assertSucceeds(alterar(adm, { subtotal: 44 }));
  await assertFails(alterar(adm, { antes: { itens: [], subtotal: 38, pag: 'Dinheiro' } }));
});
test('alteração troca o telefone, mas não apaga nem mexe no resto do cliente', async () => {
  const adm = logado('dono@x.com');
  await assertFails(alterar(adm, { 'cliente.fone': '' }));
  await assertFails(alterar(adm, { 'cliente.nome': 'Outro', 'cliente.fone': '(81) 9 7777-1111' }));
  await assertSucceeds(alterar(adm, { 'cliente.fone': '(81) 9 7777-1111' }));
});
test('pedido cancelado não altera', async () => {
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), P, 'pedidos', 'p1'), { status: 'cancelado' }));
  await assertFails(alterar(logado('dono@x.com')));
});
test('status inventado é negado', () => assertFails(comReg(adm(), 'p1', P1, { status: 'pago' })));
test('cada um só vê o próprio acesso', async () => {
  await assertSucceeds(getDoc(doc(logado('dono@x.com'), P, 'admins', 'dono@x.com')));
  await assertSucceeds(getDoc(doc(logado('outro@x.com'), P, 'admins', 'outro@x.com')));
  await assertFails(getDoc(doc(logado('outro@x.com'), P, 'admins', 'dono@x.com')));
});
test('ninguém se promove a admin', () => assertFails(setDoc(doc(logado('outro@x.com'), P, 'admins', 'outro@x.com'), {})));
test('clientes só pro admin', async () => {
  await assertFails(getDoc(doc(anon(), P, 'clientes', '81999999999')));
  await assertSucceeds(setDoc(doc(logado('dono@x.com'), P, 'clientes', '81999999999'), { pedidos: 1 }));
});
test('pedido com localização do cliente', () =>
  assertSucceeds(addDoc(pedidos(anon()), pedido({ cliente: { ...pedido().cliente, loc: '-8.118012,-35.291400' } }))));
test('localização gigante é negada', () =>
  assertFails(addDoc(pedidos(anon()), pedido({ cliente: { ...pedido().cliente, loc: 'x'.repeat(41) } }))));

// ---------- balcão: a loja lança o pedido já aceito ----------
const balcao = (extra = {}) => pedido({ status: 'preparo', aceitoEm: serverTimestamp(), local: true, entrega: false, taxa: 0,
  cliente: { nome: 'Mesa 3', fone: '', rua: '', numero: '', bairro: '', compl: '', ref: '', loc: '' }, ...extra });
const lancar = (db, p) => { const ref = doc(pedidos(db)); return comReg(db, ref.id, ref.path, p, { criar: true }); };
test('admin lança pedido no local, sem telefone', () => assertSucceeds(lancar(adm(), balcao())));
test('lançar sem registro é negado', () => assertFails(addDoc(pedidos(adm()), balcao())));
test('admin lança entrega pelo balcão', () =>
  assertSucceeds(lancar(adm(), balcao({ local: false, entrega: true, taxa: 5, cliente: pedido().cliente }))));
test('cliente não lança pedido já aceito', () => assertFails(addDoc(pedidos(anon()), balcao())));
test('cliente não marca consumo no local', () => assertFails(addDoc(pedidos(anon()), pedido({ local: true, entrega: false, taxa: 0 }))));
test('logado fora da lista não lança', () => assertFails(addDoc(pedidos(logado('outro@x.com')), balcao())));
test('no local com entrega é negado', () => assertFails(lancar(adm(), balcao({ entrega: true }))));
test('balcão com hora do aparelho é negado', () => assertFails(lancar(adm(), balcao({ aceitoEm: new Date(0) }))));
test('balcão sem nome é negado', () =>
  assertFails(lancar(adm(), balcao({ cliente: { ...balcao().cliente, nome: '' } }))));

// ---------- avaliações ----------
const avaliar = (db, id, notas, extra = {}) => {
  const b = writeBatch(db);
  b.set(doc(db, P, 'notas', id), { notas, criadoEm: serverTimestamp() });
  b.set(doc(db, P, 'avaliacoes', id), { notas, tags: ['Saboroso'], comentarios: { bruto: 'Top' }, nome: 'Ana',
    criadoEm: serverTimestamp(), vista: false, publicas: [], ...extra });
  return b.commit();
};
const ok = { bruto: 5, manso: 4 };
test('avalia com convite', () => assertSucceeds(avaliar(anon(), 'p1', ok)));
test('avaliar sem convite é negado', () => assertFails(avaliar(anon(), 'p9', { bruto: 5 })));
test('segunda avaliação é negada', async () => {
  await assertSucceeds(avaliar(anon(), 'p1', ok));
  await assertFails(avaliar(anon(), 'p1', { bruto: 1, manso: 1 }));
});
test('nota fora de 1..5 é negada', async () => {
  await assertFails(avaliar(anon(), 'p1', { bruto: 6, manso: 4 }));
  await assertFails(avaliar(anon(), 'p1', { bruto: 0, manso: 4 }));
});
test('faltar burger ou burger de fora é negado', async () => {
  await assertFails(avaliar(anon(), 'p1', { bruto: 5 }));
  await assertFails(avaliar(anon(), 'p1', { ...ok, matuto: 5 }));
});
test('etiqueta inventada é negada', () => assertFails(avaliar(anon(), 'p1', ok, { tags: ['Péssimo'] })));
test('comentário gigante, de burger fora do pedido ou que não é texto é negado', async () => {
  await assertFails(avaliar(anon(), 'p1', ok, { comentarios: { manso: 'x'.repeat(301) } }));
  await assertFails(avaliar(anon(), 'p1', ok, { comentarios: { matuto: 'Top' } }));
  await assertFails(avaliar(anon(), 'p1', ok, { comentarios: { bruto: 5 } }));
});
test('comentário nos dois burgers ou em nenhum passa', async () => {
  await assertSucceeds(avaliar(anon(), 'p1', ok, { comentarios: { bruto: 'Top', manso: 'x'.repeat(300) } }));
});
test('sem comentário passa', () => assertSucceeds(avaliar(anon(), 'p1', ok, { comentarios: {} })));
test('avaliação já publicada ou com outro nome é negada', async () => {
  await assertFails(avaliar(anon(), 'p1', ok, { publicas: ['bruto'] }));
  await assertFails(avaliar(anon(), 'p1', ok, { nome: 'Outro' }));
});
test('notas sem avaliação no mesmo lote é negado', () =>
  assertFails(setDoc(doc(anon(), P, 'notas', 'p1'), { notas: ok, criadoEm: serverTimestamp() })));
test('avaliação sem notas no mesmo lote é negada', () =>
  assertFails(setDoc(doc(anon(), P, 'avaliacoes', 'p1'), { notas: ok, tags: [], comentarios: {}, nome: 'Ana',
    criadoEm: serverTimestamp(), vista: false, publicas: [] })));
test('notas diferentes nos dois documentos é negado', async () => {
  const db = anon(), b = writeBatch(db);
  b.set(doc(db, P, 'notas', 'p1'), { notas: { bruto: 5, manso: 5 }, criadoEm: serverTimestamp() });
  b.set(doc(db, P, 'avaliacoes', 'p1'), { notas: { bruto: 1, manso: 1 }, tags: [], comentarios: {}, nome: 'Ana',
    criadoEm: serverTimestamp(), vista: false, publicas: [] });
  await assertFails(b.commit());
});
test('qualquer um lê convite e notas; só admin lê avaliação', async () => {
  await assertSucceeds(avaliar(anon(), 'p1', ok));
  await assertSucceeds(getDoc(doc(anon(), P, 'convites', 'p1')));
  await assertSucceeds(getDoc(doc(anon(), P, 'notas', 'p1')));
  await assertFails(getDoc(doc(anon(), P, 'avaliacoes', 'p1')));
  await assertSucceeds(getDoc(doc(logado('dono@x.com'), P, 'avaliacoes', 'p1')));
});
test('só admin cria convite e depoimento; admin só muda vista/publica', async () => {
  await assertSucceeds(avaliar(anon(), 'p1', ok));
  await assertFails(setDoc(doc(anon(), P, 'convites', 'p2'), { nome: 'X', ids: ['bruto'], burgers: [], entregueEm: new Date() }));
  await assertFails(setDoc(doc(anon(), P, 'depoimentos', 'p1_bruto'), { nome: 'Ana' }));
  const adm = logado('dono@x.com');
  await assertSucceeds(setDoc(doc(adm, P, 'convites', 'p2'), { nome: 'X', ids: ['bruto'], burgers: [], entregueEm: new Date() }));
  await assertSucceeds(updateDoc(doc(adm, P, 'avaliacoes', 'p1'), { vista: true }));
  await assertFails(updateDoc(doc(adm, P, 'avaliacoes', 'p1'), { publicas: ['bruto'] }));
  await assertSucceeds(comReg(adm, 'p1', `${P}/avaliacoes/p1`, { publicas: ['bruto'] }));
  await assertFails(updateDoc(doc(adm, P, 'avaliacoes', 'p1'), { notas: { bruto: 1, manso: 1 } }));
  await assertSucceeds(setDoc(doc(adm, P, 'depoimentos', 'p1_bruto'), { nome: 'Ana', burger: 'bruto', nota: 5, comentario: 'Top', criadoEm: new Date() }));
  await assertSucceeds(getDoc(doc(anon(), P, 'depoimentos', 'p1_bruto')));
  await assertFails(deleteDoc(doc(anon(), P, 'depoimentos', 'p1_bruto')));
  await assertSucceeds(deleteDoc(doc(adm, P, 'depoimentos', 'p1_bruto')));
});
test('admin troca os burgers do convite só enquanto ninguém avaliou', async () => {
  const c = doc(logado('dono@x.com'), P, 'convites', 'p1'), troca = { ids: ['bruto'], burgers: [{ id: 'bruto', nome: 'Bruto' }] };
  await assertFails(updateDoc(c, { ...troca, nome: 'Outro' }));
  await assertFails(updateDoc(c, { ids: [], burgers: [] }));
  await assertFails(updateDoc(doc(anon(), P, 'convites', 'p1'), troca));
  await assertSucceeds(updateDoc(c, troca));
  await assertSucceeds(updateDoc(c, { ids: ['bruto', 'manso'], burgers: [{ id: 'bruto', nome: 'Bruto' }, { id: 'manso', nome: 'Manso' }] }));
  await assertSucceeds(avaliar(anon(), 'p1', ok));
  await assertFails(updateDoc(c, troca));
});
test('cliente marca a abertura do convite uma vez só, com a hora do servidor', async () => {
  const c = doc(anon(), P, 'convites', 'p1');
  await assertFails(updateDoc(c, { abertoEm: new Date(0), abertoPor: 'link' }));
  await assertFails(updateDoc(c, { abertoEm: serverTimestamp(), abertoPor: 'email' }));
  await assertFails(updateDoc(c, { abertoEm: serverTimestamp(), abertoPor: 'link', nome: 'X' }));
  await assertSucceeds(updateDoc(c, { abertoEm: serverTimestamp(), abertoPor: 'qr' }));
  await assertFails(updateDoc(c, { abertoEm: serverTimestamp(), abertoPor: 'link' }));
  await assertFails(setDoc(doc(logado('dono@x.com'), P, 'convites', 'p1'), { nome: 'Ana', ids: ['bruto'], burgers: [], entregueEm: new Date() }));
});

// ---------- registro (lastro) ----------
test('registro: quem é o e-mail logado e quando é a hora do servidor', async () => {
  const r = () => doc(collection(adm(), P, 'registro'));
  await assertSucceeds(setDoc(r(), linha('loja')));
  await assertFails(setDoc(r(), linha('loja', { quem: 'outro@x.com' })));
  await assertFails(setDoc(r(), linha('loja', { em: new Date() })));
  await assertFails(setDoc(r(), linha('loja', { extra: 1 })));
  await assertFails(setDoc(doc(collection(logado('outro@x.com'), P, 'registro')), linha('loja', { quem: 'outro@x.com' })));
  await assertFails(setDoc(doc(collection(anon(), P, 'registro')), linha('loja', { quem: '' })));
});
test('registro: ninguém edita nem apaga; só admin lê', async () => {
  const r = doc(collection(adm(), P, 'registro'));
  await assertSucceeds(setDoc(r, linha('loja')));
  await assertFails(updateDoc(r, { acao: 'outra' }));
  await assertFails(deleteDoc(r));
  await assertSucceeds(getDoc(r));
  await assertFails(getDoc(doc(anon(), r.path)));
  await assertFails(getDoc(doc(logado('outro@x.com'), r.path)));
});
test('registro de outro alvo, antigo ou repetido não vale', async () => {
  await assertFails(comReg(adm(), 'p9', P1, { status: 'preparo', aceitoEm: serverTimestamp() }));
  const velho = doc(collection(adm(), P, 'registro'));
  await assertSucceeds(setDoc(velho, linha('p1')));
  await assertFails(updateDoc(doc(adm(), P1), { status: 'preparo', aceitoEm: serverTimestamp(), reg: velho.id }));
  await assertSucceeds(comReg(adm(), 'p1', P1, { status: 'preparo', aceitoEm: serverTimestamp() }));
  let usado;
  await env.withSecurityRulesDisabled(async c => { usado = (await getDoc(doc(c.firestore(), P1))).data().reg; });
  assert.ok(usado);
  await assertFails(comReg(adm(), 'p1', P1, { status: 'saiu', saiuEm: serverTimestamp() }, { reg: usado }));
});

// ---------- pagamento dividido (só a loja) ----------
const div = (a, b, va, vb) => ({ pag: `${a} + ${b}`, divisao: [{ pag: a, valor: va }, { pag: b, valor: vb }] });
test('balcão divide o pagamento em 2 formas que somam o total', async () => {
  await assertSucceeds(lancar(adm(), balcao(div('Pix', 'Dinheiro', 12.5, 19.5)))); // subtotal 32, taxa 0
  await assertSucceeds(lancar(adm(), balcao({ local: false, entrega: true, taxa: 5, cliente: pedido().cliente, ...div('Pix', 'Cartão de crédito', 20, 17) })));
});
const div3 = (va, vb, vc, c = 'Dinheiro') => ({ pag: `Pix + Cartão de crédito + ${c}`,
  divisao: [{ pag: 'Pix', valor: va }, { pag: 'Cartão de crédito', valor: vb }, { pag: c, valor: vc }] });
test('balcão divide em 3 formas; soma errada, repetida, zero ou pag errado é negado', async () => {
  await assertSucceeds(lancar(adm(), balcao(div3(10, 12, 10)))); // subtotal 32
  await assertFails(lancar(adm(), balcao(div3(10, 12, 9))));
  await assertFails(lancar(adm(), balcao(div3(10, 12, 10, 'Pix'))));
  await assertFails(lancar(adm(), balcao(div3(10, 22, 0))));
  await assertFails(lancar(adm(), balcao({ ...div3(10, 12, 10), pag: 'Pix + Cartão de crédito' })));
  await assertFails(lancar(adm(), balcao({ ...div3(8, 8, 8), divisao: [...div3(8, 8, 8).divisao, { pag: 'Cartão de débito', valor: 8 }],
    pag: 'Pix + Cartão de crédito + Dinheiro + Cartão de débito' })));
});
test('divisão errada é negada: soma, forma repetida ou inventada, valor zero, pag diferente, taxa a confirmar', async () => {
  await assertFails(lancar(adm(), balcao(div('Pix', 'Dinheiro', 10, 10))));
  await assertFails(lancar(adm(), balcao(div('Pix', 'Pix', 16, 16))));
  await assertFails(lancar(adm(), balcao(div('Pix', 'Fiado', 16, 16))));
  await assertFails(lancar(adm(), balcao(div('Pix', 'Dinheiro', 0, 32))));
  await assertFails(lancar(adm(), balcao({ ...div('Pix', 'Dinheiro', 16, 16), pag: 'Pix' })));
  await assertFails(lancar(adm(), balcao({ ...div('Pix', 'Dinheiro', 16, 16), divisao: [{ pag: 'Pix', valor: 16 }, { pag: 'Dinheiro', valor: 16 }, { pag: 'Pix', valor: 0 }] })));
  await assertFails(lancar(adm(), balcao({ local: false, entrega: true, taxa: null, cliente: pedido().cliente, ...div('Pix', 'Dinheiro', 16, 16) })));
});
test('cliente no site não divide', () => assertFails(addDoc(pedidos(anon()), pedido(div('Pix', 'Dinheiro', 20, 17)))));
test('alteração divide e depois volta pra uma forma (divisao null)', async () => {
  await assertSucceeds(alterar(adm(), div('Pix', 'Dinheiro', 20, 23))); // 38 + 5
  await assertFails(alterar(adm(), div('Pix', 'Dinheiro', 20, 20)));
  await assertSucceeds(alterar(adm(), { pag: 'Cartão de débito', divisao: null, antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix', fone: pedido().cliente.fone } }));
  await assertFails(alterar(adm(), { pag: 'Pix + Dinheiro', divisao: null, antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix', fone: pedido().cliente.fone } }));
});

// ---------- funcionário: só a aba Pedidos ----------
const FUNC = 'func@x.com';
const func = () => logado(FUNC);
const horasAtras = h => new Date(Date.now() - h * 3600e3);
const desde = (db, d) => getDocs(query(pedidos(db), where('criadoEm', '>=', Timestamp.fromDate(d)), orderBy('criadoEm', 'desc')));
test('funcionário lê o próprio acesso e não se cadastra', async () => {
  await assertSucceeds(getDoc(doc(func(), P, 'funcionarios', FUNC)));
  await assertFails(getDoc(doc(func(), P, 'funcionarios', 'outro@x.com')));
  await assertFails(setDoc(doc(logado('outro@x.com'), P, 'funcionarios', 'outro@x.com'), {}));
  await assertFails(setDoc(doc(func(), P, 'admins', FUNC), {}));
});
test('funcionário lê pedido de hoje e de ontem, não de antes', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), P, 'pedidos', 'velho'), { ...pedido(), criadoEm: horasAtras(72) }));
  await assertSucceeds(getDoc(doc(func(), P1)));
  await assertFails(getDoc(doc(func(), P, 'pedidos', 'velho')));
  await assertSucceeds(desde(func(), horasAtras(47)));
  await assertFails(desde(func(), horasAtras(49)));
  await assertFails(getDocs(pedidos(func())));
  await assertSucceeds(getDocs(pedidos(adm()))); // dono continua lendo tudo
});
test('funcionário aceita: status, acompanhar e cliente na mesma transação (igual ao painel)', async () => {
  const db = func();
  await assertSucceeds(runTransaction(db, async t => {
    const cRef = doc(db, P, 'clientes', '81999999999'), r = doc(collection(db, P, 'registro'));
    await t.get(cRef);
    t.set(r, linha('p1', { quem: FUNC }));
    t.update(doc(db, P1), { status: 'preparo', aceitoEm: serverTimestamp(), reg: r.id });
    t.set(cRef, { nome: 'Ana', pedidos: increment(1), gasto: increment(32) }, { merge: true });
    t.set(doc(db, P, 'acompanhar', 'p1'), { status: 'preparo', modo: 'entrega' });
  }));
});
test('funcionário entrega com convite no mesmo lote', async () => {
  await env.withSecurityRulesDisabled(c => deleteDoc(doc(c.firestore(), P, 'convites', 'p1')));
  const db = func(), b = writeBatch(db), r = doc(collection(db, P, 'registro'));
  b.set(r, linha('p1', { quem: FUNC }));
  b.update(doc(db, P1), { status: 'entregue', entregueEm: serverTimestamp(), reg: r.id });
  b.set(doc(db, P, 'convites', 'p1'), { nome: 'Ana', ids: ['bruto'], burgers: [{ id: 'bruto', nome: 'Bruto' }], entregueEm: serverTimestamp() });
  b.set(doc(db, P, 'acompanhar', 'p1'), { status: 'entregue', modo: 'entrega' });
  await assertSucceeds(b.commit());
});
const comRegFunc = db => comReg(db, 'p1', P1, { itens: [...pedido().itens, { id: 'coca', nome: 'Coca-Cola', unit: 6, qtd: 1 }],
  subtotal: 38, pag: 'Dinheiro', troco: 50, obs: '', alteradoEm: serverTimestamp(), antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix', fone: pedido().cliente.fone } }, { quem: FUNC });
test('funcionário edita pedido e lança no balcão', async () => {
  await assertSucceeds(comRegFunc(func()));
  const ref = doc(pedidos(func()));
  await assertSucceeds(comReg(func(), ref.id, ref.path, balcao(), { criar: true, quem: FUNC }));
});
test('funcionário não mexe em pedido velho nem cria convite sem pedido', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), P, 'pedidos', 'velho'), { ...pedido(), criadoEm: horasAtras(72) }));
  const db = func();
  await assertFails(comReg(db, 'velho', `${P}/pedidos/velho`, { status: 'cancelado', canceladoEm: serverTimestamp() }, { quem: FUNC }));
  await assertSucceeds(comReg(adm(), 'velho', `${P}/pedidos/velho`, { status: 'cancelado', canceladoEm: serverTimestamp() }));
  await assertFails(setDoc(doc(db, P, 'convites', 'inventado'), { nome: 'X', ids: ['bruto'], burgers: [{ id: 'bruto', nome: 'Bruto' }], entregueEm: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, P, 'notas', 'p1'))); // a edição confere "já avaliado" pelas notas
});
test('funcionário não vê números, avaliações nem registro, e não mexe na loja', async () => {
  const db = func();
  await assertFails(getDocs(collection(db, P, 'clientes')));
  await assertFails(getDocs(collection(db, P, 'avaliacoes')));
  await assertFails(getDocs(collection(db, P, 'registro')));
  await assertFails(setDoc(doc(db, P, 'depoimentos', 'p1_bruto'), { texto: 'x' }));
});
test('funcionário fecha, abre e esgota (botões do dia), mas não mexe no resto da loja', async () => {
  const db = func(), loja = (dados, extra) => comReg(db, 'loja', P, dados, { quem: FUNC, ...extra });
  await assertSucceeds(loja({ fechadaHoje: '2026-11-21' }));
  await assertSucceeds(loja({ abertaHoje: null }));
  await assertSucceeds(loja({ 'esgotados.bruto': '2026-11-21' }));
  await assertFails(loja({ cardapio: [] }));
  await assertFails(loja({ maisPedido: 'bruto' }));
  await assertFails(updateDoc(doc(db, P), { fechadaHoje: '2026-11-21' })); // sem registro
});

// ---------- estoque: baixa no aceite, devolve no cancelamento, uma vez só ----------
const EST = `${P}/estoque/atual`;
const estoqueInicial = () => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), EST),
  { produtos: { pao: { nome: 'Pão', liga: 'pao' } }, qtd: { pao: 10 }, reg: 'x' }));
const qtdPao = async () => { let n; await env.withSecurityRulesDisabled(async c => { n = (await getDoc(doc(c.firestore(), EST))).data().qtd.pao; }); return n; };
// o lote do painel: pedido + estoque, cada um com a sua linha no registro
const comEstoque = (db, pedidoDados, n, quem = 'dono@x.com') => {
  const b = writeBatch(db), r1 = doc(collection(db, P, 'registro')), r2 = doc(collection(db, P, 'registro'));
  b.set(r1, linha('p1', { quem }));
  b.set(r2, linha('estoque', { quem }));
  b.update(doc(db, P1), { ...pedidoDados, reg: r1.id });
  b.update(doc(db, EST), { 'qtd.pao': increment(n), reg: r2.id });
  return b.commit();
};
const aceite = { status: 'preparo', aceitoEm: serverTimestamp(), baixa: { pao: 2 }, baixadoEm: serverTimestamp() };
const cancela = { status: 'cancelado', canceladoEm: serverTimestamp(), motivo: 'Cliente desistiu', devolvidoEm: serverTimestamp() };

test('estoque: aceite duplo é negado e o estoque baixa uma vez só', async () => {
  await estoqueInicial();
  await assertSucceeds(comEstoque(adm(), aceite, -2));
  await assertFails(comEstoque(adm(), aceite, -2));
  assert.equal(await qtdPao(), 8);
});
test('estoque: cancelar devolve uma vez só, e só pedido baixado', async () => {
  await estoqueInicial();
  await assertFails(comEstoque(adm(), cancela, 2)); // nunca baixou
  await assertSucceeds(comEstoque(adm(), aceite, -2));
  await assertSucceeds(comEstoque(adm(), cancela, 2));
  await assertFails(comEstoque(adm(), cancela, 2));
  assert.equal(await qtdPao(), 10);
});
test('estoque: baixa com hora do aparelho ou sem o mapa é negada', async () => {
  await estoqueInicial();
  await assertFails(comEstoque(adm(), { ...aceite, baixadoEm: new Date() }, -2));
  await assertFails(comEstoque(adm(), { ...aceite, baixa: 2 }, -2));
});
test('estoque: alterar mexe na baixa só de pedido baixado e não devolvido', async () => {
  await estoqueInicial();
  const alt = db => comReg(db, 'p1', P1, { itens: pedido().itens, subtotal: 32, pag: 'Pix', troco: 0, obs: '', alteradoEm: serverTimestamp(),
    antes: { itens: pedido().itens, subtotal: 32, pag: 'Pix', fone: pedido().cliente.fone }, baixa: { pao: 3 } });
  await assertFails(alt(adm()));
  await assertSucceeds(comEstoque(adm(), aceite, -2));
  await assertSucceeds(alt(adm()));
});
test('estoque: balcão nasce baixado, com hora do servidor', async () => {
  await assertSucceeds(lancar(adm(), balcao({ baixa: { pao: 1 }, baixadoEm: serverTimestamp() })));
  await assertSucceeds(lancar(adm(), balcao({ baixa: {}, baixadoEm: serverTimestamp(), semEstoque: true })));
  await assertFails(lancar(adm(), balcao({ baixa: { pao: 1 }, baixadoEm: new Date() })));
  await assertFails(lancar(adm(), balcao({ baixa: { pao: 1 }, devolvidoEm: serverTimestamp() })));
});
test('estoque: funcionário lê e mexe na quantidade, mas não nos produtos; quem não é da equipe nem lê', async () => {
  await estoqueInicial();
  const db = func(), est = (dados, extra) => comReg(db, 'estoque', EST, dados, { quem: FUNC, ...extra });
  await assertSucceeds(getDoc(doc(db, EST)));
  await assertFails(getDoc(doc(anon(), EST)));
  await assertFails(getDoc(doc(logado('outro@x.com'), EST)));
  await assertSucceeds(est({ 'qtd.pao': increment(12) }));
  await assertSucceeds(est({ 'qtd.pao': 7 }));
  await assertSucceeds(est({ 'maior.pao': 48 }));
  await assertFails(est({ 'produtos.pao.nome': 'Pão velho' }));
  await assertFails(est({ produtos: {} }));
  await assertFails(updateDoc(doc(db, EST), { 'qtd.pao': 1 })); // sem registro
  await assertFails(est({ 'qtd.pao': 1 }, { quem: 'dono@x.com' })); // registro em nome de outro
});
test('estoque: só o dono cria e cadastra produto; doc com outro nome é negado', async () => {
  await assertFails(comReg(func(), 'estoque', EST, { produtos: {}, qtd: {} }, { criar: true, quem: FUNC }));
  await assertSucceeds(comReg(adm(), 'estoque', EST, { produtos: { p: { nome: 'Pão', liga: 'pao' } }, qtd: { p: 0 } }, { criar: true }));
  await assertSucceeds(comReg(adm(), 'estoque', EST, { 'produtos.q': { nome: 'Coca' }, 'qtd.q': 5 }));
  await assertFails(comReg(adm(), 'estoque', EST, { lixo: 1 }));
  await assertFails(comReg(adm(), 'estoque', `${P}/estoque/outro`, { produtos: {}, qtd: {} }, { criar: true }));
});
test('registro é só acréscimo: nem dono nem funcionário editam ou apagam', async () => {
  const r = doc(collection(adm(), P, 'registro'));
  await assertSucceeds(setDoc(r, linha('x')));
  await assertFails(updateDoc(doc(adm(), r.path), { acao: 'outra' }));
  await assertFails(deleteDoc(doc(adm(), r.path)));
  await assertFails(deleteDoc(doc(func(), r.path)));
});

// os dois painéis (antigo e novo) montam a linha do registro pela mesma função: ela tem que passar na regra
test('registro: a linha de registro-linha.js passa na regra (painel antigo e novo), aparelho cortado em 150', async () => {
  const { linhaRegistro } = await import('../registro-linha.js');
  const db = adm(), b = writeBatch(db), r = doc(collection(db, P, 'registro'));
  b.set(r, linhaRegistro(serverTimestamp(), 'dono@x.com', 'status', 'p1', { cod: 'AB12C', de: 'novo', para: 'preparo' }, 'x'.repeat(300)));
  b.update(doc(db, P1), { status: 'preparo', aceitoEm: serverTimestamp(), reg: r.id });
  await assertSucceeds(b.commit());
  const sem = writeBatch(db), r2 = doc(collection(db, P, 'registro'));
  sem.set(r2, linhaRegistro(serverTimestamp(), undefined, 'erro', 'painel', undefined, 'x')); // sem e-mail: quem = '' não bate com o token
  await assertFails(sem.commit());
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumo, baixaDe, delta } from '../estoque.js';
import { LOJA } from '../lojas/lacarne.mjs';

const c = itens => consumo(itens, LOJA.cardapio);

test('burger: 1 pão + receita, vezes a quantidade', () => {
  assert.deepEqual(c([{ id: 'bruto', qtd: 2, sem: [], extras: [] }]),
    { pao: 2, maionese: 2, carne: 4, cheddar: 2, bacon: 2, cebola: 2 });
});

test('burger: tira o que o cliente tirou e soma os adicionais (por burger)', () => {
  assert.deepEqual(c([{ id: 'manso', qtd: 2, sem: ['Queijo cheddar'], extras: ['bacon', 'carne', 'carne'] }]),
    { pao: 2, maionese: 2, carne: 6, bacon: 2 });
});

test('pão não sai nem com tudo tirado; rótulo desconhecido em "sem" é ignorado', () => {
  assert.deepEqual(c([{ id: 'abusado', qtd: 1, sem: ['Queijo cheddar', 'Nutella', 'Não existe'], extras: [] }]),
    { pao: 1, carne: 1 });
});

test('bebida e sobremesa gastam 1 delas mesmas; pacote de pães = 6; carne crua = 1 carne', () => {
  assert.deepEqual(c([
    { id: 'coca', qtd: 3, sem: [], extras: [] }, { id: 'pudim', qtd: 1 },
    { id: 'pacote-paes', qtd: 2 }, { id: 'carne-crua', qtd: 4 },
  ]), { coca: 3, pudim: 1, pao: 12, carne: 4 });
});

test('item que saiu do cardápio não gasta nada; pedido somado entre itens', () => {
  assert.deepEqual(c([{ id: 'sumiu', qtd: 1 }, { id: 'manso', qtd: 1, sem: [] }, { id: 'esquentadinho', qtd: 1, sem: [] }]),
    { pao: 2, maionese: 2, carne: 2, cheddar: 2, 'geleia-pimenta': 1 });
});

test('baixa: só produto cadastrado e ligado; produto sem liga fica de fora', () => {
  const produtos = { p1: { nome: 'Pão', liga: 'pao' }, p2: { nome: 'Coca lata', liga: 'coca' }, p3: { nome: 'Guardanapo' } };
  assert.deepEqual(baixaDe({ pao: 2, carne: 4, coca: 1 }, produtos), { p1: 2, p2: 1 });
  assert.deepEqual(baixaDe({ pao: 2 }, undefined), {});
});

test('delta: só o que muda, com sinal', () => {
  assert.deepEqual(delta({ a: 3, b: 1 }, { a: 2, b: 1, c: 4 }), { a: 1, c: -4 });
  assert.deepEqual(delta({}, { a: 2 }), { a: -2 });
  assert.deepEqual(delta({ a: 1 }, { a: 1 }), {});
});

test('campos do update: com sinal, sem zero, só produto que existe (sem lista = todos)', async () => {
  const { camposQtd, negar } = await import('../estoque.js');
  const inc = n => `inc(${n})`;
  assert.deepEqual(camposQtd(negar({ a: 2, b: 1, c: 0 }), { a: {}, c: {} }, inc), { 'qtd.a': 'inc(-2)' });
  assert.deepEqual(camposQtd({ a: 2, b: 1 }, undefined, inc), { 'qtd.a': 'inc(2)', 'qtd.b': 'inc(1)' });
});

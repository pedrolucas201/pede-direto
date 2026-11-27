// Mudar o status e imprimir: porte 1:1 do painel antigo (painel/painel.js mudar() e imprimir()).
// Enquanto os dois painéis convivem, os dois precisam gravar exatamente igual: a regra do banco é a fonte da verdade.
import { doc, getDoc, setDoc, writeBatch, runTransaction, serverTimestamp, increment, type WriteBatch, type Transaction } from 'firebase/firestore';
import qrcode from 'qrcode-generator';
import { toast } from 'sonner';
import { soDigitos, whats, avisoCliente } from '../../../pedido.js';
import { VALIDOS } from '../../../numeros.js';
import { hoje } from '../../../horario.js';
import { burgersDoPedido } from '../../../avaliacao.js';
import { comanda } from '../../../comanda.js';
import { consumo, baixaDe, negar, camposQtd } from '../../../estoque.js';
import { auth, db } from './firebase';
import { lojaRef, pedidosRef, estoqueRef } from './dados';
import { registrar, anotar, erro } from './registro';
import type { Estoque, Loja, Pedido, Status } from './tipos';

export const ETAPAS: Record<Status, string> = { novo: 'Novo', preparo: 'Em preparo', saiu: 'Saiu / pronto', entregue: 'Entregue / retirado', cancelado: 'Cancelado' };
// grupos da lista misturam entrega e retirada; o título, o botão e o aviso de cada pedido usam etapa()
export const etapa = (st: Status, p: Pedido) => ((p.local ? { saiu: 'Pronto', entregue: 'Entregue' }
  : p.entrega ? { saiu: 'Saiu pra entrega', entregue: 'Entregue' }
  : { saiu: 'Pronto pra retirar', entregue: 'Retirado' }) as Partial<Record<Status, string>>)[st] ?? ETAPAS[st];
export const PROXIMA: Partial<Record<Status, Status>> = { novo: 'preparo', preparo: 'saiu', saiu: 'entregue' };
const CAMPO: Partial<Record<Status, string>> = { preparo: 'aceitoEm', saiu: 'saiuEm', entregue: 'entregueEm', cancelado: 'canceladoEm' };
const nomeConvite = (p: Pedido) => soDigitos(p.cliente.fone) ? p.cliente.nome.trim().split(/\s+/)[0] : p.cliente.nome.trim(); // balcão: "Mesa 4" inteiro
const linkAvaliar = (id: string, qr = false) => `${new URL('/avaliar/', location.href).href}${qr ? '?qr' : ''}#${id}`;

// aceitar conta o cliente; cancelar um pedido já aceito desconta. Os dois numa transação junto com o status.
// entregue com burger: cria o convite de avaliação junto com o status e manda o link na mensagem.
// Sem telefone (lançado no balcão): sem mensagem, sem convite e sem ficha de cliente.
// Pedido de outro dia: sem mensagem nem convite; a ficha conta igual.
// Convite que já existe (comanda impressa antes): só manda o link, sem recriar (a regra nega e derrubaria o status junto)
export async function mudar(p: Pedido, status: Status, loja: Loja, estoque: Estoque | null | undefined, motivo: string | null = null) {
  const fone = soDigitos(p.cliente.fone), doDia = hoje(p.criadoEm ?? new Date()) === hoje();
  const burgers = status === 'entregue' && fone && doDia ? burgersDoPedido(p.itens, loja.cardapio) : [];
  const avaliar = burgers.length ? linkAvaliar(p.id) : '';
  const texto = avisoCliente(status, p, motivo, loja, avaliar);
  if (texto && fone && doDia) window.open(whats(p.cliente.fone, texto), '_blank', 'noopener'); // antes de qualquer await, senão o navegador bloqueia
  const ref = doc(pedidosRef, p.id);
  // estoque: aceitar baixa, cancelar pedido baixado devolve o que saiu (não recalcula). A regra só deixa carimbar
  // baixadoEm/devolvidoEm uma vez: aceite duplo (2 aparelhos, os 2 painéis, offline) é recusado inteiro, com o estoque junto
  const baixar = status === 'preparo' && !p.baixadoEm, devolver = status === 'cancelado' && !!p.baixadoEm && !p.devolvidoEm;
  const baixa = baixar && estoque !== undefined ? baixaDe(consumo(p.itens, loja.cardapio), estoque?.produtos) : null; // null = sem o estoque carregado
  const mudanca = { status, [CAMPO[status]!]: serverTimestamp(), ...(motivo ? { motivo } : {}),
    ...(baixar ? { baixa: baixa ?? {}, baixadoEm: serverTimestamp(), ...(baixa ? {} : { semEstoque: true }) } : {}),
    ...(devolver ? { devolvidoEm: serverTimestamp() } : {}) };
  type T = WriteBatch | Transaction;
  const comReg = (t: T) => ({ ...mudanca, reg: registrar(t, 'status', p.id, { cod: p.cod, de: p.status, para: status, ...(motivo ? { motivo } : {}) }) });
  const comEstoque = (t: T) => {
    const q = baixar ? baixa && negar(baixa) : devolver ? p.baixa : null;
    const dados = { cod: p.cod, pedido: p.id, qtd: q, nome: auth.currentUser?.displayName || '' };
    const campos = q ? camposQtd(q, estoque?.produtos, increment) : {};
    if (Object.keys(campos).length) (t as WriteBatch).update(estoqueRef, { ...campos, reg: registrar(t, baixar ? 'baixa' : 'devolveu', 'estoque', dados) });
    else if (baixar && !baixa) registrar(t, 'semEstoque', 'estoque', dados); // o dono vê no histórico que esse pedido não baixou
  };
  // acompanhar: a etapa que o cliente vê no site (sem dado pessoal), gravada junto com o status nos 3 caminhos
  const acomp = doc(lojaRef, 'acompanhar', p.id), etapaCli = { status, modo: p.entrega ? 'entrega' : p.local ? 'local' : 'retirada' };
  const soStatus = () => { const b = writeBatch(db); b.update(ref, comReg(b)); comEstoque(b); b.set(acomp, etapaCli); return b.commit(); };
  const conta = !fone ? 0 : status === 'preparo' ? 1 : status === 'cancelado' && VALIDOS.includes(p.status) ? -1 : 0;
  toast(`#${p.cod}: ${etapa(status, p)}`);
  try {
    if (!conta && !avaliar) return await soStatus();
    if (!conta) {
      const convRef = doc(lojaRef, 'convites', p.id);
      if (await getDoc(convRef).then(d => d.exists(), () => false)) return await soStatus();
      const b = writeBatch(db);
      b.update(ref, comReg(b));
      b.set(convRef, { nome: nomeConvite(p), ids: burgers.map((x: { id: string }) => x.id), burgers, entregueEm: serverTimestamp() });
      b.set(acomp, etapaCli);
      return await b.commit();
    }
    await runTransaction(db, async t => {
      const cRef = doc(lojaRef, 'clientes', soDigitos(p.cliente.fone));
      const cli = await t.get(cRef);
      t.update(ref, comReg(t));
      comEstoque(t);
      t.set(cRef, {
        nome: p.cliente.nome, pedidos: increment(conta), gasto: increment(conta * p.subtotal),
        ...(conta > 0 ? { ultimo: p.criadoEm } : {}), ...(cli.exists() ? {} : { primeiro: p.criadoEm }),
      }, { merge: true });
      t.set(acomp, etapaCli); // depois do t.get: transação lê tudo antes de gravar
    });
  } catch (e) { console.error(e); erro(`status ${p.id}`, e); toast.error(`#${p.cod} não salvou, tenta de novo`); }
}

// comanda na térmica de 80 mm (ou PDF). O convite nasce aqui: quem tem a comanda na mão já recebeu, e avalia pelo QR
export async function imprimir(p: Pedido, loja: Loja) {
  anotar('imprimiu', p.id, { cod: p.cod });
  const burgers = burgersDoPedido(p.itens, loja.cardapio);
  let qr = '';
  if (burgers.length) {
    // já existe (impressa de novo, ou já entregue com telefone): a regra nega sobrescrever e o QR continua valendo
    setDoc(doc(lojaRef, 'convites', p.id), { nome: nomeConvite(p), ids: burgers.map((x: { id: string }) => x.id), burgers, entregueEm: serverTimestamp() })
      .catch(() => {});
    const q = qrcode(0, 'M');
    q.addData(linkAvaliar(p.id, true));
    q.make();
    qr = q.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
  }
  const c = document.getElementById('comanda')!;
  c.innerHTML = comanda(p, loja, qr);
  await c.querySelector('img')?.decode().catch(() => {}); // logo carregado antes de medir e imprimir
  // página = tamanho da comanda (mede fora da tela; 96 px = 1 polegada), senão o PDF sai em A4
  c.classList.add('medindo');
  const mm = Math.ceil(c.offsetHeight * 25.4 / 96) + 2;
  c.classList.remove('medindo');
  (document.getElementById('pagina') ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pagina' })))
    .textContent = `@page { size: 80mm ${mm}mm; margin: 0; }`;
  print();
}

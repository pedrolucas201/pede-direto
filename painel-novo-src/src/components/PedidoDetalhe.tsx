// Detalhe do pedido (janela), com Imprimir, Editar, Recusar/Cancelar e o botão da próxima etapa. Porte de abrirPedido().
import { useEffect, useState } from 'react';
import { Printer, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { conferir, whats, mapa, extrasTxt, pagTexto, MOTIVOS } from '../../../pedido.js';
import { brl } from '../../../util.js';
import { etapa, mudar, imprimir, PROXIMA } from '@/lib/acoes';
import type { Estoque, Loja, Pedido } from '@/lib/tipos';
import { total } from './Pedidos';

const hora = (d: Date | null) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' }) : '';
const Link = (props: { href: string; children: React.ReactNode }) =>
  <a {...props} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline" />;

export function PedidoDetalhe({ p, loja, estoque, onFechar, onEditar }:
  { p: Pedido | null; loja: Loja; estoque: Estoque | null | undefined; onFechar: () => void; onEditar: (p: Pedido) => void }) {
  // normal | confirmar (valor não confere, antes de aceitar) | motivo (recusar/cancelar)
  const [modo, setModo] = useState<'normal' | 'confirmar' | 'motivo'>('normal');
  useEffect(() => setModo('normal'), [p?.id]);
  if (!p) return <Dialog open={false} />;
  const c = conferir(p, loja), cl = p.cliente;
  const prox = PROXIMA[p.status], fim = ['entregue', 'cancelado'].includes(p.status);
  const avancar = (status = prox!, motivo: string | null = null) => { onFechar(); mudar(p, status, loja, estoque, motivo); };

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="pedido">
        <DialogHeader>
          <DialogTitle>#{p.cod} · {etapa(p.status, p)}</DialogTitle>
          <DialogDescription className="sr-only">Detalhe do pedido</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          {!c.ok && <p className="rounded-xl bg-accent px-3 py-2 font-semibold text-primary">⚠ Valor não confere com o cardápio: deveria ser {brl(c.subtotal)}
            {p.entrega ? ` + ${c.taxa === null ? 'entrega a confirmar' : `${brl(c.taxa)} de entrega`}` : ''}.</p>}
          <p><strong>{cl.nome}</strong>{cl.fone && <> · <Link href={whats(cl.fone, '')}>{cl.fone}</Link></>}
            <small className="block text-muted-foreground">feito às {hora(p.criadoEm)}{p.alteradoEm && ` · alterado às ${hora(p.alteradoEm)}`}</small></p>
          <p>{p.entrega ? <>🛵 {cl.rua}, {cl.numero} · {cl.bairro}{cl.compl && ` · ${cl.compl}`}
            {cl.ref && <small className="block text-muted-foreground">{cl.ref}</small>}
            <span className="block"><Link href={mapa(`${cl.rua}, ${cl.numero}, ${cl.bairro}`, loja.cidade)}>Abrir no mapa</Link>
              {cl.loc && <> · <Link href={mapa(cl.loc)}>📍 Localização exata (GPS)</Link></>}</span></>
            : p.local ? '🍽️ Consumo no local' : '🏃 Retirada no local'}</p>
          <ul className="list-disc pl-5">
            {p.itens.map((i, k) => <li key={k}><strong>{i.qtd}x {i.nome}</strong>
              {Object.entries(i.escolhas || {}).map(([t, v]) => <small key={t} className="block text-muted-foreground">{t}: {v}</small>)}
              {!!i.sem?.length && <small className="block text-muted-foreground">Sem: {i.sem.join(', ')}</small>}
              {!!i.extras?.length && <small className="block text-muted-foreground">{extrasTxt(i, loja.adicionais)}</small>}
              {i.obs && <small className="block text-muted-foreground">Obs: {i.obs}</small>}</li>)}
          </ul>
          <p>{p.entrega && <>Subtotal {brl(p.subtotal)} · Entrega {p.taxa === null ? 'a confirmar' : brl(p.taxa)}<br /></>}
            <strong>Total {brl(total(p))}{p.taxa === null ? ' + entrega' : ''}</strong> · {pagTexto(p)}
            {!!p.troco && p.pag.includes('Dinheiro') && ` · troco p/ ${brl(p.troco)}`}</p>
          {p.obs && <p>📝 {p.obs}</p>}
          {p.antes && <p><small className="text-muted-foreground">Antes da alteração: {p.antes.itens.map(i => `${i.qtd}x ${i.nome}`).join(', ')}
            {' · '}{brl(p.antes.subtotal + (p.taxa ?? 0))} · {p.antes.pag}
            {'fone' in p.antes && p.antes.fone !== cl.fone ? ` · ${p.antes.fone ? `tel. ${p.antes.fone}` : 'sem telefone'}` : ''}</small></p>}
          {p.status === 'cancelado' && <p>Motivo: {p.motivo}</p>}
        </div>
        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-end">
          {modo === 'confirmar' ? <>
            <p className="w-full rounded-xl border-2 border-[#e0a000] bg-[#ffecb3] px-3 py-2 font-semibold text-[#6b4f00]">⚠ O valor não confere com o cardápio. Confira quanto o cliente pagou antes de aceitar.</p>
            <Button variant="ghost" onClick={() => setModo('normal')}>Voltar</Button>
            <Button data-acao="mesmoAssim" onClick={() => avancar('preparo')}>Aceitar mesmo assim</Button>
          </> : modo === 'motivo' ? <>
            <div className="flex w-full flex-wrap gap-2">
              {MOTIVOS.map((m: string) => <Button key={m} variant="outline" size="sm" data-motivo={m} onClick={() => avancar('cancelado', m)}>{m}</Button>)}
            </div>
            <Button variant="ghost" onClick={() => setModo('normal')}>Voltar</Button>
          </> : <>
            {p.status !== 'cancelado' && <Button variant="ghost" className="sm:mr-auto" data-acao="imprimir" onClick={() => imprimir(p, loja)}><Printer />Imprimir</Button>}
            {p.status !== 'cancelado' && <Button variant="ghost" data-acao="editar" onClick={() => onEditar(p)}><Pencil />Editar</Button>}
            {!fim && <Button variant="ghost" data-acao="cancelar" onClick={() => setModo('motivo')}>{p.status === 'novo' ? 'Recusar' : 'Cancelar'}</Button>}
            {prox && <Button data-acao="avancar" onClick={() => prox === 'preparo' && !c.ok ? setModo('confirmar') : avancar()}>
              {prox === 'preparo' ? 'Aceitar' : etapa(prox, p)}</Button>}
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

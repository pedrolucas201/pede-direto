// Aba Pedidos: mesmo arranjo do painel antigo (pílulas por etapa, lista, detalhe em janela). Só a tecnologia mudou.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Plus, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { conferir } from '../../../pedido.js';
import { hoje } from '../../../horario.js';
import { brl } from '../../../util.js';
import { usePedidosHoje, usePedidosDia, lerPedido, pedidosRef } from '@/lib/dados';
import { useSom, bip, avisarNoTitulo } from '@/lib/som';
import { etapa } from '@/lib/acoes';
import type { Papel } from '@/lib/acesso';
import type { Estoque, Loja, Pedido, Status } from '@/lib/tipos';
import { PedidoDetalhe } from './PedidoDetalhe';
import { Balcao, type TelaBalcao } from './Balcao';

const COLUNAS: [string, string, Status[]][] = [['novo', 'Novos', ['novo']], ['preparo', 'Em preparo', ['preparo']],
  ['saiu', 'Saiu / pronto', ['saiu']], ['fim', 'Finalizados', ['entregue', 'cancelado']]];
const hora = (d: Date | null) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' }) : '';
export const total = (p: Pedido) => p.subtotal + (p.taxa ?? 0);
const tipo = (p: Pedido) => p.entrega ? p.cliente.bairro : p.local ? 'No local' : 'Retirada';
const somaDias = (d: string, n: number) => hoje(new Date(new Date(`${d}T12:00:00-03:00`).getTime() + n * 864e5));

export function Pedidos({ loja, estoque, papel, onNovos }: { loja: Loja; estoque: Estoque | null | undefined; papel: Papel; onNovos: (n: number) => void }) {
  const [diaVivo] = useState(() => hoje());
  const [dia, setDia] = useState(diaVivo);
  const [filtro, setFiltro] = useState('novo');
  const [chamando, setChamando] = useState(false); // chegou pedido novo e a pessoa está em outra etapa/dia
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [avulso, setAvulso] = useState<Pedido | null>(null); // pedido do link que não está na lista do dia
  const [balcao, setBalcao] = useState<TelaBalcao | null>(null);
  const som = useSom();
  const ehHoje = dia === diaVivo;
  const estado = useRef({ filtro, ehHoje });
  estado.current = { filtro, ehHoje };

  const alertar = useCallback(() => {
    bip();
    if (estado.current.filtro !== 'novo' || !estado.current.ehHoje) setChamando(true);
    avisarNoTitulo();
    setTimeout(bip, 700);
    navigator.vibrate?.([200, 100, 200]);
    toast('Pedido novo! 🍔');
  }, []);
  const pedidosHoje = usePedidosHoje(diaVivo, alertar);
  const doDia = usePedidosDia(ehHoje ? null : dia);
  const lista = ehHoje ? pedidosHoje : doDia === 'erro' ? [] : doDia;
  const todos = useMemo(() => [...(pedidosHoje ?? []), ...(Array.isArray(doDia) ? doDia : []), ...(avulso ? [avulso] : [])], [pedidosHoje, doDia, avulso]);
  const aberto = abertoId ? todos.find(p => p.id === abertoId) ?? null : null;
  const novos = pedidosHoje?.filter(p => p.status === 'novo').length ?? 0;
  useEffect(() => onNovos(novos), [novos, onNovos]);

  // funcionário vai até ontem (a regra do banco nega mais que 48 h)
  const primeiro = papel === 'funcionario' ? somaDias(diaVivo, -1) : '';
  const verDia = (d: string) => {
    const novo = d > diaVivo ? diaVivo : d < primeiro ? primeiro : d;
    setDia(novo);
    if (novo === diaVivo) { setFiltro('novo'); setChamando(false); }
    else primeiraEtapa.current = true;
  };
  // outro dia abre na primeira etapa com pedido: o que ficou parado aparece antes dos finalizados
  const primeiraEtapa = useRef(false);
  useEffect(() => {
    if (!primeiraEtapa.current || !Array.isArray(doDia)) return;
    primeiraEtapa.current = false;
    setFiltro(COLUNAS.find(([, , sts]) => doDia.some(p => sts.includes(p.status)))?.[0] ?? 'fim');
  }, [doDia]);

  // link "Abrir no painel" do WhatsApp: /painel-novo/#<id>
  useEffect(() => {
    const abrirDoLink = async () => {
      const id = location.hash.slice(1);
      if (!id) return;
      history.replaceState(null, '', location.pathname);
      if (!todos.some(p => p.id === id)) {
        const d = await getDoc(doc(pedidosRef, id)).catch(() => null);
        if (!d?.exists()) return toast.error('Pedido não encontrado');
        setAvulso(lerPedido(d));
      }
      setAbertoId(id);
    };
    if (pedidosHoje) abrirDoLink();
    addEventListener('hashchange', abrirDoLink);
    return () => removeEventListener('hashchange', abrirDoLink);
  }, [pedidosHoje === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = COLUNAS.map(([st, nome, sts]) => [st, nome, (lista ?? []).filter(p => sts.includes(p.status))] as const);
  const escolher = (st: string) => { setFiltro(st); if (st === 'novo') setChamando(false); };

  return (
    <section data-testid="aba-pedidos">
      {som.estado === 'ativar' && <Button variant="secondary" className="mb-4" onClick={() => { som.ligar(); bip(); toast('Som ativado 🔔'); }}><Bell />Ativar som</Button>}
      {som.estado === 'religar' && <p className="mb-4 rounded-xl bg-accent px-3 py-2 text-sm text-primary">🔕 Toque na tela pra religar o som</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button data-testid="lancar" onClick={() => setBalcao({ src: '/?balcao', titulo: 'Lançar pedido' })}><Plus />Lançar pedido</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Dia anterior" disabled={dia === primeiro} onClick={() => verDia(somaDias(dia, -1))}><ChevronLeft /></Button>
          <input type="date" aria-label="Escolher o dia" value={dia} max={diaVivo} min={primeiro} onChange={e => e.target.value && verDia(e.target.value)}
            className="rounded-lg border bg-transparent px-2 py-1.5 text-sm" />
          <Button variant="ghost" size="icon" aria-label="Próximo dia" disabled={ehHoje} onClick={() => verDia(somaDias(dia, 1))}><ChevronRight /></Button>
          <Button variant={ehHoje ? 'default' : 'outline'} size="sm" className={cn(chamando && !ehHoje && 'animate-pulse font-bold')} onClick={() => verDia(diaVivo)}>Hoje</Button>
        </div>
      </div>
      <div role="tablist" className="sticky top-0 z-[3] -mx-1 mb-2 flex gap-1.5 overflow-x-auto bg-background px-1 py-2">
        {grupos.map(([st, nome, l]) => (
          <button key={st} role="tab" data-filtro={st} onClick={() => escolher(st)}
            className={cn('shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-sm whitespace-nowrap',
              st === filtro ? 'border-primary bg-primary text-primary-foreground' : st === 'novo' && l.length ? 'text-primary' : '',
              st === 'novo' && chamando && filtro !== 'novo' && ehHoje && 'animate-pulse border-primary font-bold text-primary ring-4 ring-primary/25')}>
            {nome} <b className="ml-1">{l.length}</b>
          </button>
        ))}
      </div>
      {lista === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : doDia === 'erro' && !ehHoje ? <p className="text-sm text-muted-foreground">Não deu pra carregar esse dia. Confere a internet.</p>
        : !lista.length ? <p className="text-sm text-muted-foreground">{ehHoje ? 'Nenhum pedido hoje ainda.' : 'Nenhum pedido neste dia.'}</p>
        : grupos.filter(([st]) => st === filtro).map(([st, , l]) => (
          <div key={st} className="grid gap-2 lg:grid-cols-2 lg:gap-x-3" data-testid="lista-pedidos">
            {l.length ? l.map(p => <Cartao key={p.id} p={p} loja={loja} fim={st === 'fim'} onClick={() => setAbertoId(p.id)} />)
              : <p className="text-sm text-muted-foreground">Nenhum</p>}
          </div>
        ))}
      <PedidoDetalhe p={aberto} loja={loja} estoque={estoque} onFechar={() => setAbertoId(null)}
        onEditar={p => { setAbertoId(null); setBalcao({ src: `/?balcao&editar=${p.id}`, titulo: `Alterar pedido #${p.cod}` }); }} />
      <Balcao tela={balcao} onFechar={() => setBalcao(null)}
        onLancado={id => { setBalcao(null); setFiltro('preparo'); setAbertoId(id); toast('Pedido lançado ✅'); }}
        onEditado={id => { setBalcao(null); setAbertoId(id); toast('Pedido alterado ✅'); }} />
    </section>
  );
}

// valor diferente do cardápio (pedido mexido, preço que mudou ou item que saiu): âmbar, destoa do rosa de novo
function Cartao({ p, loja, fim, onClick }: { p: Pedido; loja: Loja; fim: boolean; onClick: () => void }) {
  const c = conferir(p, loja), certo = c.subtotal + (c.taxa ?? 0);
  return (
    <button data-id={p.id} onClick={onClick}
      className={cn('flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border bg-card p-3 text-left',
        p.status === 'novo' && 'border-2 border-primary bg-accent',
        !c.ok && 'border-[3px] border-[#e0a000] bg-[#ffecb3]')}>
      <span>
        <strong>#{p.cod} · {p.cliente.nome}</strong>
        <small className="block text-muted-foreground">{hora(p.criadoEm)} · {tipo(p)} · {p.pag}{fim ? ` · ${etapa(p.status, p)}` : ''}</small>
        {!c.ok && <small className="block font-semibold text-[#6b4f00]">⚠ Não confere: {Number.isNaN(certo) ? 'item fora do cardápio' : `cardápio dá ${brl(certo)}`}</small>}
      </span>
      <span className="font-semibold whitespace-nowrap">
        {c.ok ? brl(total(p)) : <><s className="mr-1 font-normal text-[#8a6d00]">{brl(total(p))}</s>{Number.isNaN(certo) ? '' : brl(certo)} ⚠</>}
        {p.taxa === null ? ' + entrega' : ''}
      </span>
    </button>
  );
}

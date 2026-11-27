// Aba Números: igual ao painel antigo (painel.js carregarNumeros/renderNumeros/planilha). Só lê; a conta é a do numeros.js
import { useEffect, useState } from 'react';
import { getDocs, query, where, collection, Timestamp } from 'firebase/firestore';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { periodo, intervalo, calcular, variacao, csv } from '../../../numeros.js';
import { hoje } from '../../../horario.js';
import { brl } from '../../../util.js';
import { lojaRef, pedidosRef, lerPedido } from '@/lib/dados';
import type { Loja, Pedido } from '@/lib/tipos';

type Per = 'hoje' | 'semana' | 'mes' | 'livre';
type Lista = [string, number][];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Calc = any; // o retorno de calcular() (numeros.js, sem tipos)
const PERIODOS: [Per, string][] = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['livre', 'Período']];
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ANTERIOR: Record<string, string> = { hoje: 'o mesmo dia da semana passada', semana: 'a semana passada', mes: 'o mês passado' };
const TITULOS = { bairros: 'Todos os bairros', clientes: 'Todos os clientes' };
const semAcento = (s: string) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const data = (t: unknown) => (t as Timestamp | null)?.toDate?.() ?? null;

function Seta({ a, b }: { a: number; b: number }) {
  const v = variacao(a, b);
  return v === null ? null : <small className={v >= 0 ? 'text-green-700' : 'text-primary'}>{v >= 0 ? '↑' : '↓'} {Math.abs(v)}%</small>;
}
function Barras({ lista, fmt = String }: { lista: Lista; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...lista.map(([, v]) => v));
  if (!lista.length) return <p className="text-sm text-muted-foreground">Sem dados ainda</p>;
  return <>{lista.map(([k, v]) => (
    <div key={k} className="my-1.5 grid grid-cols-[110px_1fr_auto] items-center gap-2 text-sm">
      <span className="truncate">{k}</span><i className="h-3 min-w-0.5 rounded-md bg-primary" style={{ width: `${v / max * 100}%` }} /><b>{fmt(v)}</b>
    </div>))}</>;
}

// computador: todas as seções abertas; celular: só a primeira (as outras abrem com um toque). Fora do componente: senão fecha a cada render
const aberto = (t: string) => matchMedia('(min-width: 1000px)').matches || t === 'Burgers mais vendidos';
function Bloco({ t, largo, children }: { t: string; largo?: boolean; children: React.ReactNode }) {
  return <details open={aberto(t)} className={cn('rounded-xl bg-card p-3', largo && 'md:col-span-2')}>
    <summary className="cursor-pointer font-semibold">{t}</summary>{children}</details>;
}

export function Numeros({ loja }: { loja: Loja }) {
  const [per, setPer] = useState<Per>('hoje');
  const [de, setDe] = useState(''), [ate, setAte] = useState('');
  const [res, setRes] = useState<{ a: Calc; b: Calc; doPeriodo: Pedido[] } | 'carregando' | 'erro'>('carregando');
  const [lista, setLista] = useState<null | 'bairros' | 'clientes'>(null);
  const [busca, setBusca] = useState('');
  const diasLivre = (Date.parse(ate) - Date.parse(de)) / 864e5 + 1;
  const livreInvalido = per === 'livre' && !(diasLivre >= 1);

  useEffect(() => {
    if (livreInvalido) return;
    let vivo = true;
    const p = per === 'livre' ? intervalo(de, ate) : periodo(per);
    setRes('carregando');
    // ponytail: lê o período atual + anterior e a coleção de clientes inteira a cada abertura; com milhares de clientes, agregar no aceite
    Promise.all([
      getDocs(query(pedidosRef, where('criadoEm', '>=', Timestamp.fromDate(p.iniAnt)), where('criadoEm', '<', Timestamp.fromDate(p.fim)))),
      getDocs(collection(lojaRef, 'clientes')),
    ]).then(([ps, cs]) => {
      if (!vivo) return;
      const todos = ps.docs.map(lerPedido);
      const clientes = Object.fromEntries(cs.docs.map(d => [d.id, { ...d.data(), primeiro: data(d.data().primeiro) }]));
      const doPeriodo = todos.filter(x => x.criadoEm! >= p.ini && x.criadoEm! < p.fim).sort((x, y) => +x.criadoEm! - +y.criadoEm!);
      setRes({ a: calcular(todos, p, clientes), b: calcular(todos, { ini: p.iniAnt, fim: p.fimAnt }, clientes), doPeriodo });
    }).catch(e => { console.error(e); if (vivo) setRes('erro'); });
    return () => { vivo = false; };
  }, [per, de, ate, livreInvalido]);

  const escolher = (p: Per) => {
    if (p === 'livre' && !ate) { setAte(hoje()); setDe(hoje(new Date(Date.now() - 6 * 864e5))); } // abre nos últimos 7 dias
    setPer(p);
  };
  const planilha = () => {
    if (typeof res !== 'object' || !res.doPeriodo.length) return toast.error('Nenhum pedido no período');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv(res.doPeriodo)], { type: 'text/csv;charset=utf-8' }));
    a.download = per === 'livre' ? `pedidos-${de}-a-${ate}.csv` : `pedidos-${per}-${hoje()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const cardapio = loja.cardapio as { nome: string; tipo?: string }[];
  const tipoDe = (nome: string) => cardapio.find(i => i.nome === nome)?.tipo;
  const tem = (t: string) => cardapio.some(i => i.tipo === t);
  const VerTodos = ({ qual, l }: { qual: 'bairros' | 'clientes'; l: Lista }) => l.length > 5
    ? <Button variant="link" className="px-0" data-lista={qual} onClick={() => { setBusca(''); setLista(qual); }}>Ver todos ({l.length})</Button> : null;

  let corpo: React.ReactNode;
  if (livreInvalido) corpo = <p className="text-muted-foreground">Escolhe a data do começo antes da data do fim.</p>;
  else if (res === 'carregando') corpo = <p className="text-muted-foreground">Carregando…</p>;
  else if (res === 'erro') corpo = <p className="text-muted-foreground">Não deu pra carregar. Confere a internet e toca no período de novo.</p>;
  else {
    const { a, b } = res, h = loja.horario, pico = Object.fromEntries(a.pico), faixas: string[] = [];
    for (let m = h.abre * 60; m < h.fecha * 60; m += 30) faixas.push(`${String(m / 60 | 0).padStart(2, '0')}:${m % 60 ? '30' : '00'}`);
    const vendidos = (t?: string) => (a.maisVendidos as Lista).filter(([n]) => tipoDe(n) === t);
    const kpi = (t: string, v: string, seta?: React.ReactNode) => (
      <div className="grid rounded-xl bg-card p-3"><small className="text-muted-foreground">{t}</small><strong className="text-xl">{v}</strong>{seta}</div>);
    corpo = <>
      <div data-testid="kpis" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpi('Faturamento (burgers)', brl(a.faturamento), <Seta a={a.faturamento} b={b.faturamento} />)}
        {kpi('Pedidos', String(a.pedidos), <Seta a={a.pedidos} b={b.pedidos} />)}
        {kpi('Ticket médio', brl(a.ticket), <Seta a={a.ticket} b={b.ticket} />)}
        {kpi('Entregas (repasse do motoboy)', brl(a.taxas))}
      </div>
      <p data-testid="nota" className="my-2 text-sm text-muted-foreground">Setas comparam com {per !== 'livre' ? `${ANTERIOR[per]}, até o mesmo horário`
        : `${diasLivre > 1 ? `os ${diasLivre} dias` : 'o dia'} logo antes${ate === hoje() ? ', até o mesmo horário' : ''}`}.{a.cancelados ? ` ${a.cancelados} cancelado(s) fora da conta.` : ''}</p>
      <div className="grid gap-2 md:grid-cols-2">
        <Bloco t="Burgers mais vendidos"><Barras lista={vendidos(undefined)} /></Bloco>
        <Bloco t="Bebidas mais vendidas"><Barras lista={vendidos('bebida')} /></Bloco>
        {tem('acompanhamento') && <Bloco t="Acompanhamentos vendidos"><Barras lista={vendidos('acompanhamento')} /></Bloco>}
        {tem('sobremesa') && <Bloco t="Sobremesas vendidas"><Barras lista={vendidos('sobremesa')} /></Bloco>}
        {tem('carne') && <Bloco t="Carne crua vendida"><Barras lista={vendidos('carne')} /></Bloco>}
        {tem('pao') && <Bloco t="Pães vendidos"><Barras lista={vendidos('pao')} /></Bloco>}
        <Bloco t="Bairros que mais pedem"><Barras lista={a.bairros.slice(0, 5)} /><VerTodos qual="bairros" l={a.bairros} /></Bloco>
        <Bloco t="Clientes"><p className="text-sm text-muted-foreground">{a.clientes} cliente(s) · {a.clientesNovos} novo(s) · {a.clientesVoltaram} voltaram</p>
          <Barras lista={a.topClientes.slice(0, 5)} /><VerTodos qual="clientes" l={a.topClientes} /></Bloco>
        <Bloco t="Formas de pagamento"><Barras lista={a.pagamentos} fmt={brl} /></Bloco>
        <Bloco t="Dia da semana mais forte"><Barras lista={(a.diasSemana as Lista).map(([d, v]) => [DIAS[+d], v])} fmt={brl} /></Bloco>
        <Bloco t="Horário de pico" largo><Barras lista={faixas.map(f => [f, pico[f] || 0])} /></Bloco>
      </div>
    </>;
  }

  const q = semAcento(busca.trim()), soDig = q.replace(/\D/g, '');
  const itens = lista && typeof res === 'object' ? (lista === 'bairros' ? res.a.bairros : res.a.topClientes as Lista)
    .filter(([k]: [string]) => !q || semAcento(k).includes(q) || (soDig && k.replace(/\D/g, '').includes(soDig))) : [];
  return (
    <section data-testid="numeros" className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap gap-2">
        {PERIODOS.map(([p, nome]) => <Button key={p} data-p={p} size="sm" variant={per === p ? 'default' : 'outline'} className="rounded-full" onClick={() => escolher(p)}>{nome}</Button>)}
      </div>
      {per === 'livre' && <div className="mb-3 flex items-center gap-2">
        <input type="date" aria-label="De" value={de} max={ate || hoje()} onChange={e => setDe(e.target.value)} className="rounded-md border bg-card px-2 py-1" />
        <span>até</span>
        <input type="date" aria-label="Até" value={ate} max={hoje()} onChange={e => setAte(e.target.value)} className="rounded-md border bg-card px-2 py-1" />
      </div>}
      {corpo}
      <Button variant="outline" className="mt-4" onClick={planilha}><Download />Baixar planilha</Button>
      <Dialog open={!!lista} onOpenChange={o => !o && setLista(null)}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>{lista && TITULOS[lista]}</DialogTitle><DialogDescription className="sr-only">Lista completa</DialogDescription></DialogHeader>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder={lista === 'clientes' ? 'Buscar por nome ou telefone…' : 'Buscar bairro…'}
            className="w-full rounded-md border bg-card px-3 py-2" />
          {itens.length ? itens.map(([k, v]: [string, number]) => {
            const [nome, fone] = k.split(' · ');
            return <div key={k} className="flex justify-between border-b py-2 text-sm"><span className="grid">{nome}{fone && <small className="text-muted-foreground">{fone}</small>}</span>
              <b>{v} {v > 1 ? 'pedidos' : 'pedido'}</b></div>;
          }) : <p className="text-sm text-muted-foreground">Nada encontrado</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

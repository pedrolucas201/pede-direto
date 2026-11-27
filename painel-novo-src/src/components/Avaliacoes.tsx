// Aba Avaliações: igual ao painel antigo (painel.js carregarAv/renderAv e "Mostrar no site"). Só o dono vê (a regra só deixa o admin ler)
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, orderBy, query, Timestamp, where, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { periodo } from '../../../numeros.js';
import { resumo, quando, TAGS_BOAS } from '../../../avaliacao.js';
import { db } from '@/lib/firebase';
import { lojaRef } from '@/lib/dados';
import { registrar, erro } from '@/lib/registro';
import type { Loja } from '@/lib/tipos';

const avRef = collection(lojaRef, 'avaliacoes');
const estrelas = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const virgula = (n: number) => n.toFixed(1).replace('.', ',');
const data = (t: unknown) => (t as Timestamp | null)?.toDate?.() ?? null;
const hora = (d: Date | null) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' }) : '';
const POR: Record<string, string> = { link: 'pelo WhatsApp', qr: 'pelo QR' };
type Av = { id: string; nome: string; notas: Record<string, number>; comentarios?: Record<string, string>; tags?: string[]; publicas?: string[]; vista?: boolean; criadoEm: Date };
type Convite = { id: string; nome: string; burgers: { nome: string }[]; entregueEm: Date | null; abertoEm: Date | null; abertoPor?: string };

// contador das não vistas na barra das abas, ao vivo
export function useNovasAv(ligado: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => ligado ? onSnapshot(query(avRef, where('vista', '==', false)), s => setN(s.size), console.error) : undefined, [ligado]);
  return n;
}

function Barras({ lista }: { lista: [string, number][] }) {
  return <>{lista.map(([k, v]) => (
    <div key={k} className="my-1.5 grid grid-cols-[110px_1fr_auto] items-center gap-2 text-sm">
      <span className="truncate">{k}</span><i className="h-3 min-w-0.5 rounded-md bg-primary" style={{ width: `${v / 5 * 100}%` }} /><b>{virgula(v)}</b>
    </div>))}</>;
}

export function Avaliacoes({ loja, onVerPedido }: { loja: Loja; onVerPedido: (id: string) => void }) {
  const [per, setPer] = useState('mes');
  const [lista, setLista] = useState<Av[] | 'carregando' | 'erro'>('carregando');
  const [convites, setConvites] = useState<Convite[]>([]);
  const [filtro, setFiltro] = useState('novas');

  useEffect(() => {
    let vivo = true;
    setLista('carregando');
    // ponytail: lê todas as avaliações do período a cada abertura; com milhares por mês, paginar
    const ini = Timestamp.fromDate(periodo(per).ini);
    Promise.all([
      getDocs(query(avRef, where('criadoEm', '>=', ini), orderBy('criadoEm', 'desc'))),
      getDocs(query(collection(lojaRef, 'convites'), where('entregueEm', '>=', ini), orderBy('entregueEm', 'desc'))),
    ]).then(([s, cs]) => {
      if (!vivo) return;
      const l = s.docs.map(d => ({ id: d.id, ...d.data(), criadoEm: data(d.data().criadoEm) ?? new Date() }) as Av);
      setConvites(cs.docs.map(d => ({ id: d.id, ...d.data(), entregueEm: data(d.data().entregueEm), abertoEm: data(d.data().abertoEm) }) as Convite));
      setLista(l);
      // as novas aparecem destacadas nesta abertura e já ficam marcadas como vistas
      const novas = l.filter(a => !a.vista);
      setFiltro(novas.length ? 'novas' : 'todas');
      if (novas.length) {
        const b = writeBatch(db);
        novas.forEach(a => b.update(doc(avRef, a.id), { vista: true }));
        b.commit().catch(console.error);
      }
    }).catch(e => { console.error(e); if (vivo) setLista('erro'); });
    return () => { vivo = false; };
  }, [per]);

  // "Mostrar no site": cria/apaga o depoimento público daquele burger junto com a marca na avaliação
  async function mostrar(a: Av, bid: string, liga: boolean) {
    const b = writeBatch(db), publicas = [...(a.publicas || []).filter(x => x !== bid), ...(liga ? [bid] : [])];
    const dep = doc(lojaRef, 'depoimentos', `${a.id}_${bid}`);
    b.update(doc(avRef, a.id), { publicas, reg: registrar(b, 'site', a.id, { burger: bid, mostrar: liga }) });
    if (liga) b.set(dep, { nome: a.nome, burger: bid, nota: a.notas[bid], comentario: a.comentarios![bid], criadoEm: Timestamp.fromDate(a.criadoEm) });
    else b.delete(dep);
    try {
      await b.commit();
      setLista(l => typeof l === 'object' ? l.map(x => x.id === a.id ? { ...x, publicas } : x) : l);
      toast(liga ? 'Vai aparecer no site ✅' : 'Saiu do site');
    } catch (err) { console.error(err); erro(`site ${a.id}`, err); toast.error('Não salvou, tenta de novo'); }
  }

  const periodos = (
    <div className="mb-3 flex flex-wrap gap-2">
      {[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês']].map(([p, nome]) =>
        <Button key={p} data-p={p} size="sm" variant={per === p ? 'default' : 'outline'} className="rounded-full" onClick={() => setPer(p)}>{nome}</Button>)}
    </div>
  );
  if (lista === 'carregando') return <section data-testid="avaliacoes">{periodos}<p className="text-muted-foreground">Carregando…</p></section>;
  if (lista === 'erro') return <section data-testid="avaliacoes">{periodos}<p className="text-muted-foreground">Não deu pra carregar. Confere a internet e toca no período de novo.</p></section>;

  const nomeDo = (id: string) => loja.cardapio.find(c => c.id === id)?.nome ?? id;
  const r = resumo(lista, loja.cardapio), dist = r.dist as Record<number, number>, maior = Math.max(1, ...Object.values(dist));
  // rastreio: convite criado → link aberto (WhatsApp ou QR) → avaliado. Ninguém abre nada = a loja não está enviando
  const avaliou = new Set(lista.map(a => a.id));
  const abertos = convites.filter(c => c.abertoEm || avaliou.has(c.id)).length, avaliados = convites.filter(c => avaliou.has(c.id)).length;
  const grupos: Record<string, Av[]> = { novas: lista.filter(a => !a.vista), todas: lista, site: lista.filter(a => a.publicas?.length) };
  const chip = (t: string, boa: boolean, k: string) => <span key={k} className={cn('rounded-full px-2 py-0.5 text-xs', boa ? 'bg-green-100 text-green-800' : 'bg-accent text-primary')}>{t}</span>;
  return (
    <section data-testid="avaliacoes">
      {periodos}
      {r.total > 0 && <>
        <div data-testid="av-resumo" className="mb-3 flex items-center gap-6 rounded-xl bg-card p-3">
          <div className="grid text-center"><strong className="text-3xl">{virgula(r.media)}</strong><span className="text-primary">{estrelas(Math.round(r.media))}</span>
            <small>{r.total} {r.total > 1 ? 'avaliações' : 'avaliação'}</small></div>
          <div className="grid flex-1 gap-1 text-sm">{[5, 4, 3, 2, 1].map(n => (
            <div key={n} className="grid grid-cols-[12px_1fr_auto] items-center gap-2">{n}<i className="h-2 rounded bg-primary" style={{ width: `${dist[n] / maior * 100}%` }} />{dist[n]}</div>))}</div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <details open className="rounded-xl bg-card p-3"><summary className="cursor-pointer font-semibold">Nota de cada burger</summary>
            <Barras lista={[...(r.porBurger as [string, number, number][])].sort((a, b) => b[1] - a[1]).map(([n, m, q]) => [`${n} (${q})`, m])} /></details>
          <details open className="rounded-xl bg-card p-3"><summary className="cursor-pointer font-semibold">O que mais falam</summary>
            <div className="flex flex-wrap gap-1">{r.tags.length ? (r.tags as [string, number, boolean][]).map(([t, n, boa]) => chip(`${t} · ${n}`, boa, t))
              : <p className="text-sm text-muted-foreground">Nenhuma etiqueta marcada</p>}</div></details>
        </div>
      </>}
      {convites.length > 0 && <details className="mt-2 rounded-xl bg-card p-3">
        <summary className="cursor-pointer font-semibold">Convites: {convites.length} · {abertos} {abertos === 1 ? 'aberto' : 'abertos'} · {avaliados} {avaliados === 1 ? 'avaliado' : 'avaliados'}</summary>
        <p className="text-sm text-muted-foreground">Se ninguém abre o link, o mais provável é que a mensagem não está saindo pelo WhatsApp.</p>
        {convites.map(c => <div key={c.id} className="flex justify-between gap-2 border-b py-2 text-sm">
          <span className="grid">{c.nome}<small className="text-muted-foreground">{c.entregueEm ? `${quando(c.entregueEm)} ${hora(c.entregueEm)} · ` : ''}{c.burgers.map(b => b.nome).join(' + ')}</small></span>
          <b>{avaliou.has(c.id) ? 'Avaliou' : c.abertoEm ? `Abriu ${POR[c.abertoPor ?? ''] ?? ''} ${hora(c.abertoEm)}` : 'Não abriu'}</b></div>)}
      </details>}
      <div className="my-3 flex gap-2" role="tablist">
        {[['novas', 'Novas'], ['todas', 'Todas'], ['site', 'No site']].map(([k, n]) =>
          <Button key={k} data-fav={k} size="sm" variant={k === filtro ? 'default' : 'outline'} className="rounded-full" onClick={() => setFiltro(k)}>{n} <b>{grupos[k].length}</b></Button>)}
      </div>
      {grupos[filtro].length ? grupos[filtro].map(a => (
        <article key={a.id} data-av={a.id} className={cn('mb-2 rounded-xl border bg-card p-3', !a.vista && 'border-primary')}>
          <div className="flex items-center gap-2"><b>{a.nome}</b><small className="text-muted-foreground">{quando(a.criadoEm)} {hora(a.criadoEm)}</small>
            <Button variant="link" className="ml-auto px-0" onClick={() => onVerPedido(a.id)}>Ver pedido</Button></div>
          {Object.entries(a.notas).map(([bid, n]) => {
            const txt = a.comentarios?.[bid];
            return <div key={bid} className="border-t py-2">
              <div className="flex justify-between"><span>{nomeDo(bid)}</span><span className="text-primary">{estrelas(n)}</span></div>
              {txt && <><p className="text-sm italic">"{txt}"</p>
                <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm">
                  <Switch data-pub={a.id} data-b={bid} checked={!!a.publicas?.includes(bid)} onCheckedChange={v => mostrar(a, bid, v)} />Mostrar no site</label></>}
            </div>;
          })}
          {!!a.tags?.length && <div className="flex flex-wrap gap-1">{a.tags.map(t => chip(t, TAGS_BOAS.includes(t), t))}</div>}
        </article>
      )) : <p className="text-muted-foreground">{lista.length ? 'Nada aqui' : 'Nenhuma avaliação no período'}</p>}
    </section>
  );
}

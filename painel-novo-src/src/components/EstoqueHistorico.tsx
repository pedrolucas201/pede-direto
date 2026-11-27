// Histórico do estoque (só o dono; a regra só deixa o admin ler o registro): quem, quando e o que mudou, com o que
// faltou ou sobrou na contagem em destaque. Filtro só por produto. Lê as últimas 300 linhas do registro com alvo 'estoque'
// (índice registro: alvo + em desc; enquanto o índice não fica pronto, mostra "preparando")
import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { quando } from '../../../avaliacao.js';
import { lojaRef } from '@/lib/dados';
import { cn } from '@/lib/utils';
import type { Estoque } from '@/lib/tipos';

type Linha = { id: string; em: Date | null; quem: string; acao: string; dados: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Item = { id: string; txt: string; tom?: 'falta' | 'sobra' };
const hora = (d: Date | null) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' }) : '';
const sinal = (n: number) => n > 0 ? `+${n}` : String(n);

// cada linha do registro vira um título e a lista do que mudou em cada produto
function ler(l: Linha, nome: (id: string) => string): { titulo: string; itens: Item[] } {
  const d = l.dados, qtd = (m: Record<string, number> = {}) => Object.entries(m).map(([id, n]) => ({ id, txt: `${nome(id)} ${sinal(n)}` }));
  switch (l.acao) {
    case 'entrada': return { titulo: 'Chegou mercadoria', itens: qtd(d.qtd) };
    case 'contagem': return { titulo: 'Contagem', itens: Object.entries(d.itens ?? {}).map(([id, x]: [string, any]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const dif = x.contado - x.antes;
      return { id, tom: dif < 0 ? 'falta' : dif > 0 ? 'sobra' : undefined,
        txt: `${nome(id)}: contou ${x.contado}, o sistema dizia ${x.antes}${dif ? ` · ${dif < 0 ? 'faltaram' : 'sobraram'} ${Math.abs(dif)}` : ' · certinho'}${x.ajuste ? ` · ${sinal(x.ajuste)} durante a contagem, ficou ${x.final}` : ''}` };
    }) };
    case 'baixa': return { titulo: `Pedido #${d.cod} aceito`, itens: qtd(d.qtd) };
    case 'devolveu': return { titulo: `Pedido #${d.cod} cancelado (voltou)`, itens: qtd(d.qtd) };
    case 'alterou': return { titulo: `Pedido #${d.cod} alterado`, itens: qtd(d.qtd) };
    case 'semEstoque': return { titulo: `Pedido #${d.cod} aceito sem baixa (o estoque não tinha carregado)`, itens: [] };
    case 'produto': return { titulo: d.tipo === 'novo' ? `Produto novo · ${d.produto} · começou com ${d.qtd}` : d.tipo === 'apagou'
      ? `Apagou ${d.produto} (tinha ${d.qtd})` : `Editou ${d.produto}`, itens: [{ id: d.id, txt: '' }] };
    default: return { titulo: l.acao, itens: [] };
  }
}

export function HistoricoDialog({ estoque, onFechar }: { estoque: Estoque; onFechar: () => void }) {
  const [linhas, setLinhas] = useState<Linha[] | 'carregando' | 'preparando' | 'erro'>('carregando');
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    getDocs(query(collection(lojaRef, 'registro'), where('alvo', '==', 'estoque'), orderBy('em', 'desc'), limit(300)))
      .then(s => setLinhas(s.docs.map(x => { const d = x.data(); return { id: x.id, em: (d.em as Timestamp | null)?.toDate?.() ?? null, quem: d.quem, acao: d.acao, dados: d.dados ?? {} }; })))
      .catch(e => { console.error(e); setLinhas(e?.code === 'failed-precondition' ? 'preparando' : 'erro'); });
  }, []);
  const nome = (id: string) => estoque.produtos[id]?.nome ?? id;
  const lidas = typeof linhas === 'object' ? linhas.map(l => ({ l, ...ler(l, nome) }))
    .filter(x => !filtro || x.itens.some(i => i.id === filtro)) : [];
  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent data-testid="historico" className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Histórico do estoque</DialogTitle>
          <DialogDescription>Quem, quando e o que faltou ou sobrou.</DialogDescription></DialogHeader>
        <select data-acao="filtro-produto" value={filtro} onChange={e => setFiltro(e.target.value)} className="w-full cursor-pointer rounded-md border bg-card px-3 py-2 text-sm">
          <option value="">Todos os produtos</option>
          {Object.entries(estoque.produtos).sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR')).map(([id, p]) => <option key={id} value={id}>{p.nome}</option>)}
        </select>
        {linhas === 'carregando' && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {linhas === 'preparando' && <p className="text-sm text-muted-foreground">Preparando o histórico, tenta de novo em alguns minutos.</p>}
        {linhas === 'erro' && <p className="text-sm text-muted-foreground">Não deu pra carregar. Confere a internet e abre de novo.</p>}
        {typeof linhas === 'object' && (lidas.length ? lidas.map(({ l, titulo, itens }) => (
          <div key={l.id} data-linha={l.acao} className="border-b py-2 text-sm">
            <div className="flex justify-between gap-2"><b>{titulo}</b>
              <small className="shrink-0 text-muted-foreground">{l.dados.nome || l.quem} · {l.em ? `${quando(l.em)} ${hora(l.em)}` : ''}</small></div>
            {itens.filter(i => i.txt && (!filtro || i.id === filtro)).map(i =>
              <p key={i.id} className={cn(i.tom === 'falta' && 'font-semibold text-primary', i.tom === 'sobra' && 'font-semibold text-green-700')}>{i.txt}</p>)}
          </div>)) : <p className="text-sm text-muted-foreground">Nada ainda.</p>)}
      </DialogContent>
    </Dialog>
  );
}

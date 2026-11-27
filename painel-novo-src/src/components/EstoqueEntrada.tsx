// "Chegou mercadoria" (dono ou funcionário): um campo por produto, em unidade ou no pacote (o aparelho lembra a última
// escolha). Antes de somar, um resumo; número fora do normal (> 3× a maior entrada) fica amarelo e pede confirmação.
// Grava num lote: increment(qtd), a maior entrada e a linha 'entrada' no registro. Sem internet, fica na fila.
import { useMemo, useRef, useState } from 'react';
import { increment, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { emUn, foraDoNormal } from '../../../estoque.js';
import { auth, db } from '@/lib/firebase';
import { estoqueRef } from '@/lib/dados';
import { registrar, erro } from '@/lib/registro';
import { cn } from '@/lib/utils';
import type { Estoque } from '@/lib/tipos';
import { CATEGORIAS } from './EstoqueProduto';

// preferência de tela (un ou pacote) por produto; sem storage (aba anônima, bloqueado) só não lembra
const lembra = { get: (id: string) => { try { return localStorage.getItem(`estoque:pacote:${id}`) === '1'; } catch { return false; } },
  set: (id: string, v: boolean) => { try { localStorage.setItem(`estoque:pacote:${id}`, v ? '1' : '0'); } catch { /* sem storage */ } } };
const lerNum = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() && n > 0 ? n : 0; };

export function EntradaDialog({ estoque, onFechar }: { estoque: Estoque; onFechar: () => void }) {
  const produtos = useMemo(() => Object.entries(estoque.produtos)
    .sort(([, a], [, b]) => CATEGORIAS.indexOf(a.cat || 'Outros') - CATEGORIAS.indexOf(b.cat || 'Outros') || a.nome.localeCompare(b.nome, 'pt-BR')), [estoque.produtos]);
  const [valor, setValor] = useState<Record<string, string>>({});
  const [pacote, setPacote] = useState<Record<string, boolean>>(() => Object.fromEntries(produtos.map(([id]) => [id, lembra.get(id)])));
  const [etapa, setEtapa] = useState<'digitar' | 'resumo' | 'descartar'>('digitar');
  const [confirmado, setConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  const un = (id: string) => emUn(lerNum(valor[id] ?? ''), estoque.produtos[id], pacote[id]);
  const itens = produtos.filter(([id]) => un(id) > 0);
  const estranhos = itens.filter(([id]) => foraDoNormal(un(id), estoque.maior?.[id]));

  const fechar = () => itens.length && etapa !== 'descartar' ? setEtapa('descartar') : onFechar(); // pede confirmação antes de jogar fora o que digitou
  async function somar() {
    setSalvando(true);
    const b = writeBatch(db), qtd = Object.fromEntries(itens.map(([id]) => [id, un(id)]));
    b.update(estoqueRef, {
      ...Object.fromEntries(itens.flatMap(([id]) => [[`qtd.${id}`, increment(qtd[id])],
        ...(qtd[id] > (estoque.maior?.[id] ?? 0) ? [[`maior.${id}`, qtd[id]]] : [])])),
      reg: registrar(b, 'entrada', 'estoque', { qtd, nome: auth.currentUser?.displayName || '' }),
    });
    // lote: sem internet fica na fila e sobe quando voltar (increment não perde nada)
    b.commit().catch(e => { console.error(e); erro('entrada', e); toast.error('A entrada não salvou, confere o estoque'); });
    toast(`Entrada de ${itens.length} ${itens.length > 1 ? 'produtos' : 'produto'} somada`);
    onFechar();
  }

  return (
    <Dialog open onOpenChange={o => !o && fechar()}>
      <DialogContent data-testid="entrada" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && itens.length && etapa === 'digitar') { e.preventDefault(); setEtapa('resumo'); } }}>
        <DialogHeader><DialogTitle>{etapa === 'resumo' ? 'Confere antes de somar' : 'Chegou mercadoria'}</DialogTitle>
          <DialogDescription>{etapa === 'resumo' ? 'Isto vai ser somado ao que tem.' : 'Preenche só o que chegou. Pão conta em pão inteiro (parte de cima + de baixo).'}</DialogDescription></DialogHeader>

        {etapa === 'descartar' && <>
          <p className="text-sm">Descartar o que você digitou? Nada foi somado.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEtapa('digitar')}>Voltar</Button>
            <Button data-acao="descartar" variant="destructive" onClick={onFechar}>Descartar</Button>
          </DialogFooter></>}

        {etapa === 'digitar' && <>
          {produtos.map(([id, p], i) => (
            <div key={id} data-entrada={id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b py-1.5 text-sm">
              <span className="grid">{p.nome}<small className="text-muted-foreground">tem {estoque.qtd?.[id] ?? 0} {p.un}</small></span>
              <div className="flex items-center gap-1">
                <input ref={el => { campos.current[i] = el; }} data-qtd={id} value={valor[id] ?? ''} inputMode="decimal" placeholder="0"
                  onChange={e => setValor({ ...valor, [id]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); campos.current[i + 1]?.focus(); } }}
                  className="w-16 rounded-md border bg-card px-2 py-1 text-right" />
                {p.pacote ? <Button type="button" size="sm" variant="outline" data-pacote={id} className="w-20"
                  onClick={() => { const v = !pacote[id]; setPacote({ ...pacote, [id]: v }); lembra.set(id, v); }}>
                  {pacote[id] ? `${p.pacoteNome} ${p.pacote}` : p.un}</Button> : <span className="w-20 text-muted-foreground">{p.un}</span>}
              </div>
              <span className="w-20 text-right tabular-nums text-muted-foreground">{un(id) > 0 && `= +${un(id)} ${p.un}`}</span>
            </div>))}
          <DialogFooter className="gap-2">
            <span className="mr-auto hidden self-center text-xs text-muted-foreground sm:block">Enter: próximo · Ctrl+Enter: resumo</span>
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button data-acao="resumo-entrada" disabled={!itens.length} onClick={() => setEtapa('resumo')}>Conferir ({itens.length})</Button>
          </DialogFooter></>}

        {etapa === 'resumo' && <>
          {itens.map(([id, p]) => (
            <div key={id} className={cn('flex justify-between rounded-md px-2 py-1.5 text-sm', estranhos.some(([x]) => x === id) && 'bg-yellow-100 text-yellow-900')}>
              <span>{p.nome}</span><b className="tabular-nums">+{un(id)} {p.un}</b></div>))}
          {estranhos.length > 0 && <label className="flex items-start gap-2 rounded-md bg-yellow-100 p-2 text-sm text-yellow-900">
            <input type="checkbox" data-acao="confirma-estranho" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} className="mt-1" />
            Em amarelo: bem mais que o normal. Confere se não sobrou um zero (480 em vez de 48). Está certo assim.</label>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEtapa('digitar')}>Voltar</Button>
            <Button data-acao="somar" disabled={salvando || (estranhos.length > 0 && !confirmado)} onClick={somar}>Somar ao estoque</Button>
          </DialogFooter></>}
      </DialogContent>
    </Dialog>
  );
}

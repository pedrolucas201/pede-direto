// "Contar estoque" (dono ou funcionário), às cegas: o campo vem vazio, sem o número do sistema; vazio = não contei
// (não vira zero), então dá pra contar só a geladeira. Salva numa transação: o que mudou entre abrir a tela e salvar
// (um pedido aceito, outra entrada) entra como ajuste: final = contado + (atual − antes). Sem internet, não salva.
import { useMemo, useRef, useState } from 'react';
import { runTransaction } from 'firebase/firestore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { auth, db } from '@/lib/firebase';
import { estoqueRef } from '@/lib/dados';
import { registrar, erro } from '@/lib/registro';
import { lerQtd } from '../../../estoque.js';
import type { Estoque } from '@/lib/tipos';
import { CATEGORIAS } from './EstoqueProduto';

const lerNum = (s: string) => { const n = lerQtd(s, 0); return typeof n === 'number' ? n : null; }; // inteiro ≥ 0; vazio = não contei

export function ContagemDialog({ estoque, onFechar }: { estoque: Estoque; onFechar: () => void }) {
  const produtos = useMemo(() => Object.entries(estoque.produtos)
    .sort(([, a], [, b]) => CATEGORIAS.indexOf(a.cat || 'Outros') - CATEGORIAS.indexOf(b.cat || 'Outros') || a.nome.localeCompare(b.nome, 'pt-BR')), [estoque.produtos]);
  const [antes] = useState(() => ({ ...estoque.qtd })); // o sistema na hora de abrir; base do ajuste
  const [valor, setValor] = useState<Record<string, string>>({});
  const [descartar, setDescartar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const campos = useRef<(HTMLInputElement | null)[]>([]);
  const contados = produtos.filter(([id]) => lerNum(valor[id] ?? '') !== null);
  const invalidos = produtos.filter(([id]) => lerQtd(valor[id] ?? '', 0) === 'erro');

  const fechar = () => contados.length && !descartar ? setDescartar(true) : onFechar();
  async function salvar() {
    if (!navigator.onLine) return toast.error('Sem internet, a contagem não foi salva');
    setSalvando(true);
    try {
      await runTransaction(db, async t => {
        const atual = (await t.get(estoqueRef)).data() as Estoque | undefined;
        const itens: Record<string, { antes: number; contado: number; ajuste: number; final: number }> = {};
        for (const [id] of contados) {
          if (!atual?.produtos[id]) continue; // apagado enquanto contava
          const a = antes[id] ?? 0, contado = lerNum(valor[id])!, ajuste = (atual.qtd?.[id] ?? 0) - a;
          itens[id] = { antes: a, contado, ajuste, final: contado + ajuste };
        }
        t.update(estoqueRef, { ...Object.fromEntries(Object.entries(itens).map(([id, x]) => [`qtd.${id}`, x.final])),
          reg: registrar(t, 'contagem', 'estoque', { itens, nome: auth.currentUser?.displayName || '' }) });
      });
      toast(`Contagem de ${contados.length} ${contados.length > 1 ? 'produtos' : 'produto'} salva`);
      onFechar();
    } catch (e) {
      console.error(e); erro('contagem', e);
      toast.error(navigator.onLine ? 'A contagem não salvou, tenta de novo' : 'Sem internet, a contagem não foi salva');
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && fechar()}>
      <DialogContent data-testid="contagem" className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>Contar estoque</DialogTitle>
          <DialogDescription>Digita quanto tem de verdade. Deixa vazio o que não contou: não vira zero.</DialogDescription></DialogHeader>
        {descartar ? <>
          <p className="text-sm">Descartar a contagem? Nada foi salvo.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDescartar(false)}>Voltar</Button>
            <Button data-acao="descartar" variant="destructive" onClick={onFechar}>Descartar</Button>
          </DialogFooter></> : <>
          {produtos.map(([id, p], i) => (
            <label key={id} data-contagem={id} className="flex items-center justify-between gap-2 border-b py-1.5 text-sm">
              <span>{p.nome}</span>
              <span className="flex items-center gap-1">
                <input ref={el => { campos.current[i] = el; }} data-contado={id} value={valor[id] ?? ''} inputMode="decimal"
                  onChange={e => setValor({ ...valor, [id]: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); campos.current[i + 1]?.focus(); } }}
                  className="w-20 rounded-md border bg-card px-2 py-1 text-right" />
                <span className="w-10 text-muted-foreground">{p.un}</span>
              </span>
            </label>))}
          {invalidos.length > 0 && <p data-testid="invalido" className="text-sm text-primary">Só número inteiro, sem sinal nem vírgula: confere {invalidos.map(([, p]) => p.nome).join(', ')}.</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button data-acao="salvar-contagem" disabled={!contados.length || invalidos.length > 0 || salvando} onClick={salvar}>Salvar contagem ({contados.length})</Button>
          </DialogFooter></>}
      </DialogContent>
    </Dialog>
  );
}

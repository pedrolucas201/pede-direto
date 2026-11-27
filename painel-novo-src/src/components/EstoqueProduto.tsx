// Novo/editar produto do estoque (só o dono). "Dá baixa sozinho" liga o produto a uma chave do consumo (estoque.js):
// 'pao', uma camada/adicional de burger ou o id de um item vendido inteiro. Produto sem ligação só muda por entrada e contagem.
import { useState } from 'react';
import { collection, deleteField, doc, getDoc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { auth, db } from '@/lib/firebase';
import { estoqueRef, lojaRef } from '@/lib/dados';
import { registrar, erro } from '@/lib/registro';
import { cn } from '@/lib/utils';
import type { Estoque, Loja, Produto } from '@/lib/tipos';

export const CATEGORIAS = ['Burgers', 'Bebidas', 'Sobremesas', 'Outros'];
const sem = (s: string) => s.replace(/\s*\(.*\)\s*$/, '');
const inicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// o que o site vende e o consumo conhece, com nome legível
export function ligacoes(loja: Loja): [string, string][] {
  type It = { id: string; nome: string; camadas?: string[]; estoque?: Record<string, number> };
  const cardapio = loja.cardapio as It[], adic = new Map((loja.adicionais ?? []).map(a => [a.id, sem(a.nome)]));
  const camadas = [...new Set([...cardapio.flatMap(i => i.camadas ?? []), ...adic.keys()])];
  return [['pao', 'Pão (1 por burger)'],
    ...camadas.map(id => [id, `${adic.get(id) ?? inicial(id)} (1 por burger que leva)`] as [string, string]),
    ...cardapio.filter(i => !i.camadas && !i.estoque).map(i => [i.id, `${i.nome} (1 por unidade vendida)`] as [string, string])];
}
const quem = () => auth.currentUser?.displayName || '';
const campo = 'w-full rounded-md border bg-card px-3 py-2';

export function ProdutoDialog({ loja, estoque, id, onFechar }: { loja: Loja; estoque: Estoque | null; id: string | 'novo'; onFechar: () => void }) {
  const p: Partial<Produto> = id === 'novo' ? { cat: 'Outros', un: 'un' } : estoque!.produtos[id];
  const [f, setF] = useState({ nome: p.nome ?? '', cat: p.cat ?? 'Outros', un: p.un ?? 'un', pacote: p.pacote ? String(p.pacote) : '',
    pacoteNome: p.pacoteNome ?? '', tem: '', min: p.min != null ? String(p.min) : '', liga: p.liga ?? '' });
  const [salvando, setSalvando] = useState(false);
  const [confirmaApagar, setConfirmaApagar] = useState(false);
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'));
  const invalido = !f.nome.trim() || !f.un.trim() || [f.pacote, f.min, f.tem].some(s => { const n = num(s); return n !== null && !(n >= 0); })
    || (num(f.pacote) !== null && !f.pacoteNome.trim());
  const opcoes = ligacoes(loja);

  async function salvar() {
    setSalvando(true);
    const novo = id === 'novo', pid = novo ? doc(collection(lojaRef, 'x')).id : id; // id aleatório: nunca reaproveita um qtd órfão
    const prod: Produto = { nome: f.nome.trim(), cat: f.cat, un: f.un.trim(), liga: f.liga || null,
      ...(num(f.min) !== null ? { min: num(f.min)! } : {}), ...(num(f.pacote) ? { pacote: num(f.pacote)!, pacoteNome: f.pacoteNome.trim() } : {}) };
    const tem = num(f.tem) ?? 0, b = writeBatch(db);
    const reg = registrar(b, 'produto', 'estoque', { id: pid, produto: prod.nome, tipo: novo ? 'novo' : 'editou', ...(novo ? { qtd: tem } : {}), nome: quem() });
    try {
      // 1º produto: cria o doc (a regra só deixa o dono criar, e só com estes campos)
      if (!(await getDoc(estoqueRef)).exists()) b.set(estoqueRef, { produtos: { [pid]: prod }, qtd: { [pid]: tem }, maior: {}, reg });
      else b.update(estoqueRef, { [`produtos.${pid}`]: prod, ...(novo ? { [`qtd.${pid}`]: tem } : {}), reg });
      await b.commit();
      toast(novo ? `${prod.nome} cadastrado` : `${prod.nome} salvo`);
      onFechar();
    } catch (e) { console.error(e); erro('produto', e); toast.error('Não salvou, tenta de novo'); setSalvando(false); }
  }
  async function apagar() {
    if (!confirmaApagar) return setConfirmaApagar(true); // 1º toque pede confirmação na própria tela
    const b = writeBatch(db);
    b.update(estoqueRef, { [`produtos.${id}`]: deleteField(), [`qtd.${id}`]: deleteField(), [`maior.${id}`]: deleteField(),
      reg: registrar(b, 'produto', 'estoque', { id, produto: p.nome, tipo: 'apagou', qtd: estoque!.qtd?.[id] ?? 0, nome: quem() }) });
    try { await b.commit(); toast(`${p.nome} apagado`); onFechar(); }
    catch (e) { console.error(e); erro('produto', e); toast.error('Não apagou, tenta de novo'); }
  }

  return (
    <Dialog open onOpenChange={o => !o && onFechar()}>
      <DialogContent data-testid="produto" className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{id === 'novo' ? 'Novo produto' : p.nome}</DialogTitle>
          <DialogDescription>"Dá baixa sozinho" liga o produto ao que o site vende. "Vem em" é o fardo ou a caixa da entrada.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-sm">Nome<input data-f="nome" value={f.nome} onChange={muda('nome')} className={campo} /></label>
        <div className="grid gap-1 text-sm">Categoria<div className="flex flex-wrap gap-1">{CATEGORIAS.map(c =>
          <Button key={c} type="button" size="sm" variant={f.cat === c ? 'default' : 'outline'} className="rounded-full" onClick={() => setF({ ...f, cat: c })}>{c}</Button>)}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm">Conta em<input data-f="un" value={f.un} onChange={muda('un')} placeholder="un, fatia, kg" className={campo} /></label>
          <label className="grid gap-1 text-sm">Avisar abaixo de<input data-f="min" value={f.min} onChange={muda('min')} inputMode="decimal" className={campo} /></label>
          <label className="grid gap-1 text-sm">Vem em (opcional)<input data-f="pacoteNome" value={f.pacoteNome} onChange={muda('pacoteNome')} placeholder="fardo, caixa" className={campo} /></label>
          <label className="grid gap-1 text-sm">com quantos<input data-f="pacote" value={f.pacote} onChange={muda('pacote')} inputMode="decimal" className={campo} /></label>
          {id === 'novo' && <label className="grid gap-1 text-sm">Tem agora<input data-f="tem" value={f.tem} onChange={muda('tem')} inputMode="decimal" placeholder="0" className={campo} /></label>}
        </div>
        <label className="grid gap-1 text-sm">Dá baixa sozinho quando vende?
          <select data-f="liga" value={f.liga} onChange={muda('liga')} className={cn(campo, 'cursor-pointer')}>
            <option value="">Não, só conto na mão</option>
            {opcoes.map(([k, n]) => <option key={k} value={k}>Sim: {n}</option>)}
          </select></label>
        {id !== 'novo' && <p className="text-xs text-muted-foreground">Pra mudar o que tem, use "Contar estoque".</p>}
        <DialogFooter className="gap-2">
          {id !== 'novo' && <Button type="button" data-acao="apagar-produto" variant={confirmaApagar ? 'destructive' : 'ghost'} className={cn('mr-auto', !confirmaApagar && 'text-primary')} onClick={apagar}>
            {confirmaApagar ? `Confirmar: apagar (tem ${estoque!.qtd?.[id] ?? 0} ${p.un})` : 'Apagar'}</Button>}
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="button" data-acao="salvar-produto" disabled={invalido || salvando} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

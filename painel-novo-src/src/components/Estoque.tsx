// Aba Estoque (mockup estoque-v2): lista por categoria com o que está acabando. Dono cadastra e edita produto;
// a equipe lança entrada e contagem (botões presos embaixo)
import { useState } from 'react';
import { AlertTriangle, PackagePlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Papel } from '@/lib/acesso';
import type { Estoque as EstoqueT, Loja } from '@/lib/tipos';
import { CATEGORIAS, ProdutoDialog } from './EstoqueProduto';
import { EntradaDialog } from './EstoqueEntrada';

const acabando = (q: number, min?: number) => min != null && q < min;

export function Estoque({ estoque, loja, papel }: { estoque: EstoqueT | null | undefined; loja: Loja; papel: Papel }) {
  const [produto, setProduto] = useState<string | null>(null); // 'novo' ou o id em edição
  const [soAcabando, setSoAcabando] = useState(false);
  const [tela, setTela] = useState<null | 'entrada'>(null);
  const dono = papel === 'dono';
  if (estoque === undefined) return <p className="text-muted-foreground">Carregando…</p>;
  const produtos = Object.entries(estoque?.produtos ?? {});
  const qtd = (id: string) => estoque?.qtd?.[id] ?? 0;
  // some sozinho se o produto deixou de existir (acabou de ser apagado, aqui ou em outro aparelho)
  const dialogo = produto && (produto === 'novo' || estoque?.produtos[produto]) && <ProdutoDialog loja={loja} estoque={estoque} id={produto} onFechar={() => setProduto(null)} />;
  if (!produtos.length) return (
    <section data-testid="estoque" className="mx-auto max-w-2xl py-8 text-center text-muted-foreground">
      {dono ? <>
        <p>Nenhum produto cadastrado ainda.</p>
        <p className="mb-4 text-sm">Pão, carne, queijos, bebidas, sobremesas… O que vende no site dá baixa sozinho a cada pedido aceito.</p>
        <Button data-acao="novo-produto" onClick={() => setProduto('novo')}><Plus />Cadastrar o primeiro produto</Button>
      </> : <p>O dono ainda não cadastrou os produtos.</p>}
      {dialogo}
    </section>
  );
  const baixos = produtos.filter(([id, p]) => acabando(qtd(id), p.min));
  const lista = soAcabando ? baixos : produtos;
  const cats = [...new Set([...CATEGORIAS, ...lista.map(([, p]) => p.cat || 'Outros')])]
    .map(c => [c, lista.filter(([, p]) => (p.cat || 'Outros') === c).sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))] as const)
    .filter(([, l]) => l.length);
  return (
    <section data-testid="estoque" className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {baixos.length > 0 && <button type="button" data-acao="filtro-acabando" onClick={() => setSoAcabando(!soAcabando)}
          className={cn('flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-primary', soAcabando && 'ring-2 ring-primary')}>
          <AlertTriangle className="size-4" />{baixos.length} {baixos.length > 1 ? 'produtos acabando' : 'produto acabando'}{soAcabando && ' · ver todos'}</button>}
        {dono && <Button data-acao="novo-produto" variant="outline" size="sm" className="ml-auto" onClick={() => setProduto('novo')}><Plus />Novo produto</Button>}
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="py-2 font-medium">Produto</th><th className="text-right font-medium">Tem</th>
          <th className="text-right font-medium">Avisar abaixo de</th><th className="pl-4 font-medium">Baixa sozinho</th></tr></thead>
        <tbody>
          {cats.map(([c, l]) => [
            <tr key={c}><td colSpan={4} className="pt-4 pb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">{c}</td></tr>,
            ...l.map(([id, p]) => (
              <tr key={id} data-produto={id} onClick={dono ? () => setProduto(id) : undefined} className={cn('border-b', dono && 'cursor-pointer hover:bg-accent/50')}>
                <td className="py-2">{p.nome}</td>
                <td className={cn('text-right tabular-nums', qtd(id) < 0 ? 'font-semibold text-destructive' : acabando(qtd(id), p.min) && 'font-semibold text-primary')}>{qtd(id)} {p.un}</td>
                <td className="text-right tabular-nums text-muted-foreground">{p.min ?? '—'}</td>
                <td className="pl-4 text-muted-foreground">{p.liga ? 'Sim' : 'Não'}</td>
              </tr>)),
          ])}
        </tbody>
      </table>
      {/* presos embaixo, acima da barra de abas do celular */}
      <div className="sticky bottom-20 mt-4 flex gap-2 bg-background py-2 lg:bottom-0">
        <Button data-acao="entrada" className="flex-1" onClick={() => setTela('entrada')}><PackagePlus />Chegou mercadoria</Button>
      </div>
      {dialogo}
      {tela === 'entrada' && estoque && <EntradaDialog estoque={estoque} onFechar={() => setTela(null)} />}
    </section>
  );
}

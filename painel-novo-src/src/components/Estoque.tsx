// Aba Estoque, só leitura nesta versão: lista o que tem e o que está acabando (mockup estoque-v2, tabela do notebook).
// Cadastro, entrada e contagem vêm depois: hoje a aba não grava nada em estoque/* (sem estoque/atual em produção, a baixa fica desligada)
import { AlertTriangle } from 'lucide-react';
import type { Estoque as EstoqueT } from '@/lib/tipos';

const ORDEM = ['Burgers', 'Bebidas', 'Sobremesas', 'Outros'];
const acabando = (q: number, min?: number) => min != null && q < min;

export function Estoque({ estoque }: { estoque: EstoqueT | null | undefined }) {
  if (estoque === undefined) return <p className="text-muted-foreground">Carregando…</p>;
  const produtos = Object.entries(estoque?.produtos ?? {});
  if (!produtos.length) return (
    <section data-testid="estoque" className="mx-auto max-w-xl py-8 text-center text-muted-foreground">
      <p>Nenhum produto cadastrado ainda.</p>
      <p className="text-sm">O cadastro do estoque chega numa próxima versão do painel.</p>
    </section>
  );
  const qtd = (id: string) => estoque?.qtd?.[id] ?? 0;
  const cats = [...new Set([...ORDEM, ...produtos.map(([, p]) => p.cat || 'Outros')])]
    .map(c => [c, produtos.filter(([, p]) => (p.cat || 'Outros') === c).sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))] as const)
    .filter(([, l]) => l.length);
  const baixos = produtos.filter(([id, p]) => acabando(qtd(id), p.min)).length;
  return (
    <section data-testid="estoque" className="mx-auto max-w-3xl">
      {baixos > 0 && <p className="mb-3 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-primary">
        <AlertTriangle className="size-4" />{baixos} {baixos > 1 ? 'produtos acabando' : 'produto acabando'}</p>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">
          <th className="py-2 font-medium">Produto</th><th className="text-right font-medium">Tem</th>
          <th className="text-right font-medium">Avisar abaixo de</th><th className="pl-4 font-medium">Baixa sozinho</th></tr></thead>
        <tbody>
          {cats.map(([c, l]) => [
            <tr key={c}><td colSpan={4} className="pt-4 pb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">{c}</td></tr>,
            ...l.map(([id, p]) => (
              <tr key={id} data-produto={id} className="border-b">
                <td className="py-2">{p.nome}</td>
                <td className={`text-right tabular-nums ${acabando(qtd(id), p.min) ? 'font-semibold text-primary' : ''}`}>{qtd(id)} {p.un}</td>
                <td className="text-right tabular-nums text-muted-foreground">{p.min ?? '—'}</td>
                <td className="pl-4 text-muted-foreground">{p.liga ? 'Sim' : 'Não'}</td>
              </tr>)),
          ])}
        </tbody>
      </table>
    </section>
  );
}

import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { ReceiptText, Package, ChartColumn, Star, Store, LogIn, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { useAcesso, entrar, type Papel } from '@/lib/acesso';
import { cn } from '@/lib/utils';

type Aba = { id: string; nome: string; icone: LucideIcon; so?: Papel };
const ABAS: Aba[] = [
  { id: 'pedidos', nome: 'Pedidos', icone: ReceiptText },
  { id: 'estoque', nome: 'Estoque', icone: Package },
  { id: 'numeros', nome: 'Números', icone: ChartColumn, so: 'dono' },
  { id: 'avaliacoes', nome: 'Avaliações', icone: Star, so: 'dono' },
  { id: 'loja', nome: 'Loja', icone: Store },
];

function Topo({ logado }: { logado: boolean }) {
  return (
    <header className="flex h-14 items-center gap-3 bg-card px-4">
      <img src="/logo.png" alt="" className="size-8" />
      <h1 className="font-marca text-2xl tracking-wide">PAINEL</h1>
      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">novo</span>
      {logado && <Button variant="link" className="ml-auto" onClick={() => signOut(auth)}>Sair</Button>}
    </header>
  );
}

export function App() {
  const acesso = useAcesso();
  const [aba, setAba] = useState('pedidos');

  if (acesso.estado !== 'dentro') return (
    <>
      <Topo logado={acesso.estado === 'negado'} />
      <main className="grid justify-items-center gap-4 px-4 py-16 text-center">
        {acesso.estado === 'carregando' ? <p className="text-muted-foreground">Carregando…</p> : <>
          <p data-testid="login-msg">{acesso.estado === 'negado'
            ? acesso.erro ? `Não deu pra conferir o acesso de ${acesso.email}. Erro: ${acesso.erro}` : `${acesso.email} não tem acesso a este painel.`
            : 'Entre com a conta Google da loja.'}</p>
          <Button size="lg" onClick={() => entrar().catch(() => {})}><LogIn />Entrar com Google</Button>
        </>}
      </main>
    </>
  );

  const abas = ABAS.filter(a => !a.so || a.so === acesso.papel);
  const atual = abas.find(a => a.id === aba) ?? abas[0];
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <Topo logado />
      {/* celular: abas embaixo; computador: em cima */}
      <nav data-testid="abas" className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-card lg:static lg:justify-center lg:gap-2 lg:border-t-0 lg:border-b lg:py-2">
        {abas.map(a => (
          <button key={a.id} data-aba={a.id} onClick={() => setAba(a.id)}
            className={cn('flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground lg:flex-none lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:text-sm',
              a.id === atual.id && 'font-semibold text-primary lg:bg-accent')}>
            <a.icone className="size-5" />{a.nome}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-5xl p-4">
        <h2 className="mb-2 text-lg font-semibold">{atual.nome}</h2>
        <p className="text-muted-foreground">Em construção. Por enquanto use o <a className="text-primary underline" href="/painel/">painel atual</a>.</p>
      </main>
    </div>
  );
}

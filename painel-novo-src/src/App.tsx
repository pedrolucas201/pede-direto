import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { ReceiptText, Package, ChartColumn, Star, Store, LogIn, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { Pedidos } from '@/components/Pedidos';
import { Loja } from '@/components/Loja';
import { Estoque } from '@/components/Estoque';
import { Numeros } from '@/components/Numeros';
import { Avaliacoes, useNovasAv } from '@/components/Avaliacoes';
import { auth } from '@/lib/firebase';
import { useAcesso, entrar, type Papel } from '@/lib/acesso';
import { useLoja, useEstoque } from '@/lib/dados';
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
  // trocou de dono pra funcionário (ou ao contrário): monta tudo de novo
  return <Painel key={`${acesso.user.uid}-${acesso.papel}`} papel={acesso.papel} />;
}

function Painel({ papel }: { papel: Papel }) {
  const [aba, setAba] = useState('pedidos');
  const [novos, setNovos] = useState(0);
  const { loja, offline } = useLoja();
  const estoque = useEstoque();
  const novasAv = useNovasAv(papel === 'dono');
  const verPedido = (id: string) => { setAba('pedidos'); location.hash = id; };
  const abas = ABAS.filter(a => !a.so || a.so === papel);
  const atual = abas.find(a => a.id === aba) ?? abas[0];
  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <Topo logado />
      {offline && <div className="bg-accent px-4 py-2 text-center text-sm text-primary">Sem conexão · as mudanças sincronizam quando a internet voltar</div>}
      {/* celular: abas embaixo; computador: em cima */}
      <nav data-testid="abas" className="fixed inset-x-0 bottom-0 z-10 flex border-t bg-card lg:static lg:justify-center lg:gap-2 lg:border-t-0 lg:border-b lg:py-2">
        {abas.map(a => (
          <button key={a.id} data-aba={a.id} onClick={() => setAba(a.id)}
            className={cn('flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground lg:flex-none lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:text-sm',
              a.id === atual.id && 'font-semibold text-primary lg:bg-accent')}>
            <span className="relative"><a.icone className="size-5" />
              {a.id === 'pedidos' && novos > 0 && <span data-testid="contador-novos" className="absolute -top-1.5 left-3 min-w-[18px] rounded-full bg-primary px-1 text-[11px] leading-[18px] font-semibold text-primary-foreground">{novos}</span>}
              {a.id === 'avaliacoes' && novasAv > 0 && <span data-testid="contador-av" className="absolute -top-1.5 left-3 min-w-[18px] rounded-full bg-primary px-1 text-[11px] leading-[18px] font-semibold text-primary-foreground">{novasAv}</span>}</span>
            {a.nome}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-6xl p-4">
        {/* Pedidos fica montado em qualquer aba: é ele que ouve e apita pedido novo */}
        {!loja ? <p className="text-muted-foreground">Carregando…</p> : <div hidden={atual.id !== 'pedidos'}><Pedidos loja={loja} estoque={estoque} papel={papel} onNovos={setNovos} /></div>}
        {loja && atual.id === 'loja' && <Loja loja={loja} />}
        {loja && atual.id === 'estoque' && <Estoque estoque={estoque} />}
        {loja && atual.id === 'numeros' && <Numeros loja={loja} />}
        {loja && atual.id === 'avaliacoes' && <Avaliacoes loja={loja} onVerPedido={verPedido} />}
      </main>
      <Toaster position="top-center" />
    </div>
  );
}

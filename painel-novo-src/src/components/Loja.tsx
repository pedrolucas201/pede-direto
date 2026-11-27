// Aba Loja: botões do dia a dia, igual ao painel antigo (painel.js renderLoja). Gravam a data de hoje, então resetam sozinhos amanhã
import { writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { hoje } from '../../../horario.js';
import { db } from '@/lib/firebase';
import { lojaRef } from '@/lib/dados';
import { registrar, erro } from '@/lib/registro';
import type { Loja as LojaT } from '@/lib/tipos';

function mudar(campo: string, ligado: boolean) {
  const valor = ligado ? hoje() : null, b = writeBatch(db);
  b.update(lojaRef, { [campo]: valor, reg: registrar(b, 'loja', 'loja', { campo, valor }) });
  b.commit().catch(e => { erro('loja', e); toast.error('Não salvou, tenta de novo'); });
}

function Controle({ campo, ligado, nome, dica }: { campo: string; ligado: boolean; nome: string; dica?: string }) {
  return (
    // cartão: nome e chave juntos (na largura cheia, a chave ficava longe do nome)
    <label className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-card p-3', ligado && 'border-primary')}>
      <span className="grid">{dica ? <strong>{nome}</strong> : nome}{dica && <small className="text-muted-foreground">{dica}</small>}</span>
      <Switch data-campo={campo} checked={ligado} onCheckedChange={v => mudar(campo, v)} />
    </label>
  );
}

export function Loja({ loja }: { loja: LojaT }) {
  const d = hoje(), esg = loja.esgotados || {};
  return (
    <section data-testid="loja">
      <div className="grid gap-2 md:grid-cols-2">
        <Controle campo="fechadaHoje" ligado={loja.fechadaHoje === d} nome="Fechar hoje" dica="Ninguém consegue pedir até amanhã" />
        <Controle campo="abertaHoje" ligado={loja.abertaHoje === d} nome="Abrir hoje fora do horário" dica={`Normal: ${loja.horario.texto}`} />
      </div>
      <h3 className="mt-6 mb-2 font-semibold">Esgotou hoje</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {loja.cardapio.map(i => <Controle key={i.id} campo={`esgotados.${i.id}`} ligado={esg[i.id] === d} nome={i.nome} />)}
      </div>
    </section>
  );
}

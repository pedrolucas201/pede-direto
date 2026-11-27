// Aba Loja: botões do dia a dia, igual ao painel antigo (painel.js renderLoja). Gravam a data de hoje, então resetam sozinhos amanhã
import { writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
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
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b py-3">
      <span className="grid">{dica ? <strong>{nome}</strong> : nome}{dica && <small className="text-muted-foreground">{dica}</small>}</span>
      <Switch data-campo={campo} checked={ligado} onCheckedChange={v => mudar(campo, v)} />
    </label>
  );
}

export function Loja({ loja }: { loja: LojaT }) {
  const d = hoje(), esg = loja.esgotados || {};
  return (
    <section data-testid="loja" className="mx-auto max-w-2xl">
      <Controle campo="fechadaHoje" ligado={loja.fechadaHoje === d} nome="Fechar hoje" dica="Ninguém consegue pedir até amanhã" />
      <Controle campo="abertaHoje" ligado={loja.abertaHoje === d} nome="Abrir hoje fora do horário" dica={`Normal: ${loja.horario.texto}`} />
      <h3 className="mt-6 mb-1 font-semibold">Esgotou hoje</h3>
      {loja.cardapio.map(i => <Controle key={i.id} campo={`esgotados.${i.id}`} ligado={esg[i.id] === d} nome={i.nome} />)}
    </section>
  );
}

// Lastro de cada ação (mesma linha do painel antigo, montada por registro-linha.js): gravada na mesma operação da mudança
import { doc, collection, serverTimestamp, writeBatch, type WriteBatch, type Transaction } from 'firebase/firestore';
import { linhaRegistro } from '../../../registro-linha.js';
import { auth, db, LOJA_ID } from './firebase';

// t: lote ou transação da própria mudança. Devolve o id, que vai em `reg`
export function registrar(t: WriteBatch | Transaction, acao: string, alvo: string, dados: Record<string, unknown> = {}) {
  const ref = doc(collection(db, 'lojas', LOJA_ID, 'registro'));
  (t as WriteBatch).set(ref, linhaRegistro(serverTimestamp(), auth.currentUser?.email, acao, alvo, dados, navigator.userAgent));
  return ref.id;
}
// melhor esforço (comanda impressa, erro): nunca trava nem derruba a ação
export function anotar(acao: string, alvo: string, dados: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  registrar(b, acao, alvo, dados);
  b.commit().catch(() => {});
}
export const erro = (onde: string, e: unknown) =>
  anotar('erro', onde, { msg: String((e as { code?: string; message?: string })?.code ?? (e as Error)?.message ?? e).slice(0, 300) });

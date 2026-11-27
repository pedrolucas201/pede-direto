// 'dono' (tudo) ou 'funcionario' (Pedidos, Estoque e Loja); quem garante é a regra do banco, aqui só esconde
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithCredential, GoogleAuthProvider, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, LOJA_ID, LOCAL } from './firebase';

export type Papel = 'dono' | 'funcionario';
export type Acesso =
  | { estado: 'carregando' }
  | { estado: 'fora' }
  | { estado: 'negado'; email: string; erro?: string }
  | { estado: 'dentro'; user: User; papel: Papel };

const google = new GoogleAuthProvider();
google.setCustomParameters({ prompt: 'select_account' });
export const entrar = () => signInWithPopup(auth, google);
// só no emulador: login sem popup (teste e2e)
if (LOCAL) Object.assign(window, { __entrar: (email: string) =>
  signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }))) });

const tem = (col: string, email: string) => getDoc(doc(db, 'lojas', LOJA_ID, col, email)).then(d => d.exists());

export function useAcesso(): Acesso {
  const [a, setA] = useState<Acesso>({ estado: 'carregando' });
  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user?.email) return setA({ estado: 'fora' });
    try {
      const papel: Papel | null = await tem('admins', user.email) ? 'dono' : await tem('funcionarios', user.email) ? 'funcionario' : null;
      if (user !== auth.currentUser) return; // trocou de conta enquanto conferia
      setA(papel ? { estado: 'dentro', user, papel } : { estado: 'negado', email: user.email });
    } catch (e) {
      // leitura do próprio admin não falha por permissão: é conexão ou App Check
      setA({ estado: 'negado', email: user.email, erro: String((e as { code?: string }).code ?? e) });
    }
  }), []);
  return a;
}

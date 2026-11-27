// Dados ao vivo do painel: loja, pedidos de hoje (com aviso de pedido novo), pedidos de outro dia e estoque
import { useEffect, useRef, useState } from 'react';
import { doc, collection, query, where, orderBy, onSnapshot, Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import { db, LOJA_ID } from './firebase';
import type { Estoque, Loja, Pedido } from './tipos';

export const lojaRef = doc(db, 'lojas', LOJA_ID);
export const pedidosRef = collection(lojaRef, 'pedidos');
export const estoqueRef = doc(lojaRef, 'estoque', 'atual');

const data = (t: unknown) => (t as Timestamp | null)?.toDate?.() ?? null;
export const lerPedido = (d: DocumentSnapshot): Pedido => {
  const p = d.data({ serverTimestamps: 'estimate' })!;
  return { ...p, id: d.id, criadoEm: data(p.criadoEm), aceitoEm: data(p.aceitoEm), saiuEm: data(p.saiuEm), entregueEm: data(p.entregueEm), alteradoEm: data(p.alteradoEm) } as Pedido;
};
const inicio = (dia: string) => new Date(`${dia}T00:00:00-03:00`);

export function useLoja() {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => onSnapshot(lojaRef, { includeMetadataChanges: true }, s => {
    // aviso de sem conexão pelo Firestore (fromCache), não pelo navigator.onLine: o Chrome do Mac fica "offline" depois de dormir
    setOffline(s.metadata.fromCache);
    if (s.exists()) setLoja(s.data({ serverTimestamps: 'estimate' }) as Loja);
  }), []);
  return { loja, offline };
}

// hoje, ao vivo; onNovo dispara quando chega pedido 'novo' depois da primeira leitura
export function usePedidosHoje(dia: string, onNovo: () => void) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const aviso = useRef(onNovo);
  aviso.current = onNovo;
  useEffect(() => {
    let primeira = true;
    return onSnapshot(query(pedidosRef, where('criadoEm', '>=', Timestamp.fromDate(inicio(dia))), orderBy('criadoEm', 'desc')), s => {
      const chegou = !primeira && s.docChanges().some(c => c.type === 'added' && c.doc.data().status === 'novo');
      primeira = false;
      setPedidos(s.docs.map(lerPedido));
      if (chegou) aviso.current();
    });
  }, [dia]);
  return pedidos;
}

// outro dia (setas e calendário), ao vivo, sem aviso. null = carregando; 'erro' = não deu pra ler
export function usePedidosDia(dia: string | null) {
  const [pedidos, setPedidos] = useState<Pedido[] | null | 'erro'>(null);
  useEffect(() => {
    setPedidos(null);
    if (!dia) return;
    const ini = inicio(dia);
    return onSnapshot(query(pedidosRef, where('criadoEm', '>=', Timestamp.fromDate(ini)),
      where('criadoEm', '<', Timestamp.fromDate(new Date(ini.getTime() + 864e5))), orderBy('criadoEm', 'desc')),
    s => setPedidos(s.docs.map(lerPedido)), e => { console.error(e); setPedidos('erro'); });
  }, [dia]);
  return pedidos;
}

// undefined = ainda não leu do servidor (aceite grava semEstoque); null = loja sem produto cadastrado
export function useEstoque() {
  const [estoque, setEstoque] = useState<Estoque | null | undefined>(undefined);
  useEffect(() => onSnapshot(estoqueRef, s => {
    if (s.metadata.fromCache && !s.exists()) return; // cache vazio de quem abriu offline não é "loja sem produto"
    setEstoque(s.exists() ? s.data() as Estoque : null);
  }, e => console.error('estoque', e)), []);
  return estoque;
}

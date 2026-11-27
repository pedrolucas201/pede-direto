// Formato dos documentos (o mesmo que o site grava; a regra do banco é quem valida)
import type { Timestamp } from 'firebase/firestore';

export type Status = 'novo' | 'preparo' | 'saiu' | 'entregue' | 'cancelado';
export interface Item { id: string; nome: string; unit: number; qtd: number; escolhas?: Record<string, string>; sem?: string[]; extras?: string[]; obs?: string }
export interface Pedido {
  id: string; cod: string; status: Status; entrega: boolean; local?: boolean; pag: string; troco: number; obs: string;
  cliente: { nome: string; fone: string; rua?: string; numero?: string; bairro?: string; compl?: string; ref?: string; loc?: string };
  itens: Item[]; subtotal: number; taxa: number | null; divisao?: { pag: string; valor: number }[]; motivo?: string;
  criadoEm: Date | null; aceitoEm: Date | null; saiuEm: Date | null; entregueEm: Date | null; alteradoEm: Date | null;
  antes?: { itens: Item[]; subtotal: number; pag: string; fone?: string };
  baixa?: Record<string, number>; baixadoEm?: Timestamp; devolvidoEm?: Timestamp;
}
export interface Produto { nome: string; cat?: string; un: string; liga?: string | null; min?: number; pacote?: number; pacoteNome?: string }
export interface Estoque { produtos: Record<string, Produto>; qtd: Record<string, number>; maior?: Record<string, number> }
// a loja vem do banco (seed de lojas/lacarne.mjs); só os campos que o painel usa
export interface Loja {
  nome: string; cidade: string; horario: { texto: string; abre: number; fecha: number }; cardapio: { id: string; nome: string; preco: number; camadas?: string[] }[];
  adicionais?: { id: string; nome: string; preco: number }[]; fechadaHoje?: string; abertaHoje?: string; esgotados?: Record<string, string | null>;
  [k: string]: unknown;
}

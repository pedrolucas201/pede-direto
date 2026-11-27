// Balcão: o site em modo balcão abre por cima; o painel segue vivo (som e pedidos chegando).
// Editar usa a mesma tela, com o pedido carregado. Fase 2 da migração troca o iframe por tela própria.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type TelaBalcao = { src: string; titulo: string };

export function Balcao({ tela, onFechar, onLancado, onEditado }:
  { tela: TelaBalcao | null; onFechar: () => void; onLancado: (id: string) => void; onEditado: (id: string) => void }) {
  const quadro = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null); // fica carregado escondido: o próximo Lançar abre na hora
  const [titulo, setTitulo] = useState('');
  const cb = useRef({ onLancado, onEditado });
  cb.current = { onLancado, onEditado };

  useEffect(() => {
    if (!tela) return;
    setTitulo(tela.titulo);
    if (tela.src.includes('editar') || src !== tela.src) setSrc(tela.src);
  }, [tela]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.editado) return cb.current.onEditado(e.data.editado);
      if (!e.data?.lancado) return;
      quadro.current?.contentWindow?.location.reload(); // zera o formulário pro próximo, em segundo plano
      cb.current.onLancado(e.data.lancado);
    };
    addEventListener('message', ouvir);
    return () => removeEventListener('message', ouvir);
  }, []);

  if (!src) return null;
  return (
    <div hidden={!tela} data-testid="balcao" className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card py-1 pr-1 pl-4">
        <strong>{titulo}</strong>
        {/* fechar no meio guarda a sacola pra quando voltar */}
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onFechar}><X /></Button>
      </div>
      <iframe ref={quadro} title={titulo} src={src} className="w-full flex-1 border-0" />
    </div>
  );
}

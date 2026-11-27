// Som de pedido novo e tela acesa (porte do painel antigo). O navegador só libera áudio depois de um toque, e isso zera
// a cada abertura da página. Quem já ativou uma vez não vê mais o botão: o primeiro toque em qualquer lugar religa.
import { useEffect, useState } from 'react';

let audio: AudioContext | null = null;
const manterAcesa = () => (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
const lembrar = () => { try { return localStorage.getItem('som') === '1'; } catch { return false; } };
const titulo = document.title;

export function bip() {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.frequency.value = 880;
  o.connect(g).connect(audio.destination);
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.start(t);
  o.stop(t + 0.6);
}
// pedido chegou sem som liberado (ou com a aba em segundo plano): avisa no título da aba até alguém olhar
export function avisarNoTitulo() {
  if (audio?.state !== 'running' || document.hidden) document.title = `🔔 Pedido novo! · ${titulo}`;
}

// estado: 'ativar' (nunca ativou: mostra o botão), 'religar' (ativou antes, falta um toque), 'ok'
export function useSom() {
  const [estado, setEstado] = useState<'ativar' | 'religar' | 'ok'>(() => lembrar() ? 'religar' : 'ativar');
  const ligar = () => {
    audio ??= new AudioContext();
    audio.resume?.();
    manterAcesa();
    setEstado('ok');
    try { localStorage.setItem('som', '1'); } catch {}
  };
  useEffect(() => {
    if (lembrar()) {
      audio ??= new AudioContext(); // nasce suspenso; alguns navegadores já liberam pra site muito usado
      if (audio.state === 'running') setEstado('ok');
    }
    const religar = () => { if (lembrar()) ligar(); };
    const tirarTitulo = () => { if (document.visibilityState === 'visible') document.title = titulo; };
    const voltou = () => { if (audio && document.visibilityState === 'visible') manterAcesa(); if (audio?.state === 'running') tirarTitulo(); };
    addEventListener('pointerdown', religar, true);
    addEventListener('keydown', religar, true);
    addEventListener('pointerdown', tirarTitulo);
    document.addEventListener('visibilitychange', voltou);
    return () => {
      removeEventListener('pointerdown', religar, true);
      removeEventListener('keydown', religar, true);
      removeEventListener('pointerdown', tirarTitulo);
      document.removeEventListener('visibilitychange', voltou);
    };
  }, []);
  return { estado, ligar };
}

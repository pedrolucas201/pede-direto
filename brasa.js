// fogo vivo na grelha da comanda: o fogo do Doom (PSX) vira máscara. Cada célula da grade de calor (0..36) copia a de baixo
// menos um sorteio e desliza pro lado com o mesmo sorteio; a grade, borrada, recorta uma cópia acesa da própria foto da grelha
// (o CSS clareia e põe em screen), então só as chamas e brasas da foto pulsam. Não desenha fogo novo.
// Devolve a função que para. Com "reduzir movimento", não liga: fica a foto parada.
const GW = 48, GH = 20, K = Math.round(110 / GH); // grade baixa esfria rápido (o Doom tinha 168 linhas)

export function brasa(img, cv) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const W = cv.width = img.naturalWidth >> 1, H = cv.height = img.naturalHeight >> 1;
  const px = new Uint8Array(GW * GH).fill(36, (GH - 1) * GW);
  const mini = Object.assign(document.createElement('canvas'), { width: GW, height: GH });
  const mctx = mini.getContext('2d'), mimg = mctx.createImageData(GW, GH), ctx = cv.getContext('2d');
  let id, ult = 0;
  const quadro = t => {
    id = requestAnimationFrame(quadro);
    if (document.hidden || t - ult < 1000 / 24) return;
    ult = t;
    for (let x = 0; x < GW; x++) for (let y = 1; y < GH; y++) {
      const src = y * GW + x, p = px[src];
      if (!p) { px[src - GW] = 0; continue; }
      const r = Math.random() * 3 | 0;
      px[Math.max(GW, src - r + 1) - GW] = Math.max(0, p - (r & 1) * K); // ponytail: borda esquerda trava em vez de dar a volta
    }
    for (let i = 0; i < px.length; i++) mimg.data[i * 4 + 3] = (px[i] / 36) ** 2 * 255;
    mctx.putImageData(mimg, 0, 0);
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(mini, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-in'; ctx.drawImage(img, 0, 0, W, H);
    ctx.clearRect(0, H * .91, W, H); // sombra cinza embaixo da grelha: acesa vira uma faixa clara
  };
  id = requestAnimationFrame(quadro);
  return () => { cancelAnimationFrame(id); ctx.clearRect(0, 0, W, H); };
}

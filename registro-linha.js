// A linha do registro (lastro), igual no painel antigo (registro.js) e no novo (painel-novo-src/src/lib/registro.ts):
// a regra do banco confere cada campo, então os dois montam a linha por aqui
export const linhaRegistro = (em, quem, acao, alvo, dados, aparelho) =>
  ({ em, quem: quem ?? '', acao, alvo, dados: dados ?? {}, aparelho: String(aparelho ?? '').slice(0, 150) });

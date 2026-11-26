# Painel de Ativos — B3

Painel pessoal de ações e indicadores da B3, publicado como aplicativo instalável.

Endereço: <https://vitorbastoni.github.io/painel-b3/>

Carteira, transações, token da brapi e configurações ficam **somente neste navegador** (armazenamento local). Nada disso vai para um servidor nosso.

Na primeira vez, neste celular ou computador, abra as configurações (ícone de engrenagem) e use **Importar backup (.json)** com o arquivo que você exportou antes. Sem esse arquivo, o painel abre com o histórico que já vem na página. Para guardar uma cópia, use **Exportar backup (.json)** nas mesmas configurações.

## Instalar no Android (Chrome)

1. Abra o endereço acima no Chrome.
2. Toque no menu (⋮).
3. Toque em **Adicionar à tela inicial** ou **Instalar app**.
4. Confirme.

## Instalar no iPhone (Safari)

1. Abra o endereço no Safari.
2. Toque no botão Compartilhar.
3. Toque em **Adicionar à Tela de Início**.
4. Confirme.

## Instalar no computador

No Chrome ou no Edge, abra o painel e use o ícone de instalação na barra de endereço. No menu, o item aparece como instalar **Painel B3**.

## Sem internet

O painel abre offline com a página já salva neste aparelho. Cotações e indicadores (brapi.dev, Banco Central, ANBIMA e afins) só são buscados na rede, na hora — o aplicativo não guarda esses dados para mostrar depois como se ainda fossem atuais. O que você lançou na carteira continua no navegador.

Com internet, uma versão nova do painel entra ao reabrir o aplicativo.

## Publicação

Cada atualização na branch `main` é publicada pelo GitHub Actions (workflow **Publicar no GitHub Pages**). Em Settings → Pages → Build and deployment, a origem precisa ser **GitHub Actions**.

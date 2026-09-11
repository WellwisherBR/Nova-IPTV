# Nova IPTV

Player de IPTV para desktop (Windows) com interface moderna estilo "IPTV Smarters Pro", construído com Electron. Suporta listas **Xtream Codes (API)** e arquivos/URLs **M3U**, com TV ao vivo, filmes, séries, favoritos e retomada de reprodução.

## Recursos

- **Perfis de playlist**
  - Xtream Codes: servidor, usuário e senha, com botão de teste de conexão e data de expiração da conta
  - M3U: carregamento por arquivo local (`.m3u`/`.m3u8`) ou URL
  - Múltiplos perfis: adicionar, editar, excluir e alternar
- **Home com tiles** — TV ao Vivo, Filmes, Séries e Favoritos com contadores
- **TV ao Vivo** — lista com logos dos canais, categorias e busca
- **Filmes e Séries** — grid de pôsteres com categorias laterais e busca
- **Séries** — detalhes com sinopse, temporadas e episódios (via `get_series_info`)
- **Autoplay** — ao terminar um episódio, o próximo inicia automaticamente (inclusive na próxima temporada)
- **Continuar assistindo** — progresso salvo automaticamente; seção dedicada na Home e banner "Continuar assistindo" dentro da série, retomando do ponto exato
- **Favoritos** — filmes e séries com acesso rápido na Home
- **Player integrado** — HLS (hls.js) para canais ao vivo; em caso de formato não suportado, opção de abrir em player externo (VLC etc.)
- **Atualizar playlist** — cache local para abertura instantânea dos conteúdos

## Tecnologias

| Ferramenta | Uso |
| --- | --- |
| [Electron](https://www.electronjs.org/) 33 | Shell desktop (processo principal + renderer) |
| [electron-builder](https://www.electron.build/) | Empacotamento NSIS/portable para Windows |
| [hls.js](https://github.com/video-dev/hls.js) | Reprodução de streams HLS (incluso localmente) |

Sem backend: perfis, favoritos, progresso e cache ficam em `%APPDATA%\nova-iptv\data`.

## Instalação (usuário final)

Baixe um dos executáveis da pasta `dist/` (ou da seção Releases, se publicado):

| Arquivo | Descrição |
| --- | --- |
| `Nova IPTV-1.0.0-Portable.exe` | Versão portátil — basta executar |
| `Nova IPTV-1.0.0-Setup.exe` | Instalador NSIS (cria atalhos e entrada de desinstalação) |

> O Windows SmartScreen pode exibir um aviso por o app não ser assinado digitalmente. Clique em **Mais informações → Executar assim mesmo**.

## Desenvolvimento

Pré-requisito: [Node.js](https://nodejs.org/) 18+.

```bash
npm install   # instala electron, electron-builder e dependências
npm start     # abre o app em modo desenvolvimento
```

> **A pasta `node_modules` não vai para o GitHub** (ela é ignorada pelo `.gitignore` por conter milhares de arquivos). Todas as dependências estão declaradas no `package.json` — qualquer pessoa que clonar o repositório recria a pasta completa rodando apenas `npm install`.
>
> O mesmo vale para a pasta `dist/` (executáveis compilados): publique os `.exe` na aba **Releases** do GitHub em vez de enviá-los junto com o código.

### Compilar os executáveis

```bash
npm run dist  # gera NSIS (Setup) e Portable em dist/
```

Formato individual:

```bash
npx electron-builder --win nsis      # somente instalador
npx electron-builder --win portable  # somente portátil
```

### Problemas conhecidos no build (Windows)

| Problema | Causa | Solução |
| --- | --- | --- |
| `Cannot read properties of undefined (reading 'whenReady')` | Variável `ELECTRON_RUN_AS_NODE` herdada do ambiente (comum em terminais do VS Code) | `$env:ELECTRON_RUN_AS_NODE=$null` antes de rodar |
| `Cannot create symbolic link` ao extrair `winCodeSign` | Symlinks do macOS no pacote exigem privilégio | Ative o **Modo do Desenvolvedor** do Windows ou extraia manualmente o `.7z` para `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\` |

Mais detalhes em [`TUTORIAL-COMPILAR.txt`](TUTORIAL-COMPILAR.txt).

## Estrutura do projeto

```
├── main.js          # Processo principal: janela, IPC, store em disco
├── preload.js       # Ponte segura (contextBridge) entre processos
├── src/
│   ├── index.html   # UI (home, conteúdo, perfis, player, modais)
│   ├── styles.css   # Tema escuro
│   └── app.js       # Lógica: perfis, listas, player, favoritos, progresso
├── assets/          # Ícones e hls.js local
└── package.json     # Scripts e configuração do electron-builder
```

## Aviso legal

Este projeto **não fornece, hospeda ou distribui** nenhum conteúdo, lista ou credencial de IPTV. Ele apenas reproduz listas fornecidas pelo próprio usuário, que é o único responsável por garantir que possui os direitos/autorizações necessários para o conteúdo reproduzido.

## Licença

MIT — veja o arquivo [LICENSE](LICENSE).

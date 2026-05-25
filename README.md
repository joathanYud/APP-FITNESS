# FitLink

Site/app fitness responsivo com rede social, feed de treinos, comentarios, curtidas, seguir pessoas, chat em tempo real, gerador de treino/dieta por IA local, agenda, profissionais e configuracoes de perfil.

## Stack

- React + TypeScript + Vite
- Express + Socket.IO
- SQLite em arquivo usando `node:sqlite`
- Autenticacao JWT

## Estrutura

- `server/`: API, banco SQLite local e rotas do backend
- `src/components/`: componentes reutilizaveis do frontend
- `src/styles/`: estilos globais da aplicacao
- `src/config.ts`: constantes de navegacao e configuracao da API
- `src/types.ts`: tipos compartilhados da interface

## Rodar localmente

```bash
npm install
npm run dev
```

Web: http://localhost:5173  
API: http://localhost:3333

O banco local fica em `data/fitlink.sqlite` e e criado automaticamente com dados de exemplo.

Login de teste:

- Email: `ana@fitlink.com`
- Senha: `123456`

## Scripts

```bash
npm run dev       # sobe web + API
npm run build     # compila frontend
npm run lint      # checa qualidade
npm run db:reset  # remove o banco local; ele sera recriado no proximo dev
```

## Publicar no GitHub

```bash
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git branch -M main
git push -u origin main
```

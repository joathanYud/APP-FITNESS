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

O banco local fica em `data/fitlink.sqlite` e e criado automaticamente vazio. Crie sua conta na primeira abertura.




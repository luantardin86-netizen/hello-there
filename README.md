# Hello There

oi

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a08d2a32-6b1a-4897-8329-1d7fdcda8ca1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Conexão com o Supabase

A aplicação usa a **Supabase Data API** por meio de `@supabase/supabase-js`. O cliente é inicializado em `src/lib/supabase/client.ts` e pode ser reutilizado pelos serviços do frontend.

### Configuração local

1. Copie `.env.example` para `.env`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase.
3. Instale as dependências e inicie o projeto:

```sh
bun install
bun run dev
```

Se você usa npm, execute `npm install` e `npm run dev` no lugar dos comandos Bun.

Na tela **Configurações**, use **Testar conexão** no cartão “Conexão com Supabase”. O teste verifica a URL e a publishable key pelo endpoint público de configurações do Supabase Auth, sem depender de tabelas. Ele confirma que o projeto aceita a chave, mas não comprova ainda consultas à Data API/PostgreSQL.

### Variáveis e segurança

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são dados próprios para uso no cliente/browser. A chave publishable não substitui políticas de segurança.
- Ative RLS em todas as tabelas e crie políticas e permissões explícitas antes de armazenar dados reais.
- `DATABASE_URL` não é usada por esta integração REST. Se for necessária futuramente para operações PostgreSQL no servidor, mantenha-a sem o prefixo `VITE_` e nunca a importe em módulos do frontend.
- Nunca coloque chaves `sb_secret_...`, `service_role` ou senhas PostgreSQL em variáveis `VITE_*`, no código-fonte ou no Git.
- Em hospedagem, configure as duas variáveis `VITE_*` no ambiente de build da plataforma. O Vite incorpora esses valores no bundle durante o build.

Esta etapa prepara a conexão com a API; não cria tabelas, migrations, autenticação de usuários ou políticas RLS.

import type { SupabaseConnectionResult } from './types'

/**
 * Verifica se a URL do projeto e a publishable key são aceitas pelo Supabase.
 *
 * Importante: /rest/v1/ publica o documento OpenAPI do PostgREST e, nos
 * projetos com as novas API keys, exige uma chave administrativa. Por isso,
 * esse endpoint não serve como teste no navegador com sb_publishable_*.
 *
 * /auth/v1/settings é um endpoint público de configurações do Supabase Auth.
 * Ele permite testar a URL e a publishable key sem criar tabela alguma.
 * Esse teste NÃO substitui uma consulta real à Data API/PostgreSQL.
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionResult> {
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const url = configuredUrl ? new URL(configuredUrl).origin : undefined
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !publishableKey) {
    return {
      ok: false,
      message: 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env e reinicie o servidor.',
    }
  }

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: publishableKey,
      },
    })

    if (!response.ok) {
      return {
        ok: false,
        message: `O Supabase respondeu HTTP ${response.status}. Confira se a URL e a publishable key pertencem ao mesmo projeto e se a chave continua ativa.`,
      }
    }

    return {
      ok: true,
      message: 'Projeto alcançável: o Supabase aceitou a publishable key. Este teste valida a URL e a chave pela API de autenticação; a leitura e escrita no PostgreSQL pela Data API ainda precisam ser testadas quando criarmos as tabelas.',
    }
  } catch {
    return {
      ok: false,
      message: 'Não foi possível alcançar o Supabase. Confira sua internet, a URL do projeto e se o serviço está disponível.',
    }
  }
}

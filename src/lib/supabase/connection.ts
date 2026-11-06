import { getSupabaseClient, isSupabaseConfigured } from './client'

export interface SupabaseConnectionResult {
  ok: boolean
  message: string
}

/**
 * Testa a Data API sem pressupor que existam tabelas no banco.
 * getOpenApiSpec consulta a descrição OpenAPI publicada pelo PostgREST.
 */
export async function testSupabaseConnection(): Promise<SupabaseConnectionResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env e reinicie o servidor.',
    }
  }

  try {
    const { error } = await getSupabaseClient().getOpenApiSpec()

    if (error) {
      return {
        ok: false,
        message: `A Data API respondeu com erro: ${error.message}`,
      }
    }

    return {
      ok: true,
      message: 'Conexão confirmada: a Data API do Supabase respondeu corretamente. Nenhuma tabela foi consultada ou modificada.',
    }
  } catch {
    return {
      ok: false,
      message: 'Não foi possível alcançar a Data API. Confira a internet, a URL, a publishable key e se a Data API está habilitada no Supabase.',
    }
  }
}

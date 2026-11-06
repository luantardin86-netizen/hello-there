import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};


type WebsiteLeadEvent = {
  id: string;
  nome_cliente: string;
  numero_cliente: string;
  receivedAt: string;
  origin: string | null;
};

// Fila temporária para o teste entre o POST externo e o navegador do CRM.
// Os leads são copiados para o localStorage pelo StoreProvider do funil.
const websiteLeadEvents: WebsiteLeadEvent[] = [];
const MAX_WEBSITE_LEAD_EVENTS = 500;
const WEBSITE_ORIGINS = new Set([
  "https://website-update-0355b9.netlify.app",
  "http://website-update-0355b9.netlify.app",
]);
const WEBSITE_LEAD_POST_PATH = "/api/webhooks/leads";
const WEBSITE_LEAD_PENDING_PATH = "/api/webhooks/leads/pending";

function leadWebhookResponse(
  data: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  });
  if (origin && WEBSITE_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

/** Recebe o formulário da landing page e o disponibiliza para o funil aberto. */
async function handleWebsiteLeadRequest(request: Request): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname !== WEBSITE_LEAD_POST_PATH && pathname !== WEBSITE_LEAD_PENDING_PATH) {
    return null;
  }

  const origin = request.headers.get("origin");

  if (pathname === WEBSITE_LEAD_PENDING_PATH) {
    if (request.method !== "GET") {
      return leadWebhookResponse(
        { ok: false, message: "Método não permitido. Utilize GET." },
        405,
        null,
      );
    }

    // Sem CORS nesta rota: ela deve ser consultada pelo próprio CRM (same-origin).
    return new Response(JSON.stringify({ ok: true, leads: websiteLeadEvents }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (origin && !WEBSITE_ORIGINS.has(origin)) {
    console.warn("[LEAD WEBHOOK] Origem bloqueada:", origin);
    return leadWebhookResponse(
      { ok: false, message: "Origem não autorizada para este teste." },
      403,
      null,
    );
  }

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    });
    if (origin) headers.set("access-control-allow-origin", origin);
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return leadWebhookResponse(
      { ok: false, message: "Método não permitido. Utilize POST." },
      405,
      origin,
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return leadWebhookResponse(
      { ok: false, message: "Envie o corpo com Content-Type: application/json." },
      415,
      origin,
    );
  }

  try {
    const rawBody = await request.text();
    const bodySize = new TextEncoder().encode(rawBody).length;
    if (bodySize > 16 * 1024) {
      return leadWebhookResponse(
        { ok: false, message: "O JSON excede o limite de 16 KB." },
        413,
        origin,
      );
    }

    const payload: unknown = JSON.parse(rawBody);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return leadWebhookResponse(
        { ok: false, message: "O corpo precisa ser um objeto JSON." },
        400,
        origin,
      );
    }

    const data = payload as Record<string, unknown>;
    // Aceita tanto o contrato interno quanto os rótulos enviados por formulários antigos.
    const rawName = data.nome_cliente ?? data["Nome cliente"] ?? data.name;
    const rawPhone = data.numero_cliente ?? data["Numero Cliente"] ?? data.phone;
    const nomeCliente = typeof rawName === "string" ? rawName.trim() : "";
    const telefoneRecebido =
      typeof rawPhone === "string" || typeof rawPhone === "number"
        ? String(rawPhone).trim()
        : "";
    const numeroCliente = telefoneRecebido.replace(/\D/g, "");

    if (!nomeCliente || nomeCliente.length > 120 || numeroCliente.length < 10 || numeroCliente.length > 15) {
      console.warn("[LEAD WEBHOOK] Payload inválido:", {
        nome_cliente: nomeCliente,
        numero_cliente: telefoneRecebido,
      });
      return leadWebhookResponse(
        {
          ok: false,
          message: "Informe nome_cliente (até 120 caracteres) e numero_cliente válido (10 a 15 dígitos).",
        },
        422,
        origin,
      );
    }

    const event: WebsiteLeadEvent = {
      id: crypto.randomUUID(),
      nome_cliente: nomeCliente,
      numero_cliente: numeroCliente,
      receivedAt: new Date().toISOString(),
      origin,
    };
    websiteLeadEvents.push(event);
    if (websiteLeadEvents.length > MAX_WEBSITE_LEAD_EVENTS) websiteLeadEvents.shift();

    console.info(
      "[LEAD WEBHOOK] POST recebido da landing page:",
      JSON.stringify({
        id: event.id,
        nome_cliente: event.nome_cliente,
        numero_cliente: event.numero_cliente,
        origem: event.origin,
        recebido_em: event.receivedAt,
      }),
    );

    return leadWebhookResponse(
      {
        ok: true,
        message: "Lead recebido pelo CRM e aguardando sincronização com o funil.",
        event_id: event.id,
        etapa: "1. Novo lead",
      },
      202,
      origin,
    );
  } catch (error) {
    console.error("[LEAD WEBHOOK] Erro ao processar POST:", error);
    return leadWebhookResponse(
      { ok: false, message: "Não foi possível interpretar o JSON enviado." },
      400,
      origin,
    );
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const webhookResponse = await handleWebsiteLeadRequest(request);
      if (webhookResponse) return webhookResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

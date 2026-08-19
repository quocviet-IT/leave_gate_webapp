import "server-only";
import type { ChatMessage, ChatSpace } from "@/lib/domain/chat-messages";

/**
 * Posting to the two Google Chat spaces — PRD section VI.
 *
 * The webhook URLs are the whole credential, so they stay server-side and are
 * never logged. Until the company supplies them the poster reports `skipped`
 * rather than throwing: a missing webhook must not stop a request from being
 * filed, and a silent failure would be worse than a loud skip.
 */

export type PostOutcome = { ok: boolean; skipped: boolean; detail: string };

const WEBHOOK_ENV: Record<ChatSpace, string> = {
  approvers: "GCHAT_WEBHOOK_APPROVERS",
  guards: "GCHAT_WEBHOOK_GUARDS",
};

/** A value left at its example is not a webhook. */
function configuredWebhook(space: ChatSpace): string | null {
  const raw = (process.env[WEBHOOK_ENV[space]] ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("https://chat.googleapis.com/")) return null;
  if (raw.includes("/spaces/.../")) return null;
  return raw;
}

export function isChatConfigured(space: ChatSpace): boolean {
  return configuredWebhook(space) !== null;
}

/**
 * Posts one message. Every message about a request carries the request code as
 * its thread key, so a decision lands under the request it decided rather than
 * at the bottom of the space.
 */
export async function postToChat(message: ChatMessage): Promise<PostOutcome> {
  const webhook = configuredWebhook(message.space);
  if (!webhook) {
    return {
      ok: false,
      skipped: true,
      detail: `${WEBHOOK_ENV[message.space]} chưa cấu hình`,
    };
  }

  const url = new URL(webhook);
  url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        thread: { threadKey: message.threadKey },
      }),
    });
    if (!response.ok) {
      // The body can carry the key, so only the status goes anywhere near a log.
      return { ok: false, skipped: false, detail: `Chat trả về ${response.status}` };
    }
    return { ok: true, skipped: false, detail: "" };
  } catch (cause) {
    return {
      ok: false,
      skipped: false,
      detail: cause instanceof Error ? cause.message : "Không gọi được Google Chat",
    };
  }
}

/**
 * Posts without letting a Chat outage take the caller down with it. Filing a
 * request must succeed whether or not the room hears about it.
 */
export async function postQuietly(message: ChatMessage | null): Promise<PostOutcome> {
  if (!message) return { ok: false, skipped: true, detail: "không có gì để gửi" };
  const outcome = await postToChat(message);
  if (!outcome.ok && !outcome.skipped) {
    console.error(`Google Chat (${message.space}): ${outcome.detail}`);
  }
  return outcome;
}

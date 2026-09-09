import type { TakedownChannel } from "@/lib/integrations/alerts/types";

/** Production contacts — override via env for testing. */
export const APPIC_TAKEDOWN_CONTACT = "team@blablabuild.com";
export const RA_TAKEDOWN_CONTACT = "team@blablabuild.com";

export function appicTakedownContact(): string {
  return process.env.ALERT_APPIC_CONTACT?.trim() || APPIC_TAKEDOWN_CONTACT;
}

export function raTakedownContact(): string {
  return process.env.ALERT_RA_CONTACT?.trim() || RA_TAKEDOWN_CONTACT;
}

export function takedownContactFor(channel: TakedownChannel): string {
  return channel === "appic" ? appicTakedownContact() : raTakedownContact();
}

export function partnerContactMeta() {
  return {
    appic: appicTakedownContact(),
    residentAdvisor: raTakedownContact(),
  };
}

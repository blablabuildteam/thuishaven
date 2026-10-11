import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { saveProspectContacts } from "@/lib/outreach/contacts";
import { logSessionActivity } from "@/lib/audit/session-log";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("")),
  linkedinUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal("")),
});

const bodySchema = z.object({
  prospectId: z.string().uuid(),
  contacts: z.array(contactSchema).max(20),
  primaryIndex: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige contactpersonen" },
      { status: 400 },
    );
  }

  const contacts = parsed.data.contacts.map((c) => ({
    name: c.name,
    ...(c.title ? { title: c.title } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.linkedinUrl ? { linkedinUrl: c.linkedinUrl } : {}),
  }));

  const result = await saveProspectContacts({
    prospectId: parsed.data.prospectId,
    contacts,
    primaryIndex: parsed.data.primaryIndex,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logSessionActivity(session, {
    action: "crm_contacts_save",
    summary: `Contactpersonen bijgewerkt (${contacts.length})`,
    path: "/api/outreach/crm/contacts",
    method: "POST",
    status: 200,
    tool: "outreach",
    meta: {
      prospectId: parsed.data.prospectId,
      count: contacts.length,
      primaryIndex: parsed.data.primaryIndex ?? null,
    },
  });

  return NextResponse.json({ ok: true, contacts });
}

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, contactsTable, contactMethodsTable } from "@workspace/db";
import {
  CreateContactBody,
  CreateContactResponse,
  GetContactParams,
  GetContactResponse,
  UpdateContactParams,
  UpdateContactBody,
  UpdateContactResponse,
  DeleteContactParams,
  ListContactsResponse,
  ListContactMethodsParams,
  ListContactMethodsResponse,
  AddContactMethodParams,
  AddContactMethodBody,
  AddContactMethodResponse,
  UpdateContactMethodParams,
  UpdateContactMethodBody,
  UpdateContactMethodResponse,
  DeleteContactMethodParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─── Contacts ────────────────────────────────────────────────────────────────

router.get("/contacts", async (_req, res): Promise<void> => {
  const contacts = await db
    .select()
    .from(contactsTable)
    .orderBy(contactsTable.fullName);
  res.json(ListContactsResponse.parse(contacts));
});

router.post("/contacts", async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({
      fullName: parsed.data.fullName,
      role: parsed.data.role ?? "",
      organization: parsed.data.organization ?? "",
      tags: parsed.data.tags ?? [],
    })
    .returning();

  res.status(201).json(CreateContactResponse.parse(contact));
});

router.get("/contacts/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, params.data.id));

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const methods = await db
    .select()
    .from(contactMethodsTable)
    .where(eq(contactMethodsTable.contactId, params.data.id))
    .orderBy(contactMethodsTable.isPreferred);

  res.json(GetContactResponse.parse({ ...contact, methods }));
});

router.patch("/contacts/:id", async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [contact] = await db
    .update(contactsTable)
    .set(parsed.data)
    .where(eq(contactsTable.id, params.data.id))
    .returning();

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.json(UpdateContactResponse.parse(contact));
});

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [contact] = await db
    .delete(contactsTable)
    .where(eq(contactsTable.id, params.data.id))
    .returning();

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  res.sendStatus(204);
});

// ─── Contact Methods ──────────────────────────────────────────────────────────

router.get("/contacts/:id/methods", async (req, res): Promise<void> => {
  const params = ListContactMethodsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const methods = await db
    .select()
    .from(contactMethodsTable)
    .where(eq(contactMethodsTable.contactId, params.data.id))
    .orderBy(contactMethodsTable.isPreferred);

  res.json(ListContactMethodsResponse.parse(methods));
});

router.post("/contacts/:id/methods", async (req, res): Promise<void> => {
  const params = AddContactMethodParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddContactMethodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Ensure contact exists
  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, params.data.id));
  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const [method] = await db
    .insert(contactMethodsTable)
    .values({
      contactId: params.data.id,
      channelType: parsed.data.channelType,
      channelValue: parsed.data.channelValue,
      isPreferred: parsed.data.isPreferred ?? false,
    })
    .returning();

  res.status(201).json(AddContactMethodResponse.parse(method));
});

router.patch(
  "/contacts/:id/methods/:methodId",
  async (req, res): Promise<void> => {
    const params = UpdateContactMethodParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateContactMethodBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [method] = await db
      .update(contactMethodsTable)
      .set(parsed.data)
      .where(eq(contactMethodsTable.id, params.data.methodId))
      .returning();

    if (!method) {
      res.status(404).json({ error: "Contact method not found" });
      return;
    }

    res.json(UpdateContactMethodResponse.parse(method));
  }
);

router.delete(
  "/contacts/:id/methods/:methodId",
  async (req, res): Promise<void> => {
    const params = DeleteContactMethodParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [method] = await db
      .delete(contactMethodsTable)
      .where(eq(contactMethodsTable.id, params.data.methodId))
      .returning();

    if (!method) {
      res.status(404).json({ error: "Contact method not found" });
      return;
    }

    res.sendStatus(204);
  }
);

export default router;

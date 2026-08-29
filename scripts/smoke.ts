import { MemStorage } from "../server/storage";

async function assert(name: string, cond: unknown) {
  if (!cond) {
    console.error(`❌ ${name}`);
    process.exit(1);
  } else {
  console.warn(`✅ ${name}`);
  }
}

async function main() {
  const s = new MemStorage();

  const u1 = await s.createUser({ username: "u1", email: "u1@x", password: "p" });
  await assert("u1 created", !!u1.id);

  // Явно создаём пару для main_admin (как в auth.ts /api/register)
  const couple = await s.createCouple(u1.id);
  const u1Upd = await s.updateUser(u1.id, { coupleId: couple.id, role: "main_admin" });
  await assert("u1 main_admin", u1Upd.role === "main_admin");
  await assert("u1 has coupleId", !!u1Upd.coupleId);

  const code = await s.generateInviteCode(u1Upd.coupleId!);
  await assert("invite code generated", typeof code === "string" && code.includes("-"));

  const u3 = await s.createUser({ username: "u3", email: "u3@x", password: "p" });
  await s.joinCouple(u3.id, code);
  const u3Reload = await s.getUser(u3.id);
  await assert("u3 in couple", u3Reload?.coupleId === u1Upd.coupleId);
  await assert("u3 role set (co_admin)", u3Reload?.role === "co_admin");

  await s.revokeInviteCode(u1Upd.coupleId!);
  const code2 = await s.generateInviteCode(u1Upd.coupleId!);
  await assert("invite code regenerated", code2 && code2 !== code);

  const partner = await s.getPartnerInfo(u1.id);
  await assert("partner resolvable", !partner || partner.id !== u1.id);

  const updated = await s.updateUser(u1.id, { firstName: "A" });
  await assert("update preserved id", updated.id === u1.id);
  await assert("update applied", updated.firstName === "A");

  console.warn("All smoke checks passed.");
}

main().catch((e) => { console.error(e); process.exit(1); });

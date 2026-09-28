import { createLeadSchema } from "./create-lead.dto";

const contact = {
  fullName: "Ana Souza",
  email: "ana@example.com",
  consentAt: "2026-09-28T18:00:00.000Z",
};

describe("createLeadSchema phone", () => {
  it.each([
    "+5512997643952",
    "+14165550123",
    "+447911123456",
    "+351912345678",
    "+33612345678",
    "+819012345678",
    "+61412345678",
    "+27821234567",
    "+919876543210",
    "+6777471234",
    "+493012345678901",
  ])("accepts and preserves the international number %s", (phone) => {
    expect(createLeadSchema.parse({ ...contact, phone }).phone).toBe(phone);
  });

  it.each(["12997643952", "1133334444"])(
    "keeps legacy app input %s",
    (phone) => {
      expect(createLeadSchema.parse({ ...contact, phone }).phone).toBe(phone);
    },
  );

  it.each([
    "",
    "+999123456789",
    "+1416555",
    "+1416555012399999",
    "+55129976439529999",
    "+1 (416) 555-0123",
    "+14165550123 ext. 12",
    "5512997643952",
  ])("rejects invalid or noncanonical input %s", (phone) => {
    expect(createLeadSchema.safeParse({ ...contact, phone }).success).toBe(
      false,
    );
  });
});

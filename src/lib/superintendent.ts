import { z } from "zod";

// FR-5: Centre Superintendent bio-data, entered by the Superintendent or by the Controller.
export const superintendentSchema = z.object({
  fullName: z.string().min(3).max(120),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d$/, "CNIC must be in the format 12345-1234567-1"),
  designation: z.string().min(2).max(120),
  organization: z.string().min(2).max(200),
  phone: z.string().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number"),
  address: z.string().min(5).max(500),
});

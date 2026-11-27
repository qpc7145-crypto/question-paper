import { z } from "zod";

const cnic = z.string().regex(/^\d{5}-\d{7}-\d$/, "CNIC must be in the format 12345-1234567-1");
const phone = z.string().regex(/^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number");

// FR-5: Centre Superintendent bio-data, entered by the Superintendent or by the Controller.
export const superintendentSchema = z.object({
  fullName: z.string().min(3).max(120),
  cnic,
  designation: z.string().min(2).max(120),
  organization: z.string().min(2).max(200),
  phone,
  address: z.string().min(5).max(500),
});

// FR-4 mandatory Setter bio-data.
export const setterBiodataSchema = z.object({
  fullName: z.string().min(3).max(120),
  cnic,
  qualification: z.string().min(2).max(200),
  institution: z.string().min(2).max(200),
  experienceYears: z.number().int().min(0).max(60),
  specialization: z.string().min(2).max(200),
  phone,
  address: z.string().min(5).max(500),
  subjectsEligible: z.string().min(2).max(1000),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  role: z.enum(["SETTER", "TYPIST", "SUPERINTENDENT"]), // FR-1
  password: z.string().max(200).optional(),
  centreId: z.string().nullable().optional(), // FR-5: link a Superintendent to their centre at creation
});

export const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  displayName: z.string().min(2).max(120).optional(),
  unlock: z.boolean().optional(),
});

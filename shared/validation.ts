import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  password: z.string().min(6, 'Минимум 6 символов'),
  username: z.string().trim().min(2, 'Минимум 2 символа').max(50),
});

export const inviteRegisterSchema = registerSchema.extend({
  inviteCode: z.string().trim().min(1, 'Код приглашения обязателен'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type InviteRegisterInput = z.infer<typeof inviteRegisterSchema>;

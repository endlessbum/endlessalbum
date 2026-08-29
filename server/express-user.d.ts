export {};

// Единый источник истины для дополнения типа Express.User (Passport кладёт сюда
// аутентифицированного пользователя из deserializeUser). Не переобъявляйте этот
// интерфейс в отдельных модулях — импортируйте типы из @shared/schema, если нужен
// тип пользователя в обычном коде.
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      email: string;
      password: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      role: "main_admin" | "co_admin" | "guest";
      coupleId: string | null;
      isOnline: boolean | null;
      lastSeen: Date | null;
      createdAt: Date | null;
      updatedAt: Date | null;
    }
  }
}

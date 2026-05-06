import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      profileComplete: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    fullName?: string | null;
    profileComplete?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    profileComplete?: boolean;
  }
}

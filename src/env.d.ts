/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts on admin routes once the session cookie checks out. */
    user?: import('./lib/admin/session').SessionUser;
  }
}

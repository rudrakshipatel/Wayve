import { deleteAuthUser, serve } from "../_shared/deno/runtime.ts";
import { createDeleteAccount } from "../_shared/handlers/delete-account.ts";

serve(createDeleteAccount(deleteAuthUser));

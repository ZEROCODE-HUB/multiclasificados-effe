import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), auth: { signOut: () => signOut() } },
}));

import { deleteMyAccount } from "@/lib/account";

beforeEach(() => { rpc.mockReset(); signOut.mockReset(); });

describe("deleteMyAccount", () => {
  it("llama al RPC delete_my_account y luego cierra la sesión", async () => {
    rpc.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({});
    await deleteMyAccount();
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalled();
  });

  it("si el borrado falla, lanza y NO cierra la sesión", async () => {
    rpc.mockResolvedValue({ error: { message: "boom" } });
    await expect(deleteMyAccount()).rejects.toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });
});

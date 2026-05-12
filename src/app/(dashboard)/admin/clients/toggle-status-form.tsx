import { toggleClientStatus } from "@/server/actions/clients";

export function ToggleStatusForm({
  id,
  currentStatus,
}: {
  id: string;
  currentStatus: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await toggleClientStatus(id);
      }}
    >
      <button
        type="submit"
        className="text-xs text-zinc-500 hover:text-zinc-900"
      >
        {currentStatus === "active" ? "Disable" : "Enable"}
      </button>
    </form>
  );
}

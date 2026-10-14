import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

function renderDialog(onConfirm) {
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Archive this user?"
      message="They won't be able to sign in."
      confirmLabel="Archive"
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("ConfirmDialog", () => {
  it("closes after the action succeeds", async () => {
    const onClose = renderDialog(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("stays open and shows the error when the action fails", async () => {
    const onClose = renderDialog(
      vi.fn().mockRejectedValue(new Error("Reassign this manager's projects and employees first")),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reassign this manager's projects");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancel closes without running the action", () => {
    const onConfirm = vi.fn();
    const onClose = renderDialog(onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

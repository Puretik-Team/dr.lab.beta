import { create } from "zustand";
import { dropPaidSelectionIfFree, hasSelectedDesign } from "./api";

// Whether the "you haven't selected a design" prompt is showing. Rendered by
// components/DesignGateModal, mounted once in the app layout.
export const useDesignGate = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

// Call before anything that prints with the report design. Returns true when
// printing can go ahead; otherwise opens the prompt and returns false. A
// failing check never blocks printing.
export async function ensureReportDesign(planType) {
  try {
    await dropPaidSelectionIfFree(planType);
    if (await hasSelectedDesign()) return true;
  } catch (e) {
    return true;
  }
  useDesignGate.getState().show();
  return false;
}

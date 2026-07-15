// Per-business bill-to overrides for invoices. Fallback uses generic business name/code.

export interface BillTo {
  name: string;
  abn: string;
  address_lines: string[];
}

const BILL_TO_OVERRIDES: Record<string, BillTo> = {
  PRP: {
    name: "Pro Regal Pavilion Pty Ltd",
    abn: "86675963069",
    address_lines: ["82 Station Street", "Wentworthville NSW 2145"],
  },
};

export function getBillTo(businessCode: string | null | undefined, fallbackName: string | null | undefined): BillTo {
  const key = (businessCode || "").toUpperCase();
  if (BILL_TO_OVERRIDES[key]) return BILL_TO_OVERRIDES[key];
  return {
    name: fallbackName || key || "Business",
    abn: "",
    address_lines: [],
  };
}

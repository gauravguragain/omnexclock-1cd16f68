import type { FormConfig } from "./engine";

// Bump when the standard form set changes; businesses on an older set are reset once.
export const SEED_VERSION = 2;

const alerts = { outOfRange: true, overdue: true, openTooLong: true };
const month = [{ key: "month", label: "Month", type: "month" as const }];
const date = { key: "date", label: "Date", type: "date" as const, autofill: "date" as const, required: true };
const time = { key: "time", label: "Time", type: "time" as const, autofill: "time" as const, required: true };
const sign = (label = "Sign") => ({ key: "sign", label, type: "signature" as const, autofill: "staff" as const, required: true });
const corrective = { key: "corrective", label: "Corrective Action", type: "text" as const };

const CLEAN_ITEMS = ["Chopping boards", "Knives", "Prep benches", "Rolling pin", "Mandolin slicer", "Food processor", "Cooking burner", "Ovens", "Deep fryer", "Microwave", "Grill / flat top", "Bain marie", "Cool room floor", "Fridges", "Freezers", "Sinks", "Floors", "Walls", "Exhaust hood & filters", "Dishwasher", "Bins", "Shelving", "Storage containers", "Utensils", "Tables"];

const base: FormConfig[] = [
  {
    name: "Fridge Temp Logs", title: "PRO REGAL Daily Fridge Temperature Log Sheet", form_type: "daily_grid", period: "monthly",
    headers: month,
    sections: [
      { key: "cold_room_1", label: "Cold Room 1", max: 5 }, { key: "cold_room_2", label: "Cold Room 2", max: 5 },
      { key: "freezer_1", label: "Freezer 1", max: -15 }, { key: "freezer_2", label: "Freezer 2", max: -15 }, { key: "freezer_3", label: "Freezer 3", max: -15 },
    ],
    checks: [{ key: "am", label: "AM", due: "11:00" }, { key: "pm", label: "PM", due: "20:00" }],
    fields: [
      { key: "temp", label: "Recorded temperature °C", type: "temperature", required: true },
      { key: "sig_ca", label: "Signature & corrective actions", type: "text" },
    ],
    limitField: "temp",
    corrective: { field: "sig_ca", triggers: [], defaultInRange: "NCAR" },
    instructions: "Record every unit AM and PM. Cold rooms must be 5°C or below. Freezers -15°C to -18°C or colder. If out of range, write the corrective action and tell your supervisor.",
    alerts,
  },
  {
    name: "Cleaning Schedule", title: "PRO REGAL CLEANING SCHEDULE", form_type: "event_log", period: "monthly",
    headers: [...month, { key: "area", label: "Area", type: "dropdown", options: ["Kitchen", "Bar", "FOH"], default: "Kitchen" }],
    sections: [], checks: [],
    fields: [
      date, time,
      { key: "item", label: "Item requiring cleaning", type: "dropdown", options: CLEAN_ITEMS, allowAdd: true, required: true },
      { key: "frequency", label: "Cleaning type", type: "dropdown", options: ["After use", "Daily", "Weekly"], required: true, help: "Pick why it was cleaned now — after use, the daily clean or the weekly deep clean." },
      { key: "chemicals", label: "Chemicals", type: "dropdown", options: ["Detergent/sanitiser", "Degreaser", "Oven cleaner", "Food safe sanitiser"], allowAdd: true, required: true },
      { key: "method", label: "Method", type: "dropdown", options: ["Wash, rinse, sanitise, air dry", "Use oven cleaner, wash, dry", "Spray, wipe, sanitise, air dry", "Sweep and mop"], allowAdd: true },
      sign("Person responsible"),
    ],
    instructions: "Log each item when you clean it. Not everything is cleaned at once — choose After use, Daily or Weekly for the clean you did.",
    alerts,
  },
  {
    name: "Receiving Goods", title: "PRO REGAL RECEIVING RECORDS", code: "CCP2", form_type: "event_log", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      date, time,
      { key: "product", label: "Product", type: "text", required: true },
      { key: "supplier", label: "Supplier", type: "dropdown", options: [], allowAdd: true, required: true },
      { key: "category", label: "Goods category", type: "dropdown", options: ["Chilled", "Frozen", "Hot", "Dry"], required: true },
      { key: "condition", label: "Condition", type: "dropdown", options: ["Clean, sealed & intact", "Damaged / unsealed"], required: true },
      { key: "temp", label: "Temp °C", type: "temperature", required: true, hiddenWhen: [{ field: "category", value: "Dry" }],
        conditionalLimits: [{ field: "category", value: "Chilled", max: 5 }, { field: "category", value: "Frozen", max: -15 }, { field: "category", value: "Hot", min: 60 }] },
      corrective,
      sign("Checked by"),
      { key: "photo", label: "Invoice photo", type: "photo" },
    ],
    corrective: { field: "corrective", triggers: [{ field: "condition", value: "Damaged / unsealed" }] },
    instructions: "Check every delivery. Chilled 5°C or below, frozen -15°C or below, hot 60°C or above. Reject or record a corrective action if out of range or damaged.",
    alerts,
  },
  {
    name: "Hot and Cold Food Records", title: "PRO REGAL HOT AND COLD FOOD RECORDS", form_type: "event_log", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      date,
      { key: "kind", label: "Hot Food / Cold Food", type: "dropdown", options: ["Hot Food", "Cold Food"], required: true },
      time,
      { key: "product", label: "Product", type: "text", required: true },
      { key: "spot1", label: "Spot 1 Temp °C", type: "number", required: true },
      { key: "spot2", label: "Spot 2 Temp °C", type: "number", required: true },
      { key: "temp", label: "Temperature", type: "temperature", computed: { fn: "max", of: ["spot1", "spot2"], byField: { field: "kind", map: { "Hot Food": "min", "Cold Food": "max" } } },
        conditionalLimits: [{ field: "kind", value: "Cold Food", max: 5 }, { field: "kind", value: "Hot Food", min: 60 }] },
      corrective,
      sign(),
    ],
    corrective: { field: "corrective", triggers: [] },
    instructions: "Probe two spots of the product. Hot food 60°C or above, cold food 5°C or below. Sanitise the probe before and after use. Tell your supervisor if out of range.",
    alerts,
  },
  {
    name: "Cooling Records", title: "PRO REGAL COOLING FOOD RECORDS", form_type: "two_step", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      { ...date, step: "start" },
      { key: "food", label: "Food", type: "text", required: true, step: "start" },
      { key: "start_time", label: "Start time (food at 60°C)", type: "time", autofill: "time", required: true, step: "start" },
      { key: "start_temp", label: "Start Temp °C", type: "temperature", required: true, min: 55, step: "start" },
      { key: "time_2h", label: "Time at 2 hrs", type: "time", required: true, step: "finish" },
      { key: "temp_2h", label: "Temp after 2 hrs °C", type: "temperature", required: true, max: 21, step: "finish" },
      { key: "time_4h", label: "Time at further 4 hrs", type: "time", autofill: "time", required: true, step: "finish" },
      { key: "temp_4h", label: "Temp after 4 hrs °C", type: "temperature", required: true, max: 5, step: "finish" },
      { ...corrective, step: "finish" },
      { ...sign("Staff initials"), step: "finish" },
    ],
    corrective: { field: "corrective", triggers: [] },
    openAlertHours: 6,
    instructions: "Cool from 60°C to 21°C within 2 hours, then to 5°C or below within a further 4 hours (Standard 3.2.2). Start the record when food is at 60°C and finish it once it is at 5°C.",
    alerts,
  },
  {
    name: "Thermometer Calibration", title: "PRO REGAL THERMOMETER CALIBRATION", form_type: "event_log", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      date,
      { key: "thermometer", label: "Thermometer", type: "dropdown", options: ["Probe 1", "Probe 2"], allowAdd: true, required: true },
      { key: "boiling", label: "Boiling water °C", type: "temperature", required: true, min: 99, max: 101 },
      { key: "ice", label: "Ice water °C", type: "temperature", required: true, min: -1, max: 1 },
      corrective,
      sign(),
    ],
    corrective: { field: "corrective", triggers: [] },
    instructions: "Check each thermometer weekly. Boiling water should read 100°C (±1) and ice water 0°C (±1). If not, replace or recalibrate and record the action.",
    alerts,
  },
  {
    name: "Ice Machine Cleaning", title: "PRO REGAL BAR MONTHLY ICE MACHINE CLEANING SCHEDULE", form_type: "event_log", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      date,
      { key: "name", label: "Name", type: "text", required: true },
      { key: "notes", label: "Notes", type: "text" },
      sign(),
    ],
    instructions: "Clean and sanitise the bar ice machine once a month and sign it off here.",
    alerts,
  },
  {
    name: "Food Indemnity", title: "Food Being Taken Out of the Premises by Guests", form_type: "event_log", period: "monthly",
    headers: month, sections: [], checks: [],
    fields: [
      date,
      { key: "customer", label: "Customer name", type: "text", required: true },
      { key: "food", label: "Type of food and/or drink", type: "text", required: true },
      { key: "function", label: "Function", type: "text", required: true },
      { key: "customer_sign", label: "Customer signature", type: "text", required: true, help: "Customer types their full name to sign." },
      { key: "position", label: "Position", type: "text" },
      sign("Signed for company"),
    ],
    instructions: "The customer confirms they are taking the food off the premises, will follow all food safety and licensing laws, indemnifies the venue against any claims arising from the food, and holds valid public liability insurance.",
    alerts,
  },
];

export const SEED_FORMS: (FormConfig & { seedVersion: number })[] = base.map((c) => ({ ...c, seedVersion: SEED_VERSION }));

import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listBusinesses from "./tools/list-businesses";
import listLeads from "./tools/list-leads";
import listUpcomingBookings from "./tools/list-upcoming-bookings";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "omnexclock",
  title: "OmnexClock",
  version: "0.1.0",
  instructions:
    "Tools for Regal Clock sales & events. Call list_businesses first to get a business_id, then list leads, upcoming bookings, open tasks, or create a task.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listBusinesses, listLeads, listUpcomingBookings, listTasks, createTask],
});

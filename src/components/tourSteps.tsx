import { BarChart3, Users, CalendarRange, Monitor, CalendarDays, DollarSign, CalendarOff, MessageSquare, FileText, UserCog, Building2, Clock } from "lucide-react";
import type { TourStep } from "./WalkthroughTour";

export const adminTourSteps: TourStep[] = [
  {
    title: "Welcome to Your Admin Panel!",
    description: "This is your central hub for managing your business. Let's take a quick tour of the key features available to you.",
    icon: <Building2 className="h-5 w-5 text-primary" />,
  },
  {
    title: "Dashboard",
    description: "Your dashboard shows real-time analytics — active employees, hours worked this week, hourly activity charts, and recent clock events. It updates automatically.",
    icon: <BarChart3 className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="dashboard"]',
  },
  {
    title: "Employees",
    description: "Add, edit, and manage your team. Each employee gets a unique 4-digit code they'll use to clock in via the kiosk or portal. You can set their pay rates and departments here.",
    icon: <Users className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="employees"]',
  },
  {
    title: "Roster",
    description: "Create and publish weekly rosters. Drag shifts around, set break times, and publish the roster so employees can see their upcoming shifts in the portal.",
    icon: <CalendarRange className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="roster"]',
  },
  {
    title: "Live Monitor",
    description: "See who's currently clocked in, on break, or clocked out — all in real-time. Great for keeping track of your team throughout the day.",
    icon: <Monitor className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="live"]',
  },
  {
    title: "Timesheets",
    description: "Review and approve employee timesheets. You can edit clock-in/out times, add manual entries, and all changes are tracked in the audit log.",
    icon: <CalendarDays className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="timesheets"]',
  },
  {
    title: "Payroll",
    description: "Generate payroll from approved timesheets. The system calculates hours and pay based on the rates you've set for each employee.",
    icon: <DollarSign className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="payroll"]',
  },
  {
    title: "Requests",
    description: "Employees can submit leave and unavailability requests from the portal. You'll see them here to approve or reject with notes.",
    icon: <CalendarOff className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="requests"]',
  },
  {
    title: "Forum",
    description: "Post announcements, updates, or open discussions for your team. Employees can react and comment from their portal.",
    icon: <MessageSquare className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="forum"]',
  },
  {
    title: "Kiosk Mode",
    description: "Launch the kiosk from the sidebar for a shared device (e.g. tablet at the entrance). Employees tap their code to clock in/out with optional photo capture.",
    icon: <Clock className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="kiosk"]',
  },
];

export const portalTourSteps: TourStep[] = [
  {
    title: "Welcome to the Employee Portal!",
    description: "This is your personal hub. Use your 4-digit employee code to access your shifts, timesheets, and more. Let's walk you through what's available.",
    icon: <Users className="h-5 w-5 text-primary" />,
  },
  {
    title: "Your Shifts",
    description: "View your upcoming published shifts organised by week. You'll see your start/end times, break duration, and total hours for each shift.",
    icon: <CalendarRange className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="portal-roster"]',
  },
  {
    title: "Timesheets",
    description: "Review your clock-in/out history and see your total hours worked. Approved timesheets are marked with a green tick — unapproved ones are still being reviewed.",
    icon: <CalendarDays className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="portal-timesheets"]',
  },
  {
    title: "Leave & Availability Requests",
    description: "Need time off? Submit leave or unavailability requests right from here. You can set specific dates or recurring days, and track whether your admin has approved them.",
    icon: <CalendarOff className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="portal-requests"]',
  },
  {
    title: "Forum",
    description: "Stay in the loop with company announcements. You can read posts, react with emojis, and leave comments for your team.",
    icon: <MessageSquare className="h-5 w-5 text-primary" />,
    highlight: '[data-tour="portal-forum"]',
  },
  {
    title: "Auto-Logout",
    description: "For your security, the portal will automatically log you out after 5 minutes of inactivity. Just re-enter your code to get back in!",
    icon: <Clock className="h-5 w-5 text-primary" />,
  },
];

# OmnexClock

Pro Regal Pavilion - Staff Time Clock System

Development Prompt for Full-Stack Application (Enhanced with Multi-Device Support)

Project Overview

Build a comprehensive staff time tracking and payroll management system for Pro Regal Pavilion. The application consists of two main interfaces: a kiosk mode for staff clock in/out and an admin dashboard for workforce analytics and payroll processing. The system must be fully responsive and optimized for all device types.

Developer: Omnex Ventures Pty. Ltd.
Copyright: All intellectual property rights reserved by Omnex Ventures Pty. Ltd.

Design System

Theme: Minimal, professional aesthetic
Primary Colors:

Background: Deep black (#000000, #0a0a0a)

Accent: Luxe gold (#D4AF37, #FFD700)

Text: White/off-white (#FFFFFF, #F5F5F5)

Secondary: Dark grey (#1a1a1a, #2a2a2a)

Typography: Clean, modern sans-serif fonts
UI Principles: Spacious layouts, clear hierarchy, touch-friendly buttons for kiosk mode

🎯 NEW: Dynamic Multi-Device Adaptability

Device Categories & Optimizations

1. Mobile Phones (Portrait, 320px - 480px)

Kiosk Mode:

Full-screen vertical layout

Extra-large numeric keypad for code entry

Single-column interface

Camera button prominent at bottom

Swipe gestures for navigation

Minimal text, maximum icon usage

Admin Dashboard:

Hamburger menu navigation

Collapsible sidebar

Stacked cards for analytics

Bottom navigation bar for quick access

Simplified tables with horizontal scroll

Touch-optimized dropdowns and date pickers

Pull-to-refresh for data updates

2. Tablets (iPad, Android Tablets, 768px - 1024px)

Kiosk Mode:

Landscape and portrait optimization

Large touch targets (minimum 60px)

Split-screen capability for multi-user scenarios

Grid-based keypad layout

Side-by-side confirmation panels

Admin Dashboard:

Two-column layout with collapsible sidebar

Dashboard widgets in 2x2 grid

Touch-friendly tables with swipe actions

Floating action buttons (FAB) for quick tasks

Split-view for timesheet editing

Picture-in-picture for live monitoring

3. Laptops & Desktops (1024px+)

Kiosk Mode:

Centered interface with maximum width constraint

Keyboard support for code entry

Larger preview windows for camera

Multi-column confirmation screens

Admin Dashboard:

Full sidebar navigation always visible

Multi-column layouts (3-4 columns for analytics)

Hover states and tooltips

Advanced data tables with sorting/filtering

Side panels for quick edits

Keyboard shortcuts for power users

Multi-window support

4. Large Displays (TV Screens, Kiosks, 1920px+)

Kiosk Mode:

Extra-large UI elements for distance viewing

High contrast mode

Animated transitions and confirmations

QR code support for touchless interaction

Display multiple clock-in stations simultaneously

Admin Dashboard:

Multi-dashboard view

Real-time analytics on large widgets

Video wall mode for monitoring

Split-screen for comparison views

Responsive Breakpoints

/* Mobile First Approach */
Mobile: 320px - 767px
Tablet: 768px - 1023px
Laptop: 1024px - 1439px
Desktop: 1440px - 1919px
Large Display: 1920px+


Device-Specific Features

Progressive Web App (PWA) Capabilities

Offline Functionality:

Cache clock in/out data when offline

Sync when connection restored

Local storage for employee codes

Service worker for background sync

Installation:

Add to Home Screen prompts

Native app-like experience

Custom splash screens

Push notifications for admin alerts

Device Hardware Integration:

Camera API (front/rear camera selection)

Geolocation (optional location tracking)

Biometric authentication (Face ID, Touch ID, Fingerprint)

NFC support (tap employee badges)

Bluetooth for proximity detection

Touch & Gesture Support

Tap for selection

Swipe to navigate (kiosk screens)

Pinch to zoom (photo galleries)

Long-press for context menus

Pull-to-refresh (data updates)

Drag-and-drop (timesheet editing on tablets)

Input Method Adaptability

Touch Devices: Large buttons, no hover states, swipe gestures

Mouse/Trackpad: Hover effects, context menus, drag-drop

Keyboard: Tab navigation, keyboard shortcuts, hotkeys

Stylus: Signature capture for timesheet approvals

Orientation Handling

Portrait Mode:

Vertical stacking of elements

Bottom navigation for mobile

Full-screen modals

Landscape Mode:

Side-by-side layouts

Horizontal navigation

Split-screen views

Wider data tables

Adaptive UI Components

Navigation

Mobile: Bottom tab bar + hamburger menu

Tablet: Collapsible side drawer

Desktop: Fixed sidebar with nested menus

Kiosk: Minimal navigation, auto-return to home

Data Tables

Mobile: Card-based list view with expandable details

Tablet: Responsive table with horizontal scroll

Desktop: Full-featured table with inline editing

Export: "Download" button adapts to device (share sheet on mobile)

Forms

All Devices:

Auto-focus on first field

Native date/time pickers

Dropdown vs. modal selectors based on screen size

Real-time validation with inline errors

Auto-save for drafts

Photo Capture

Mobile: Native camera app integration

Tablet: In-app camera with preview

Desktop: Webcam capture with countdown

Fallback: File upload if camera unavailable

Charts & Analytics

Mobile: Simplified charts, vertical bar graphs

Tablet: Interactive charts with touch gestures

Desktop: Advanced visualizations with hover tooltips

Large Display: Real-time animated dashboards

Performance Optimization for Devices

Mobile Optimization

Lazy loading of images and components

Reduced animations on low-power mode

Compressed image formats (WebP)

Code splitting for faster initial load

Minimal JavaScript bundle size

Network Adaptability

Detect connection speed (4G, 5G, WiFi)

Load high-res images only on fast connections

Reduce API call frequency on slow networks

Progressive image loading

Offline-first architecture

Battery Considerations

Reduce background tasks on mobile

Disable auto-refresh when battery is low

Dark mode optimization for OLED screens

Throttle animations and transitions

Core Features & Requirements

1. Authentication & Access Control

Admin Login: Secure authentication with username/password

Multi-Device Sessions: Same admin can log in on multiple devices

Kiosk Mode: Admin-only access to launch kiosk interface

Employee Codes: Unique numeric/alphanumeric codes assigned by admin for clock in/out

Biometric Options: Face ID, Touch ID, fingerprint (where available)

Session Management: Secure sessions with timeout handling, device-specific timeouts

2. Kiosk Interface (Staff-Facing)

Adaptive Layout:

Auto-detects device and optimizes interface

Adjusts button sizes based on screen dimensions

Font scaling for readability at different distances

Clock In/Out Flow:

Large, touch-friendly interface

Employee enters their assigned code (or uses NFC badge)

Camera captures photo automatically on clock in/out

Display current time and date prominently

Confirmation screen showing action completed

Automatic return to code entry screen

Mobile: Haptic feedback on button press

Tablet: Sound confirmation option

Desktop: Keyboard shortcuts (Enter to confirm)

Break Management:

"Start Break" and "End Break" buttons

Photo capture on break start and end

Visual indication of break status

Multiple breaks per shift support

Mobile: Quick action buttons

Desktop: Timer display with seconds

UI Elements:

Minimal distractions, focus on essential actions

Large buttons with gold borders/highlights

Real-time clock display

Clear status indicators (clocked in, on break, clocked out)

Accessibility: Voice feedback option for visually impaired

3. Admin Dashboard

Responsive Dashboard Layout:

Mobile: Single-column cards, bottom navigation

Tablet: 2-column grid, side drawer

Desktop: 3-4 column grid, fixed sidebar

Large Display: Multi-dashboard view

A. Employee Management

Add/edit/deactivate employees

Assign unique clock-in codes

Set individual pay rates (flat hourly rate)

Employee profiles with photo history

Bulk import/export employee data

Mobile: Swipe actions for quick edit/delete

Desktop: Inline editing in tables

Search: Predictive search across all devices

B. Live Monitoring

Real-time view of who's clocked in

Current shift duration display

Active break status

Live photo feed of recent clock ins/outs

Mobile: Refreshable cards

Tablet/Desktop: Auto-updating grid view

Large Display: Video wall mode

C. Timesheet Management

Calendar view with daily/weekly/monthly filters

Individual employee timesheet view

Edit capabilities for corrections (with audit trail)

Automatic calculation of:

Total hours worked

Break durations

Net working hours (hours - breaks)

Mobile: Swipeable calendar, modal editors

Tablet: Split-screen calendar + details

Desktop: Side panel for quick edits

D. Payroll Calculation

Select date range (weekly pay periods)

Automatic calculation: Net Hours × Pay Rate = Wages

Individual and batch payroll reports

Summary totals per employee and overall

Mobile: Simplified summary cards

Tablet/Desktop: Detailed breakdown tables

E. Analytics & Reporting

Dashboard widgets:

Total hours worked (daily/weekly/monthly)

Average shift duration

Peak clock-in/out times

Break duration analytics

Labor cost summaries

Visual charts (bar graphs, line charts, pie charts)

Filterable by date range, employee, department (if applicable)

Mobile: Simplified charts, tap to expand

Tablet: Interactive charts with gestures

Desktop: Advanced filters and drill-down

F. Data Export

Download formats: CSV, Excel, PDF

Exportable data:

Full timesheet records with photos

Payroll summaries

Individual employee reports

Custom date range exports

Audit logs

Mobile: Share sheet integration

Desktop: Direct download or email

G. Photo Management

Gallery view of all clock in/out photos

Timestamp and employee name overlay

Search and filter by employee/date

Photo storage with compression

Mobile: Grid view, pinch to zoom

Tablet: Lightbox gallery

Desktop: Advanced filtering and bulk actions

4. Technical Specifications

Frontend:

React/Next.js for responsive UI

CSS Framework: Tailwind CSS with custom breakpoints

State management (React Context or Redux)

Camera API integration for photo capture

Responsive design with mobile-first approach

Progressive Web App (PWA) capabilities

Service Worker for offline functionality

Touch event handling library (Hammer.js or React Touch)

Backend:

Node.js/Express or Python/FastAPI

RESTful API architecture

JWT authentication with device fingerprinting

Database: PostgreSQL or MongoDB

Image storage: AWS S3 or local filesystem with backup

WebSocket for real-time updates (admin dashboard)

Rate limiting per device type

Device Detection & Optimization:

User-Agent parsing

Feature detection (camera, geolocation, biometrics)

Screen size and resolution detection

Connection speed detection

Battery status detection (where available)

Adaptive media queries

Database Schema Requirements:

Employees table (id, name, code, pay_rate, active_status, created_at)

Clock_events table (id, employee_id, event_type [clock_in/out, break_start/end], timestamp, photo_url, device_info)

Admin_users table (id, username, password_hash, permissions, devices)

Audit_logs table (id, admin_id, action, timestamp, details, device_type)

Device_sessions table (id, user_id, device_fingerprint, last_active, ip_address)

Security:

Encrypted employee codes

Hashed admin passwords

HTTPS enforcement

SQL injection prevention

XSS protection

CORS configuration

Rate limiting on authentication endpoints (stricter on mobile)

Device fingerprinting for suspicious activity detection

SSL pinning for mobile apps

Performance Monitoring:

Track load times per device type

Monitor API response times

Error tracking with device context

Analytics on device usage patterns

5. Key Calculations

Shift Duration = Clock Out Time - Clock In Time
Total Break Time = Sum of (Break End - Break Start)
Net Working Hours = Shift Duration - Total Break Time
Weekly Wage = Sum of (Net Working Hours per Day) × Pay Rate


6. User Flows

Kiosk - Clock In (Mobile):

Open PWA on phone

Enter employee code via numeric keypad

System validates code

Tap "Take Photo" button

Front camera activates

Photo captured automatically

Haptic feedback + visual confirmation

Show "Clocked In - [Name]" for 3 seconds

Return to entry screen

Kiosk - Clock In (Tablet/Desktop):

Launch kiosk mode

Enter employee code (touch or keyboard)

System validates code

Camera captures photo automatically

Record timestamp with device info

Show confirmation "Clocked In - [Name]"

Return to entry screen after 3 seconds

Admin - Weekly Payroll (Mobile):

Tap "Payroll" in bottom navigation

Swipe to select week

System calculates all employee hours

Tap employee card to expand details

Tap "Export" button

Select format (CSV/PDF)

Use native share sheet to email/download

Admin - Weekly Payroll (Desktop):

Navigate to Payroll section

Select week date range from calendar

System calculates all employee hours

Review individual timesheets in table

Export payroll report

Download CSV/PDF or email directly

7. Additional Requirements

Responsive design optimized for all devices

Touch, mouse, and keyboard support

Loading states and error handling

Toast notifications for user feedback

Timezone handling for accurate timestamps

Automatic daily backup of data

Print-friendly timesheet views

Accessibility: WCAG 2.1 AA compliance

Screen reader support

High contrast mode

Font size adjustments

Keyboard navigation

Voice commands (optional)

Cross-Device Features

Synchronization

Real-time sync across all logged-in admin devices

Conflict resolution for simultaneous edits

Push notifications for important events

WebSocket connections for live updates

Device-Specific Settings

Save user preferences per device type

Remember last used filters and views

Device-specific notification preferences

Kiosk mode auto-launch on designated devices

Handoff & Continuity

Start task on mobile, continue on desktop

Share links between devices for same user

Cross-device clipboard for copying data

QR code generation for quick device transfers

Testing Requirements

Device Testing Matrix

iPhone (iOS 15+): Safari, Chrome

iPad (iPadOS 15+): Safari, Chrome

Android Phone (Android 10+): Chrome, Samsung Internet

Android Tablet: Chrome

Windows PC: Chrome, Edge, Firefox

MacBook: Safari, Chrome, Firefox

Smart TV / Large Kiosk Displays

Responsive Testing Tools

Chrome DevTools Device Emulation

BrowserStack for real device testing

Lighthouse for performance audits

Manual testing on physical devices

Deliverables

Fully functional web application (PWA)

Admin dashboard with all analytics (responsive)

Kiosk interface optimized for all devices

Database with sample data

API documentation

Deployment guide

User manual for admin functions

Device compatibility matrix

Performance optimization report

Branding

Application Name: Pro Regal Pavilion Time Clock
Footer/Credits: © 2024 Omnex Ventures Pty. Ltd. All rights reserved.
Logo Placement: Top-left corner of admin dashboard and kiosk screens (black background with gold logo) Adaptive Logo: Logo resizes based on device screen size

Success Metrics

Load time < 2 seconds on 4G mobile

Touch target size minimum 48x48px (60px preferred)

100% keyboard navigable

Lighthouse score: 90+ (Performance, Accessibility)

Works offline for clock in/out

Responsive on screens from 320px to 4K displays

This enhanced prompt now includes comprehensive multi-device support with dynamic adaptability for mobile phones, tablets, laptops, desktops, and large displays. The application will automatically optimize its interface and functionality based on the device being used.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://omnexclock.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96f604f8-463b-4d06-9e68-f2deb40ac990).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

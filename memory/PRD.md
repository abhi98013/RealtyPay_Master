# RealtyPay - Real Estate Payment Management & Communication Web App

## Problem Statement
Build a fully functional Real Estate Payment Management & Communication Web App with JWT auth, customer/property management, payment tracker matrix, WhatsApp notifications (mock), brand customization, dashboard, and PDF reports.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Recharts
- **Backend**: FastAPI (Python) + MongoDB (Motor async)
- **Auth**: JWT with httpOnly cookies + Bearer token, roles: Admin, Agent, Viewer
- **Storage**: Emergent Object Storage (for brand logos)
- **PDF**: ReportLab (server-side)
- **WhatsApp**: MOCK mode (full UI, message templates, delivery tracking - no real Twilio)

## User Personas
- **Admin**: Full access - manage customers, payments, brand settings, send messages
- **Agent**: Collection agent - view customers, record payments, send messages
- **Viewer**: Read-only - view dashboard, reports

## Core Requirements
- Customer management with property/EMI details
- Payment tracker month×customer matrix
- WhatsApp message templates (payment received, reminders, overdue alerts, etc.)
- Brand customization (logo, colors, name, tagline)
- Dashboard with collection stats, trend chart, overdue alerts
- PDF export for monthly reports and annual statements
- Penalty calculation (configurable % per day)

## What's Been Implemented (April 19, 2026)
### Phase 1 (March 30, 2026) - Core MVP
- JWT authentication with admin seeding (Admin/Agent/Viewer roles)
- Customer CRUD with auto-generated EMI payment slots
- Payment management (full/partial/waived/overdue detection)
- Payment tracker matrix (month×customer)
- Dashboard with stats, charts, quick actions
- Brand settings + logo upload (Emergent Object Storage)
- WhatsApp mock messaging (6 templates, bulk send)
- PDF report generation (monthly + annual statement)

### Phase 2 (April 19, 2026) - Plot Management & SMS
- **Module 1**: Interactive Plot Layout Management - layouts CRUD, plots with dimensions/pricing/type, visual canvas with colored tiles (green=available, red=sold, amber=reserved), hover tooltips, plot detail sheet
- **Module 2**: Map Upload - PDF/Image upload per layout, zoom in/out, download, file type & size validation
- **Module 3**: Plot-wise Statement - detailed per-plot statement with customer info, payment history, PDF export with signature line
- **Module 4**: SMS via Fast2SMS - individual send, bulk send, phone validation (10-digit Indian mobile), 160-char limit, message history, delivery status tracking
- **Module 5**: Cash Flow Dashboard - revenue/outstanding/sold stats, monthly collection trend chart, payment mode pie chart, period statements (monthly/half-yearly/yearly/custom)
- Audit log for critical actions (delete, status change, payment edit)
- N+1 query optimizations for production performance

## Prioritized Backlog
### P0 (Critical - Done)
- [x] Auth + admin seeding
- [x] Customer CRUD
- [x] Payment tracking + matrix
- [x] Dashboard stats

### P1 (Important - Partially Done)
- [x] WhatsApp MOCK messaging
- [x] Brand settings + logo upload
- [x] PDF monthly report
- [ ] Real Twilio WhatsApp integration (needs API keys)
- [ ] Scheduled auto-reminders (3 days before, on, 2 days after due)

### P2 (Nice to Have)
- [ ] Excel export (openpyxl installed, endpoint not yet)
- [ ] Role-based UI restrictions (all roles see same UI currently)
- [ ] Collection agent mobile-optimized view
- [ ] Legal notice generation (60+ day overdue)
- [ ] Multiple properties per customer
- [ ] Completion certificate generation
- [ ] Annual statement share via WhatsApp link

## Next Tasks
1. Connect real Twilio WhatsApp Business API (user needs to provide keys)
2. Implement scheduled auto-reminders
3. Add Excel export
4. Role-based UI visibility (hide admin features from agents/viewers)
5. Mobile-optimized collection agent view

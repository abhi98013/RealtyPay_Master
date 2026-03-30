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

## What's Been Implemented (March 30, 2026)
### Backend
- JWT authentication with admin seeding
- Customer CRUD with auto-generated payment slots
- Payment management (full/partial/waived/overdue detection)
- Payment matrix API
- Dashboard statistics API
- Brand settings CRUD + logo upload (Emergent Object Storage)
- WhatsApp mock messaging (6 template types, bulk send)
- PDF report generation (monthly + annual statement)

### Frontend
- Login/Register page with tabs
- Dashboard with 4 stat cards, area chart, top overdue list, quick actions
- Customers list with search + add customer dialog
- Customer profile with payment history + WhatsApp message logs tabs
- Payment tracker matrix (year-based, click cell to record payment via Sheet)
- WhatsApp Center (bulk select, message type, send, message log)
- Brand Settings (name, tagline, colors, logo upload, live preview)
- Reports page (monthly PDF download)
- Responsive sidebar layout

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

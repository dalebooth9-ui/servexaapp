
# Field Engineer Report Collection System

## Overview
A web application that integrates with WhatsApp Business API to automatically receive field reports (photos, text notes, documents, and location data) from engineers, organizes everything by job/project, and provides a dashboard for both engineers and office staff to view and manage submissions.

## Core Features

### 1. WhatsApp Integration (Incoming Messages)
- Connect to WhatsApp Business API (via a provider like Twilio or Meta Cloud API) to receive messages from engineers
- Engineers send photos, text notes, PDFs, and location pins to a dedicated WhatsApp Business number
- Engineers identify which job/project a submission belongs to (e.g., by texting a job reference number before sending files)
- The system automatically processes and stores incoming media and text

### 2. Job/Project Management
- Create and manage jobs/projects with a name, reference number, client, address, and status
- Each job acts as a "folder" where all related submissions are collected
- Assign engineers to specific jobs

### 3. Submissions Dashboard
- View all submissions organized by job/project
- Filter by engineer, date range, or submission type (photo, note, document)
- Preview photos and documents inline
- View location data on a map pin
- Download all files for a job as a batch

### 4. User Roles
- **Admin/Office staff**: Can create jobs, view all submissions across all engineers, manage engineers
- **Engineers**: Can view their own submissions and the jobs they're assigned to

### 5. Engineer Directory
- List of field engineers with their names, WhatsApp numbers, and assigned jobs
- Link WhatsApp numbers to user accounts so the system knows who sent what

## Pages
1. **Login page** — Simple authentication
2. **Dashboard** — Overview of recent submissions, active jobs, quick stats
3. **Jobs list** — All projects with status and submission counts
4. **Job detail** — All photos, notes, documents, and location data for a specific job, organized chronologically
5. **Engineers** — Manage engineer profiles and assignments (admin only)
6. **Settings** — WhatsApp API configuration

## Backend Requirements
- **Database** to store jobs, engineers, and submission records
- **File storage** for photos and documents received via WhatsApp
- **Edge function** to receive WhatsApp webhook messages and process them
- **Authentication** for login and role-based access

This will require connecting to Lovable Cloud or Supabase for the backend (database, file storage, and edge functions), plus a WhatsApp Business API provider (like Twilio or Meta Cloud API) for receiving messages.

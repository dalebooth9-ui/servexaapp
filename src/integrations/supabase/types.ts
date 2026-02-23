export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      asset_documents: {
        Row: {
          asset_id: string
          created_at: string
          document_type: string
          expiry_date: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          notes: string | null
          uploaded_by: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          notes?: string | null
          uploaded_by: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          notes?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_documents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          install_date: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          site_id: string | null
          status: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          install_date?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          install_date?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      audit_responses: {
        Row: {
          audit_id: string
          id: string
          item_id: string
          notes: string | null
          photo_url: string | null
          result: string
        }
        Insert: {
          audit_id: string
          id?: string
          item_id: string
          notes?: string | null
          photo_url?: string | null
          result?: string
        }
        Update: {
          audit_id?: string
          id?: string
          item_id?: string
          notes?: string | null
          photo_url?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_responses_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "audit_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_template_items: {
        Row: {
          id: string
          item_type: string
          question: string
          required: boolean
          sort_order: number
          template_id: string
        }
        Insert: {
          id?: string
          item_type?: string
          question: string
          required?: boolean
          sort_order?: number
          template_id: string
        }
        Update: {
          id?: string
          item_type?: string
          question?: string
          required?: boolean
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      audits: {
        Row: {
          asset_id: string | null
          auditor_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          score_percent: number | null
          site_id: string | null
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          auditor_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          score_percent?: number | null
          site_id?: string | null
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          auditor_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          score_percent?: number | null
          site_id?: string | null
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_records: {
        Row: {
          asset_id: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          file_name: string | null
          file_url: string | null
          id: string
          issue_date: string | null
          issuer: string | null
          notes: string | null
          record_type: string
          reference_number: string | null
          site_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string | null
          record_type?: string
          reference_number?: string | null
          site_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          issue_date?: string | null
          issuer?: string | null
          notes?: string | null
          record_type?: string
          reference_number?: string | null
          site_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_records_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notification_log: {
        Row: {
          customer_email: string
          id: string
          job_id: string | null
          notification_type: string
          sent_at: string
          subject: string
        }
        Insert: {
          customer_email: string
          id?: string
          job_id?: string | null
          notification_type: string
          sent_at?: string
          subject: string
        }
        Update: {
          customer_email?: string
          id?: string
          job_id?: string | null
          notification_type?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notification_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_sign_off_tokens: {
        Row: {
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string
          expires_at: string
          id: string
          job_id: string
          signed_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name?: string
          expires_at?: string
          id?: string
          job_id: string
          signed_at?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string
          expires_at?: string
          id?: string
          job_id?: string
          signed_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sign_off_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: []
      }
      engineer_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fault_codes: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          priority: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
        }
        Relationships: []
      }
      field_reports: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          job_id: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string
          created_at?: string
          id?: string
          job_id: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          job_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description?: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          document_type: string
          due_date: string | null
          id: string
          invoice_number: string
          job_id: string | null
          notes: string | null
          paid_at: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          xero_invoice_id: string | null
          xero_synced_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          document_type?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          xero_invoice_id?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          document_type?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          job_id?: string | null
          notes?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          xero_invoice_id?: string | null
          xero_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          job_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          job_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          assigned_at: string
          engineer_id: string
          id: string
          job_id: string
        }
        Insert: {
          assigned_at?: string
          engineer_id: string
          id?: string
          job_id: string
        }
        Update: {
          assigned_at?: string
          engineer_id?: string
          id?: string
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_assignments_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      job_parts: {
        Row: {
          added_by: string
          created_at: string
          id: string
          job_id: string
          name: string
          notes: string | null
          quantity: number
          sell_price: number
          sort_order: number
          total_cost: number | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          added_by: string
          created_at?: string
          id?: string
          job_id: string
          name: string
          notes?: string | null
          quantity?: number
          sell_price?: number
          sort_order?: number
          total_cost?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          added_by?: string
          created_at?: string
          id?: string
          job_id?: string
          name?: string
          notes?: string | null
          quantity?: number
          sell_price?: number
          sort_order?: number
          total_cost?: number | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_schedule: {
        Row: {
          created_at: string
          created_by: string | null
          engineer_id: string
          id: string
          job_id: string
          notes: string | null
          schedule_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engineer_id: string
          id?: string
          job_id: string
          notes?: string | null
          schedule_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engineer_id?: string
          id?: string
          job_id?: string
          notes?: string | null
          schedule_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_schedule_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_responses: {
        Row: {
          created_at: string
          id: string
          job_id: string
          responses: Json
          status: string
          submitted_at: string | null
          submitted_by: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          responses?: Json
          status?: string
          submitted_at?: string | null
          submitted_by: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          responses?: Json
          status?: string
          submitted_at?: string | null
          submitted_by?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sheet_responses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_templates: {
        Row: {
          branding: Json | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          id: string
          locked: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branding?: Json | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          locked?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branding?: Json | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          id?: string
          locked?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_signatures: {
        Row: {
          created_at: string
          file_path: string
          id: string
          job_id: string
          signer_id: string
          signer_name: string
          signer_role: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          job_id: string
          signer_id: string
          signer_name?: string
          signer_role?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          job_id?: string
          signer_id?: string
          signer_name?: string
          signer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_visits: {
        Row: {
          completed_at: string | null
          created_at: string
          engineer_id: string | null
          id: string
          job_id: string
          notes: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          engineer_id?: string | null
          id?: string
          job_id: string
          notes?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          engineer_id?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_visits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string | null
          asset_id: string | null
          category: string
          created_at: string
          created_by: string | null
          customer: string | null
          customer_id: string | null
          fault_code_id: string | null
          id: string
          job_type: string
          name: string
          pressure_test_qty: number
          priority: string
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_start_date: string | null
          recurrence_unit: string | null
          reference_number: string
          result: string | null
          site_id: string | null
          status: string
          updated_at: string
          visual_qty: number
        }
        Insert: {
          address?: string | null
          asset_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_id?: string | null
          fault_code_id?: string | null
          id?: string
          job_type?: string
          name: string
          pressure_test_qty?: number
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_start_date?: string | null
          recurrence_unit?: string | null
          reference_number?: string
          result?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          visual_qty?: number
        }
        Update: {
          address?: string | null
          asset_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_id?: string | null
          fault_code_id?: string | null
          id?: string
          job_type?: string
          name?: string
          pressure_test_qty?: number
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_start_date?: string | null
          recurrence_unit?: string | null
          reference_number?: string
          result?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          visual_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_fault_code_id_fkey"
            columns: ["fault_code_id"]
            isOneToOne: false
            referencedRelation: "fault_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          message: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          message: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_library: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          part_number: string | null
          sell_price: number
          supplier: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          part_number?: string | null
          sell_price?: number
          supplier?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          part_number?: string | null
          sell_price?: number
          supplier?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      ppm_schedules: {
        Row: {
          asset_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          frequency_interval: number
          frequency_unit: string
          id: string
          last_generated_at: string | null
          next_due_date: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency_interval?: number
          frequency_unit?: string
          id?: string
          last_generated_at?: string | null
          next_due_date: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          frequency_interval?: number
          frequency_unit?: string
          id?: string
          last_generated_at?: string | null
          next_due_date?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppm_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          parent_id: string | null
          postcode: string | null
          site_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          parent_id?: string | null
          postcode?: string | null
          site_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          parent_id?: string | null
          postcode?: string | null
          site_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_comments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          content: string | null
          created_at: string
          engineer_id: string
          file_name: string | null
          file_url: string | null
          id: string
          job_id: string
          latitude: number | null
          longitude: number | null
          type: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          engineer_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id: string
          latitude?: number | null
          longitude?: number | null
          type: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          engineer_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id?: string
          latitude?: number | null
          longitude?: number | null
          type?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      xero_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          refresh_token: string
          tenant_id: string
          tenant_name: string | null
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          refresh_token: string
          tenant_id: string
          tenant_name?: string | null
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          refresh_token?: string
          tenant_id?: string
          tenant_name?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_vfp_reference: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      nextval_ppm_seq: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "engineer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "engineer"],
    },
  },
} as const

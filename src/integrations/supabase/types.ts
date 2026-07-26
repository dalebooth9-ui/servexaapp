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
      ai_wizard_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          org_id: string
          page_context: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          org_id?: string
          page_context?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          org_id?: string
          page_context?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_wizard_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_wizard_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          org_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          org_id?: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          org_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_documents: {
        Row: {
          created_at: string
          customer_id: string | null
          document_date: string | null
          document_type: string | null
          extracted: Json
          file_paths: string[]
          filed_at: string
          filed_by: string | null
          header_data: Json
          id: string
          notes: string | null
          org_id: string
          page_count: number
          report_pdf_path: string | null
          site_address: string | null
          site_id: string | null
          site_name: string | null
          source_batch_id: string | null
          source_item_id: string | null
          status: string
          template_id: string | null
          template_name: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          document_date?: string | null
          document_type?: string | null
          extracted?: Json
          file_paths?: string[]
          filed_at?: string
          filed_by?: string | null
          header_data?: Json
          id?: string
          notes?: string | null
          org_id: string
          page_count?: number
          report_pdf_path?: string | null
          site_address?: string | null
          site_id?: string | null
          site_name?: string | null
          source_batch_id?: string | null
          source_item_id?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          document_date?: string | null
          document_type?: string | null
          extracted?: Json
          file_paths?: string[]
          filed_at?: string
          filed_by?: string | null
          header_data?: Json
          id?: string
          notes?: string | null
          org_id?: string
          page_count?: number
          report_pdf_path?: string | null
          site_address?: string | null
          site_id?: string | null
          site_name?: string | null
          source_batch_id?: string | null
          source_item_id?: string | null
          status?: string
          template_id?: string | null
          template_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "archived_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archived_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "asset_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_review_flags: {
        Row: {
          asset_id: string
          created_at: string
          field: string
          id: string
          job_id: string | null
          job_sheet_response_id: string | null
          new_value: string | null
          old_value: string | null
          org_id: string | null
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          field: string
          id?: string
          job_id?: string | null
          job_sheet_response_id?: string | null
          new_value?: string | null
          old_value?: string | null
          org_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          field?: string
          id?: string
          job_id?: string | null
          job_sheet_response_id?: string | null
          new_value?: string | null
          old_value?: string | null
          org_id?: string | null
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_review_flags_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_sensors: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_active: boolean
          last_reading_at: string | null
          last_value: number | null
          max_critical: number | null
          max_normal: number | null
          min_critical: number | null
          min_normal: number | null
          name: string
          org_id: string
          sensor_type: string
          unit: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_reading_at?: string | null
          last_value?: number | null
          max_critical?: number | null
          max_normal?: number | null
          min_critical?: number | null
          min_normal?: number | null
          name: string
          org_id?: string
          sensor_type?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_reading_at?: string | null
          last_value?: number | null
          max_critical?: number | null
          max_normal?: number | null
          min_critical?: number | null
          min_normal?: number | null
          name?: string
          org_id?: string
          sensor_type?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_sensors_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_sensors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_sensors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_service_history: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          inspection_date: string | null
          inspection_type: string | null
          job_id: string | null
          job_sheet_response_id: string | null
          org_id: string | null
          outlets_count: number | null
          result_summary: string | null
          riser_location: string | null
          template_id: string | null
          template_name: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          job_id?: string | null
          job_sheet_response_id?: string | null
          org_id?: string | null
          outlets_count?: number | null
          result_summary?: string | null
          riser_location?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          inspection_date?: string | null
          inspection_type?: string | null
          job_id?: string | null
          job_sheet_response_id?: string | null
          org_id?: string | null
          outlets_count?: number | null
          result_summary?: string | null
          riser_location?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_service_history_asset_id_fkey"
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
          asset_type: string | null
          attributes: Json
          category: string
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          install_date: string | null
          last_inspection_at: string | null
          last_inspection_result: string | null
          last_inspection_type: string | null
          last_job_id: string | null
          last_job_sheet_response_id: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          org_id: string | null
          outlets_count: number | null
          riser_location: string | null
          serial_number: string | null
          site_id: string | null
          status: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag?: string | null
          asset_type?: string | null
          attributes?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          install_date?: string | null
          last_inspection_at?: string | null
          last_inspection_result?: string | null
          last_inspection_type?: string | null
          last_job_id?: string | null
          last_job_sheet_response_id?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          org_id?: string | null
          outlets_count?: number | null
          riser_location?: string | null
          serial_number?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string | null
          asset_type?: string | null
          attributes?: Json
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          install_date?: string | null
          last_inspection_at?: string | null
          last_inspection_result?: string | null
          last_inspection_type?: string | null
          last_job_id?: string | null
          last_job_sheet_response_id?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          org_id?: string | null
          outlets_count?: number | null
          riser_location?: string | null
          serial_number?: string | null
          site_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
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
          org_id: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          org_id: string | null
          resource_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_responses: {
        Row: {
          audit_id: string
          id: string
          item_id: string
          notes: string | null
          org_id: string
          photo_url: string | null
          result: string
        }
        Insert: {
          audit_id: string
          id?: string
          item_id: string
          notes?: string | null
          org_id?: string
          photo_url?: string | null
          result?: string
        }
        Update: {
          audit_id?: string
          id?: string
          item_id?: string
          notes?: string | null
          org_id?: string
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
          {
            foreignKeyName: "audit_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          asset_id: string | null
          auditor_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            foreignKeyName: "audits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
      bank_holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          region: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          region?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          region?: string
        }
        Relationships: []
      }
      category_document_templates: {
        Row: {
          category_slug: string
          created_at: string
          created_by: string | null
          description: string | null
          document_type: string
          enabled: boolean
          file_name: string | null
          file_url: string | null
          id: string
          label: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_slug: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type: string
          enabled?: boolean
          file_name?: string | null
          file_url?: string | null
          id?: string
          label?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_slug?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_type?: string
          enabled?: boolean
          file_name?: string | null
          file_url?: string | null
          id?: string
          label?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          context: Json
          created_at: string
          id: string
          message: string
          org_id: string | null
          page_url: string | null
          route: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          message: string
          org_id?: string | null
          page_url?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          message?: string
          org_id?: string | null
          page_url?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_errors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_errors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_records: {
        Row: {
          ai_extracted_fields: string[] | null
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
          org_id: string | null
          record_type: string
          reference_number: string | null
          site_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ai_extracted_fields?: string[] | null
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
          org_id?: string | null
          record_type?: string
          reference_number?: string | null
          site_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ai_extracted_fields?: string[] | null
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
          org_id?: string | null
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
            foreignKeyName: "compliance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
      conformity_certificates: {
        Row: {
          certificate_number: string
          created_at: string
          created_by: string | null
          customer_name: string
          engineer_name: string
          engineer_signature: string | null
          id: string
          inlet_qty: number
          installation_date: string
          issue_date: string
          job_id: string
          job_name: string
          org_id: string
          outlet_qty: number
          pressure_bar: number
          pressure_duration: number
          reference_number: string
          riser_locations: string
          sign_date: string
          site_address: string
          status: string
          system_qty: number
          test_notes: string
          test_outcome: string
          updated_at: string
        }
        Insert: {
          certificate_number?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          engineer_name?: string
          engineer_signature?: string | null
          id?: string
          inlet_qty?: number
          installation_date?: string
          issue_date?: string
          job_id: string
          job_name?: string
          org_id?: string
          outlet_qty?: number
          pressure_bar?: number
          pressure_duration?: number
          reference_number?: string
          riser_locations?: string
          sign_date?: string
          site_address?: string
          status?: string
          system_qty?: number
          test_notes?: string
          test_outcome?: string
          updated_at?: string
        }
        Update: {
          certificate_number?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          engineer_name?: string
          engineer_signature?: string | null
          id?: string
          inlet_qty?: number
          installation_date?: string
          issue_date?: string
          job_id?: string
          job_name?: string
          org_id?: string
          outlet_qty?: number
          pressure_bar?: number
          pressure_duration?: number
          reference_number?: string
          riser_locations?: string
          sign_date?: string
          site_address?: string
          status?: string
          system_qty?: number
          test_notes?: string
          test_outcome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conformity_certificates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conformity_certificates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conformity_certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conformity_certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          org_id?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          org_id?: string
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
          {
            foreignKeyName: "customer_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_merge_suggestions: {
        Row: {
          created_at: string
          existing_customer_id: string
          id: string
          incoming_name: string
          new_customer_id: string | null
          org_id: string
          related_job_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          similarity: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          existing_customer_id: string
          id?: string
          incoming_name: string
          new_customer_id?: string | null
          org_id?: string
          related_job_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity: number
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          existing_customer_id?: string
          id?: string
          incoming_name?: string
          new_customer_id?: string | null
          org_id?: string
          related_job_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_merge_suggestions_existing_customer_id_fkey"
            columns: ["existing_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_suggestions_new_customer_id_fkey"
            columns: ["new_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_suggestions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_merge_suggestions_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
          org_id: string
          sent_at: string
          subject: string
        }
        Insert: {
          customer_email: string
          id?: string
          job_id?: string | null
          notification_type: string
          org_id?: string
          sent_at?: string
          subject: string
        }
        Update: {
          customer_email?: string
          id?: string
          job_id?: string | null
          notification_type?: string
          org_id?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notification_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notification_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_paperwork: {
        Row: {
          auto_attach: boolean
          created_at: string
          customer_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          label: string
          org_id: string
          shareable_with_customer: boolean
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          auto_attach?: boolean
          created_at?: string
          customer_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          label?: string
          org_id?: string
          shareable_with_customer?: boolean
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          auto_attach?: boolean
          created_at?: string
          customer_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          label?: string
          org_id?: string
          shareable_with_customer?: boolean
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_paperwork_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_paperwork_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_invites: {
        Row: {
          created_at: string
          customer_id: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_invites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_tokens: {
        Row: {
          created_at: string
          created_by: string
          customer_email: string
          customer_id: string
          expires_at: string
          id: string
          is_active: boolean
          last_accessed: string | null
          org_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_email: string
          customer_id: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed?: string | null
          org_id?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_email?: string
          customer_id?: string
          expires_at?: string
          id?: string
          is_active?: boolean
          last_accessed?: string | null
          org_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_users: {
        Row: {
          accepted_at: string | null
          created_at: string
          customer_id: string
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          customer_id: string
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          customer_id?: string
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
          signed_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sign_off_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sign_off_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sign_off_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sign_off_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_sites: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          org_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          org_id?: string
          site_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          org_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_sites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          accreditation_logos: string[]
          address: string | null
          brand_colour: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          logo_url: string | null
          name: string
          org_id: string | null
          phone: string | null
          renewal_reminders_opt_out: boolean
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          accreditation_logos?: string[]
          address?: string | null
          brand_colour?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          logo_url?: string | null
          name: string
          org_id?: string | null
          phone?: string | null
          renewal_reminders_opt_out?: boolean
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          accreditation_logos?: string[]
          address?: string | null
          brand_colour?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          logo_url?: string | null
          name?: string
          org_id?: string | null
          phone?: string | null
          renewal_reminders_opt_out?: boolean
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          asset_id: string | null
          bs_standard_reference: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          job_id: string | null
          location_on_site: string | null
          org_id: string
          photo_url: string | null
          photos: Json
          quote_id: string | null
          remedial_job_id: string | null
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          site_id: string | null
          source_archived_document_id: string | null
          source_kind: string
          source_response_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          bs_standard_reference?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          location_on_site?: string | null
          org_id?: string
          photo_url?: string | null
          photos?: Json
          quote_id?: string | null
          remedial_job_id?: string | null
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          site_id?: string | null
          source_archived_document_id?: string | null
          source_kind?: string
          source_response_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          bs_standard_reference?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          location_on_site?: string | null
          org_id?: string
          photo_url?: string | null
          photos?: Json
          quote_id?: string | null
          remedial_job_id?: string | null
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          site_id?: string | null
          source_archived_document_id?: string | null
          source_kind?: string
          source_response_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defects_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_remedial_job_id_fkey"
            columns: ["remedial_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_remedial_job_id_fkey"
            columns: ["remedial_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_source_archived_document_id_fkey"
            columns: ["source_archived_document_id"]
            isOneToOne: false
            referencedRelation: "archived_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_source_response_id_fkey"
            columns: ["source_response_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_twin_health: {
        Row: {
          ai_summary: string | null
          anomalies: Json
          asset_id: string
          created_at: string
          failure_probability: number | null
          health_score: number
          id: string
          last_analysed_at: string
          org_id: string
          predicted_failure_at: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          anomalies?: Json
          asset_id: string
          created_at?: string
          failure_probability?: number | null
          health_score?: number
          id?: string
          last_analysed_at?: string
          org_id?: string
          predicted_failure_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          anomalies?: Json
          asset_id?: string
          created_at?: string
          failure_probability?: number | null
          health_score?: number
          id?: string
          last_analysed_at?: string
          org_id?: string
          predicted_failure_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_twin_health_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: true
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_twin_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_twin_health_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_branding: {
        Row: {
          accreditation_logo_urls: string[]
          address: string | null
          brand_color: string
          company_name: string
          created_at: string
          footer_note: string | null
          from_address: string
          from_name: string
          id: string
          logo_url: string | null
          org_id: string
          phone: string | null
          reply_to: string
          sign_off_text: string
          signature_html: string | null
          strapline: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          accreditation_logo_urls?: string[]
          address?: string | null
          brand_color?: string
          company_name?: string
          created_at?: string
          footer_note?: string | null
          from_address?: string
          from_name?: string
          id?: string
          logo_url?: string | null
          org_id: string
          phone?: string | null
          reply_to?: string
          sign_off_text?: string
          signature_html?: string | null
          strapline?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          accreditation_logo_urls?: string[]
          address?: string | null
          brand_color?: string
          company_name?: string
          created_at?: string
          footer_note?: string | null
          from_address?: string
          from_name?: string
          id?: string
          logo_url?: string | null
          org_id?: string
          phone?: string | null
          reply_to?: string
          sign_off_text?: string
          signature_html?: string | null
          strapline?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_branding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_branding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_from_settings: {
        Row: {
          email_type: string
          from_address: string
          from_name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          email_type: string
          from_address: string
          from_name?: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          email_type?: string
          from_address?: string
          from_name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_from_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_from_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          org_id: string
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          org_id?: string
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          org_id?: string
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_send_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          org_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          org_id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          org_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_documents: {
        Row: {
          certificate_number: string | null
          certification_type: string | null
          created_at: string
          date_obtained: string | null
          document_type: string
          engineer_id: string
          expiry_date: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          issuing_body: string | null
          notes: string | null
          org_id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          certificate_number?: string | null
          certification_type?: string | null
          created_at?: string
          date_obtained?: string | null
          document_type?: string
          engineer_id: string
          expiry_date?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          issuing_body?: string | null
          notes?: string | null
          org_id?: string
          title?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          certificate_number?: string | null
          certification_type?: string | null
          created_at?: string
          date_obtained?: string | null
          document_type?: string
          engineer_id?: string
          expiry_date?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          issuing_body?: string | null
          notes?: string | null
          org_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_leave: {
        Row: {
          created_at: string
          end_date: string
          engineer_id: string
          id: string
          leave_type: string
          notes: string | null
          org_id: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          engineer_id: string
          id?: string
          leave_type?: string
          notes?: string | null
          org_id?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          engineer_id?: string
          id?: string
          leave_type?: string
          notes?: string | null
          org_id?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_leave_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_leave_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          org_id: string
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
          org_id?: string
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
          org_id?: string
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_onboarding_logs: {
        Row: {
          engineer_user_id: string
          id: string
          org_id: string | null
          sent_at: string
          sent_by: string
          sent_to_email: string
        }
        Insert: {
          engineer_user_id: string
          id?: string
          org_id?: string | null
          sent_at?: string
          sent_by: string
          sent_to_email: string
        }
        Update: {
          engineer_user_id?: string
          id?: string
          org_id?: string | null
          sent_at?: string
          sent_by?: string
          sent_to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_onboarding_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_onboarding_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_page_access: {
        Row: {
          created_at: string
          id: string
          org_id: string
          page_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          page_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          page_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineer_page_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineer_page_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      engineer_signatures: {
        Row: {
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          name: string
          org_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fault_codes: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          org_id: string
          priority: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          priority?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          priority?: string
        }
        Relationships: [
          {
            foreignKeyName: "fault_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fault_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      field_reports: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          job_id: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      fire_log_entries: {
        Row: {
          attachments: Json
          bs_standard: string | null
          created_at: string
          created_by: string | null
          date_of_event: string
          description: string | null
          entry_type: string
          id: string
          linked_job_id: string | null
          org_id: string | null
          recorded_by: string | null
          site_id: string
          title: string
        }
        Insert: {
          attachments?: Json
          bs_standard?: string | null
          created_at?: string
          created_by?: string | null
          date_of_event?: string
          description?: string | null
          entry_type?: string
          id?: string
          linked_job_id?: string | null
          org_id?: string | null
          recorded_by?: string | null
          site_id: string
          title: string
        }
        Update: {
          attachments?: Json
          bs_standard?: string | null
          created_at?: string
          created_by?: string | null
          date_of_event?: string
          description?: string | null
          entry_type?: string
          id?: string
          linked_job_id?: string | null
          org_id?: string | null
          recorded_by?: string | null
          site_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fire_log_entries_linked_job_id_fkey"
            columns: ["linked_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_entries_linked_job_id_fkey"
            columns: ["linked_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_entries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      fire_log_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          is_active: boolean
          org_id: string | null
          site_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_active?: boolean
          org_id?: string | null
          site_id: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_active?: boolean
          org_id?: string | null
          site_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "fire_log_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fire_log_tokens_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      generic_rams: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client: string | null
          contract_name: string | null
          created_at: string
          created_by: string
          current_revision_code: string
          current_revision_number: number
          description: string | null
          emergency_arrangements: string | null
          factors: Json
          id: string
          job_id: string
          last_issued_at: string | null
          org_id: string
          plant_equipment: Json
          ppe: Json
          risk_rows: Json
          sequence_of_works: Json
          site_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client?: string | null
          contract_name?: string | null
          created_at?: string
          created_by: string
          current_revision_code?: string
          current_revision_number?: number
          description?: string | null
          emergency_arrangements?: string | null
          factors?: Json
          id?: string
          job_id: string
          last_issued_at?: string | null
          org_id?: string
          plant_equipment?: Json
          ppe?: Json
          risk_rows?: Json
          sequence_of_works?: Json
          site_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client?: string | null
          contract_name?: string | null
          created_at?: string
          created_by?: string
          current_revision_code?: string
          current_revision_number?: number
          description?: string | null
          emergency_arrangements?: string | null
          factors?: Json
          id?: string
          job_id?: string
          last_issued_at?: string | null
          org_id?: string
          plant_equipment?: Json
          ppe?: Json
          risk_rows?: Json
          sequence_of_works?: Json
          site_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generic_rams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generic_rams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generic_rams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generic_rams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          expires_at: string
          id: string
          job_id: string
          notes: string | null
          org_id: string | null
          signature_data: string | null
          signed_at: string | null
          signer_email: string | null
          signer_name: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          job_id: string
          notes?: string | null
          org_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string | null
          signature_data?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          common_problems: Json
          created_at: string
          id: string
          keywords: string[]
          last_updated: string
          purpose: string
          related_slugs: string[]
          route_pattern: string | null
          slug: string
          source_paths: string[]
          steps: Json
          title: string
          updated_by: string | null
        }
        Insert: {
          common_problems?: Json
          created_at?: string
          id?: string
          keywords?: string[]
          last_updated?: string
          purpose: string
          related_slugs?: string[]
          route_pattern?: string | null
          slug: string
          source_paths?: string[]
          steps?: Json
          title: string
          updated_by?: string | null
        }
        Update: {
          common_problems?: Json
          created_at?: string
          id?: string
          keywords?: string[]
          last_updated?: string
          purpose?: string
          related_slugs?: string[]
          route_pattern?: string | null
          slug?: string
          source_paths?: string[]
          steps?: Json
          title?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      historic_reports: {
        Row: {
          asset_id: string | null
          created_at: string
          customer_id: string | null
          extracted_customer: string | null
          extracted_notes: string | null
          extracted_site: string | null
          file_size: number | null
          id: string
          imported_by: string | null
          match_confidence: string | null
          mime_type: string | null
          org_id: string
          original_filename: string
          report_date: string | null
          report_type: string | null
          report_type_label: string | null
          shareable_with_customer: boolean
          site_id: string | null
          storage_path: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          customer_id?: string | null
          extracted_customer?: string | null
          extracted_notes?: string | null
          extracted_site?: string | null
          file_size?: number | null
          id?: string
          imported_by?: string | null
          match_confidence?: string | null
          mime_type?: string | null
          org_id: string
          original_filename: string
          report_date?: string | null
          report_type?: string | null
          report_type_label?: string | null
          shareable_with_customer?: boolean
          site_id?: string | null
          storage_path: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          customer_id?: string | null
          extracted_customer?: string | null
          extracted_notes?: string | null
          extracted_site?: string | null
          file_size?: number | null
          id?: string
          imported_by?: string | null
          match_confidence?: string | null
          mime_type?: string | null
          org_id?: string
          original_filename?: string
          report_date?: string | null
          report_type?: string | null
          report_type_label?: string | null
          shareable_with_customer?: boolean
          site_id?: string | null
          storage_path?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historic_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historic_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historic_reports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historic_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          created_count: number
          entity_type: string
          error_summary: Json | null
          id: string
          merged_count: number
          org_id: string
          row_count: number
          skipped_count: number
          source_filename: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          entity_type: string
          error_summary?: Json | null
          id?: string
          merged_count?: number
          org_id: string
          row_count?: number
          skipped_count?: number
          source_filename?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          entity_type?: string
          error_summary?: Json | null
          id?: string
          merged_count?: number
          org_id?: string
          row_count?: number
          skipped_count?: number
          source_filename?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_handover_tokens: {
        Row: {
          client_email: string | null
          client_name: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          job_id: string
          org_id: string
          project_id: string
          signature_data: string | null
          signed_at: string | null
          status: string
          token: string
        }
        Insert: {
          client_email?: string | null
          client_name?: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          job_id: string
          org_id?: string
          project_id: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          token?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          job_id?: string
          org_id?: string
          project_id?: string
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_handover_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_handover_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_issue_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          id: string
          issue_id: string
          new_value: string | null
          old_value: string | null
          org_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: string
          issue_id: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: string
          issue_id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_issue_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_issue_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_issue_photos: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          issue_id: string
          org_id: string
          photo_url: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          issue_id: string
          org_id?: string
          photo_url: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          issue_id?: string
          org_id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_issue_photos_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "installation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_issue_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_issue_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_issues: {
        Row: {
          area: string | null
          assignee_id: string | null
          created_at: string
          description: string | null
          id: string
          org_id: string
          priority: string
          project_id: string
          resolution_photo_file_name: string | null
          resolution_photo_url: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          priority?: string
          project_id: string
          resolution_photo_file_name?: string | null
          resolution_photo_url?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          priority?: string
          project_id?: string
          resolution_photo_file_name?: string | null
          resolution_photo_url?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "installation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      installation_projects: {
        Row: {
          client_name: string
          company_address: string | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          created_at: string
          created_by: string
          id: string
          job_id: string
          org_id: string
          reference: string
          title: string
          updated_at: string
        }
        Insert: {
          client_name?: string
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          created_at?: string
          created_by: string
          id?: string
          job_id: string
          org_id?: string
          reference?: string
          title?: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          job_id?: string
          org_id?: string
          reference?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_projects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_projects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installation_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_misdrop_log: {
        Row: {
          action: string
          created_at: string
          detected_kind: string
          file_name: string | null
          id: string
          org_id: string | null
          reason: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detected_kind: string
          file_name?: string | null
          id?: string
          org_id?: string | null
          reason?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detected_kind?: string
          file_name?: string | null
          id?: string
          org_id?: string | null
          reason?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_misdrop_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_misdrop_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description?: string
          id?: string
          invoice_id: string
          org_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          org_id?: string
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
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          contract_id: string | null
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
          org_id: string | null
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
          contract_id?: string | null
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
          org_id?: string | null
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
          contract_id?: string | null
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
          org_id?: string | null
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
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          job_id: string
          org_id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          job_id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_activity_log_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "job_activity_log_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          assigned_at: string
          engineer_id: string
          id: string
          job_id: string
          org_id: string
        }
        Insert: {
          assigned_at?: string
          engineer_id: string
          id?: string
          job_id: string
          org_id?: string
        }
        Update: {
          assigned_at?: string
          engineer_id?: string
          id?: string
          job_id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_assignments_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_job_assignments_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          rams_required: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string
          rams_required?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          rams_required?: boolean
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_completion_flags: {
        Row: {
          created_at: string
          engineer_id: string
          id: string
          job_id: string
          moved_to_job_id: string | null
          note: string | null
          org_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          engineer_id: string
          id?: string
          job_id: string
          moved_to_job_id?: string | null
          note?: string | null
          org_id: string
          reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          engineer_id?: string
          id?: string
          job_id?: string
          moved_to_job_id?: string | null
          note?: string | null
          org_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_completion_flags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_flags_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_flags_moved_to_job_id_fkey"
            columns: ["moved_to_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_flags_moved_to_job_id_fkey"
            columns: ["moved_to_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_completion_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_documents: {
        Row: {
          category_template_id: string | null
          created_at: string
          created_by: string | null
          document_type: string
          file_name: string | null
          file_url: string | null
          id: string
          job_id: string
          label: string
          org_id: string
          shareable_with_customer: boolean
          source: string
        }
        Insert: {
          category_template_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id: string
          label?: string
          org_id?: string
          shareable_with_customer?: boolean
          source?: string
        }
        Update: {
          category_template_id?: string | null
          created_at?: string
          created_by?: string | null
          document_type?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id?: string
          label?: string
          org_id?: string
          shareable_with_customer?: boolean
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_category_template_id_fkey"
            columns: ["category_template_id"]
            isOneToOne: false
            referencedRelation: "category_document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_emails: {
        Row: {
          attachment_count: number
          body_html: string | null
          body_text: string | null
          created_at: string
          direction: string
          eml_path: string | null
          from_email: string | null
          id: string
          in_reply_to: string | null
          job_id: string
          message_id: string | null
          org_id: string
          received_at: string
          snippet: string | null
          subject: string | null
          to_emails: string[] | null
        }
        Insert: {
          attachment_count?: number
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          eml_path?: string | null
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          job_id: string
          message_id?: string | null
          org_id: string
          received_at?: string
          snippet?: string | null
          subject?: string | null
          to_emails?: string[] | null
        }
        Update: {
          attachment_count?: number
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          direction?: string
          eml_path?: string | null
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          job_id?: string
          message_id?: string | null
          org_id?: string
          received_at?: string
          snippet?: string | null
          subject?: string | null
          to_emails?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_emails_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_emails_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          job_id: string
          org_id: string
          read_by: string[]
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          job_id: string
          org_id?: string
          read_by?: string[]
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          job_id?: string
          org_id?: string
          read_by?: string[]
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_parts: {
        Row: {
          added_by: string
          created_at: string
          id: string
          job_id: string
          name: string
          notes: string | null
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photo_checklist_responses: {
        Row: {
          after_photo_url: string | null
          before_photo_url: string | null
          captured_at: string
          captured_by: string | null
          checklist_id: string
          id: string
          is_pass: boolean | null
          item_id: string
          job_id: string
          notes: string | null
          org_id: string
          photo_url: string | null
          response_type: string
          text_value: string | null
        }
        Insert: {
          after_photo_url?: string | null
          before_photo_url?: string | null
          captured_at?: string
          captured_by?: string | null
          checklist_id: string
          id?: string
          is_pass?: boolean | null
          item_id: string
          job_id: string
          notes?: string | null
          org_id?: string
          photo_url?: string | null
          response_type?: string
          text_value?: string | null
        }
        Update: {
          after_photo_url?: string | null
          before_photo_url?: string | null
          captured_at?: string
          captured_by?: string | null
          checklist_id?: string
          id?: string
          is_pass?: boolean | null
          item_id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          photo_url?: string | null
          response_type?: string
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photo_checklist_responses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "job_photo_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklist_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "photo_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklist_responses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklist_responses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklist_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklist_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photo_checklists: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          org_id: string
          status: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          org_id?: string
          status?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          org_id?: string
          status?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photo_checklists_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklists_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photo_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "photo_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_remedial_items: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          description: string
          done_at: string | null
          done_by: string | null
          id: string
          job_id: string
          org_id: string | null
          photo_submission_id: string | null
          seq: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          job_id: string
          org_id?: string | null
          photo_submission_id?: string | null
          seq?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          done_at?: string | null
          done_by?: string | null
          id?: string
          job_id?: string
          org_id?: string | null
          photo_submission_id?: string | null
          seq?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_remedial_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_remedial_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_schedule: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          created_by: string | null
          engineer_id: string
          id: string
          job_id: string
          last_modified_at: string | null
          last_modified_by: string | null
          notes: string | null
          notes_color: string | null
          org_id: string
          schedule_date: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string | null
          engineer_id: string
          id?: string
          job_id: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          notes?: string | null
          notes_color?: string | null
          org_id?: string
          schedule_date: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          created_by?: string | null
          engineer_id?: string
          id?: string
          job_id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          notes?: string | null
          notes_color?: string | null
          org_id?: string
          schedule_date?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_schedule_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedule_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedule_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_schedule_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_response_edits: {
        Row: {
          edited_at: string
          editor_id: string
          field_id: string
          field_label: string | null
          id: string
          job_id: string
          new_value: Json | null
          old_value: Json | null
          response_id: string
          was_signed_at_time: boolean
        }
        Insert: {
          edited_at?: string
          editor_id: string
          field_id: string
          field_label?: string | null
          id?: string
          job_id: string
          new_value?: Json | null
          old_value?: Json | null
          response_id: string
          was_signed_at_time?: boolean
        }
        Update: {
          edited_at?: string
          editor_id?: string
          field_id?: string
          field_label?: string | null
          id?: string
          job_id?: string
          new_value?: Json | null
          old_value?: Json | null
          response_id?: string
          was_signed_at_time?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "job_sheet_response_edits_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_responses: {
        Row: {
          created_at: string
          id: string
          job_id: string
          last_amended_at: string | null
          last_amended_by: string | null
          org_id: string
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
          last_amended_at?: string | null
          last_amended_by?: string | null
          org_id?: string
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
          last_amended_at?: string | null
          last_amended_by?: string | null
          org_id?: string
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
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_responses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          footer_text: string | null
          id: string
          job_category: string | null
          locked: boolean
          name: string
          org_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branding?: Json | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          footer_text?: string | null
          id?: string
          job_category?: string | null
          locked?: boolean
          name: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branding?: Json | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          footer_text?: string | null
          id?: string
          job_category?: string | null
          locked?: boolean
          name?: string
          org_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sheet_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_signatures: {
        Row: {
          created_at: string
          file_path: string
          id: string
          job_id: string
          lat: number | null
          lng: number | null
          org_id: string
          signer_id: string
          signer_name: string
          signer_position: string | null
          signer_role: string
          w3w_words: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          job_id: string
          lat?: number | null
          lng?: number | null
          org_id?: string
          signer_id: string
          signer_name?: string
          signer_position?: string | null
          signer_role?: string
          w3w_words?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          job_id?: string
          lat?: number | null
          lng?: number | null
          org_id?: string
          signer_id?: string
          signer_name?: string
          signer_position?: string | null
          signer_role?: string
          w3w_words?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_site_survey_photos: {
        Row: {
          caption: string | null
          captured_at: string
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          job_id: string
          kind: string
          org_id: string
          survey_id: string
          what3words: string | null
        }
        Insert: {
          caption?: string | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          job_id: string
          kind?: string
          org_id?: string
          survey_id: string
          what3words?: string | null
        }
        Update: {
          caption?: string | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          job_id?: string
          kind?: string
          org_id?: string
          survey_id?: string
          what3words?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_site_survey_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_survey_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_survey_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_survey_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_survey_photos_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "job_site_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      job_site_surveys: {
        Row: {
          access_notes: string | null
          asset_locations: string | null
          created_at: string
          created_by: string | null
          hazards: string | null
          id: string
          job_id: string
          notes: string | null
          org_id: string
          parking_welfare: string | null
          recommendations: string | null
          sketch_url: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          asset_locations?: string | null
          created_at?: string
          created_by?: string | null
          hazards?: string | null
          id?: string
          job_id: string
          notes?: string | null
          org_id?: string
          parking_welfare?: string | null
          recommendations?: string | null
          sketch_url?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          asset_locations?: string | null
          created_at?: string
          created_by?: string | null
          hazards?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          parking_welfare?: string | null
          recommendations?: string | null
          sketch_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_site_surveys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_surveys_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_site_surveys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      job_template_locks: {
        Row: {
          bucket: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          org_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          bucket: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          org_id?: string
          template_id: string
          updated_at?: string
        }
        Update: {
          bucket?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          org_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_template_locks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_template_locks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_template_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_template_locks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_template_locks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      job_templates: {
        Row: {
          address: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          other_qty: number
          other_service_type: string | null
          pressure_test_qty: number
          priority: string
          updated_at: string
          visual_qty: number
        }
        Insert: {
          address?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          other_qty?: number
          other_service_type?: string | null
          pressure_test_qty?: number
          priority?: string
          updated_at?: string
          visual_qty?: number
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          other_qty?: number
          other_service_type?: string | null
          pressure_test_qty?: number
          priority?: string
          updated_at?: string
          visual_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_visits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          address: string | null
          allocated_days: number | null
          asset_id: string | null
          brief: string | null
          category: string
          completed_at: string | null
          completed_by: string | null
          completion_override_reason: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          customer_id: string | null
          customer_po: string | null
          detected_work_types: string[]
          due_date: string | null
          email_review_flag: boolean
          fault_code_id: string | null
          has_unread_email: boolean
          historic_backfill: boolean
          id: string
          intake_last_email_at: string | null
          intake_message_ids: string[]
          intake_normalized_subject: string | null
          intake_original_sender_email: string | null
          intake_sender_domain: string | null
          intake_sender_email: string | null
          is_remedial: boolean
          job_type: string
          mismatch_approved_at: string | null
          mismatch_approved_by: string | null
          mismatch_approved_reason: string | null
          multi_day_flagged_at: string | null
          name: string
          org_id: string | null
          other_qty: number
          other_service_type: string | null
          pressure_test_qty: number
          priority: string
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_start_date: string | null
          recurrence_unit: string | null
          reference_number: string
          rejection_reason: string | null
          result: string | null
          site_id: string | null
          source: string | null
          status: string
          template_mismatch_reason: string | null
          updated_at: string
          visual_qty: number
        }
        Insert: {
          address?: string | null
          allocated_days?: number | null
          asset_id?: string | null
          brief?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_override_reason?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_id?: string | null
          customer_po?: string | null
          detected_work_types?: string[]
          due_date?: string | null
          email_review_flag?: boolean
          fault_code_id?: string | null
          has_unread_email?: boolean
          historic_backfill?: boolean
          id?: string
          intake_last_email_at?: string | null
          intake_message_ids?: string[]
          intake_normalized_subject?: string | null
          intake_original_sender_email?: string | null
          intake_sender_domain?: string | null
          intake_sender_email?: string | null
          is_remedial?: boolean
          job_type?: string
          mismatch_approved_at?: string | null
          mismatch_approved_by?: string | null
          mismatch_approved_reason?: string | null
          multi_day_flagged_at?: string | null
          name: string
          org_id?: string | null
          other_qty?: number
          other_service_type?: string | null
          pressure_test_qty?: number
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_start_date?: string | null
          recurrence_unit?: string | null
          reference_number?: string
          rejection_reason?: string | null
          result?: string | null
          site_id?: string | null
          source?: string | null
          status?: string
          template_mismatch_reason?: string | null
          updated_at?: string
          visual_qty?: number
        }
        Update: {
          address?: string | null
          allocated_days?: number | null
          asset_id?: string | null
          brief?: string | null
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_override_reason?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          customer_id?: string | null
          customer_po?: string | null
          detected_work_types?: string[]
          due_date?: string | null
          email_review_flag?: boolean
          fault_code_id?: string | null
          has_unread_email?: boolean
          historic_backfill?: boolean
          id?: string
          intake_last_email_at?: string | null
          intake_message_ids?: string[]
          intake_normalized_subject?: string | null
          intake_original_sender_email?: string | null
          intake_sender_domain?: string | null
          intake_sender_email?: string | null
          is_remedial?: boolean
          job_type?: string
          mismatch_approved_at?: string | null
          mismatch_approved_by?: string | null
          mismatch_approved_reason?: string | null
          multi_day_flagged_at?: string | null
          name?: string
          org_id?: string | null
          other_qty?: number
          other_service_type?: string | null
          pressure_test_qty?: number
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_start_date?: string | null
          recurrence_unit?: string | null
          reference_number?: string
          rejection_reason?: string | null
          result?: string | null
          site_id?: string | null
          source?: string | null
          status?: string
          template_mismatch_reason?: string | null
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
            foreignKeyName: "jobs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
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
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
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
      mellor_deleted_references: {
        Row: {
          deleted_at: string
          reference_number: string
        }
        Insert: {
          deleted_at?: string
          reference_number: string
        }
        Update: {
          deleted_at?: string
          reference_number?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          message: string
          org_id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          message: string
          org_id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string
          org_id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      org_intake_secrets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_used_at: string | null
          org_id: string
          secret_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          org_id: string
          secret_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          org_id?: string
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_intake_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_intake_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      org_status_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          message: string | null
          new_status: string
          old_status: string | null
          org_id: string
          reason: string | null
          source: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          message?: string | null
          new_status: string
          old_status?: string | null
          org_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          message?: string | null
          new_status?: string
          old_status?: string | null
          org_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_status_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_status_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_billing: {
        Row: {
          created_at: string
          current_period_end: string | null
          grace_period_ends_at: string | null
          last_webhook_event_id: string | null
          org_id: string
          plan_code: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          grace_period_ends_at?: string | null
          last_webhook_event_id?: string | null
          org_id: string
          plan_code?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          grace_period_ends_at?: string | null
          last_webhook_event_id?: string | null
          org_id?: string
          plan_code?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_billing_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_billing_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          invited_email: string | null
          org_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          org_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          org_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          created_by: string | null
          grace_period_ends_at: string | null
          id: string
          intake_email: string | null
          logo_url: string | null
          ms_send_mailbox: string | null
          ms_send_mode: string
          name: string
          plan: string
          plan_status: string
          portal_enabled: boolean
          primary_color: string | null
          promo_price_note: string | null
          promo_price_pence: number | null
          reactivated_at: string | null
          renewal_reminder_from_name: string | null
          renewal_reminder_template: string | null
          renewal_reminders_enabled: boolean
          scan_intake_email: string | null
          slug: string
          status: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_message: string | null
          suspension_reason: string | null
          trial_ends_at: string | null
          updated_at: string
          user_band: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grace_period_ends_at?: string | null
          id?: string
          intake_email?: string | null
          logo_url?: string | null
          ms_send_mailbox?: string | null
          ms_send_mode?: string
          name: string
          plan?: string
          plan_status?: string
          portal_enabled?: boolean
          primary_color?: string | null
          promo_price_note?: string | null
          promo_price_pence?: number | null
          reactivated_at?: string | null
          renewal_reminder_from_name?: string | null
          renewal_reminder_template?: string | null
          renewal_reminders_enabled?: boolean
          scan_intake_email?: string | null
          slug: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_message?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_band?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grace_period_ends_at?: string | null
          id?: string
          intake_email?: string | null
          logo_url?: string | null
          ms_send_mailbox?: string | null
          ms_send_mode?: string
          name?: string
          plan?: string
          plan_status?: string
          portal_enabled?: boolean
          primary_color?: string | null
          promo_price_note?: string | null
          promo_price_pence?: number | null
          reactivated_at?: string | null
          renewal_reminder_from_name?: string | null
          renewal_reminder_template?: string | null
          renewal_reminders_enabled?: boolean
          scan_intake_email?: string | null
          slug?: string
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_message?: string | null
          suspension_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_band?: string | null
        }
        Relationships: []
      }
      paper_scan_batch_items: {
        Row: {
          archived_document_id: string | null
          batch_id: string
          candidate_matches: Json | null
          confidence: number | null
          created_at: string
          created_job_id: string | null
          detected_template_id: string | null
          error: string | null
          extracted: Json | null
          guess_customer_id: string | null
          guess_date: string | null
          guess_site_id: string | null
          header_data: Json | null
          id: string
          image_paths: string[]
          matched_existing_job: boolean
          mode: string
          org_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_document_id?: string | null
          batch_id: string
          candidate_matches?: Json | null
          confidence?: number | null
          created_at?: string
          created_job_id?: string | null
          detected_template_id?: string | null
          error?: string | null
          extracted?: Json | null
          guess_customer_id?: string | null
          guess_date?: string | null
          guess_site_id?: string | null
          header_data?: Json | null
          id?: string
          image_paths: string[]
          matched_existing_job?: boolean
          mode?: string
          org_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_document_id?: string | null
          batch_id?: string
          candidate_matches?: Json | null
          confidence?: number | null
          created_at?: string
          created_job_id?: string | null
          detected_template_id?: string | null
          error?: string | null
          extracted?: Json | null
          guess_customer_id?: string | null
          guess_date?: string | null
          guess_site_id?: string | null
          header_data?: Json | null
          id?: string
          image_paths?: string[]
          matched_existing_job?: boolean
          mode?: string
          org_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_scan_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "paper_scan_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_scan_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mode: string
          note: string | null
          org_id: string
          processed_items: number
          status: string
          total_items: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          note?: string | null
          org_id: string
          processed_items?: number
          status?: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          note?: string | null
          org_id?: string
          processed_items?: number
          status?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts_library: {
        Row: {
          category: string
          china_cost: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          list_type: string
          name: string
          org_id: string | null
          part_number: string | null
          sell_price: number
          sort_order: number
          supplier: string | null
          uk_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string
          china_cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          list_type?: string
          name: string
          org_id?: string | null
          part_number?: string | null
          sell_price?: number
          sort_order?: number
          supplier?: string | null
          uk_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string
          china_cost?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          list_type?: string
          name?: string
          org_id?: string | null
          part_number?: string | null
          sell_price?: number
          sort_order?: number
          supplier?: string | null
          uk_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_library_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_whatsapp_scans: {
        Row: {
          created_at: string
          created_job_id: string | null
          engineer_phone: string
          engineer_user_id: string
          extracted_fields: Json | null
          id: string
          image_storage_path: string
          ocr_confidence: number | null
          ocr_path: string | null
          org_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_job_id?: string | null
          engineer_phone: string
          engineer_user_id: string
          extracted_fields?: Json | null
          id?: string
          image_storage_path: string
          ocr_confidence?: number | null
          ocr_path?: string | null
          org_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_job_id?: string | null
          engineer_phone?: string
          engineer_user_id?: string
          extracted_fields?: Json | null
          id?: string
          image_storage_path?: string
          ocr_confidence?: number | null
          ocr_path?: string | null
          org_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_whatsapp_scans_created_job_id_fkey"
            columns: ["created_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_whatsapp_scans_created_job_id_fkey"
            columns: ["created_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_whatsapp_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_whatsapp_scans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_checklist_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          item_type: string
          label: string
          required: boolean
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          label: string
          required?: boolean
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_type?: string
          label?: string
          required?: boolean
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "photo_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_checklist_templates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_adhoc_entries: {
        Row: {
          allocated_days: number
          company_name: string
          created_at: string
          created_by: string
          description: string | null
          engineer_id: string
          id: string
          org_id: string
          schedule_date: string | null
          updated_at: string
        }
        Insert: {
          allocated_days?: number
          company_name?: string
          created_at?: string
          created_by: string
          description?: string | null
          engineer_id: string
          id?: string
          org_id?: string
          schedule_date?: string | null
          updated_at?: string
        }
        Update: {
          allocated_days?: number
          company_name?: string
          created_at?: string
          created_by?: string
          description?: string | null
          engineer_id?: string
          id?: string
          org_id?: string
          schedule_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_adhoc_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_adhoc_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          note: string | null
          price_override_note: string | null
          price_override_pence: number | null
          seed_templates_default: boolean
          updated_at: string
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          note?: string | null
          price_override_note?: string | null
          price_override_pence?: number | null
          seed_templates_default?: boolean
          updated_at?: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          note?: string | null
          price_override_note?: string | null
          price_override_pence?: number | null
          seed_templates_default?: boolean
          updated_at?: string
          uses?: number
        }
        Relationships: []
      }
      po_intake_rate_limit: {
        Row: {
          count: number
          intake_email: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          intake_email: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          intake_email?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      portal_visit_requests: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          org_id: string
          preferred_date: string | null
          requested_by: string
          site_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          org_id: string
          preferred_date?: string | null
          requested_by: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          preferred_date?: string | null
          requested_by?: string
          site_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_visit_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_visit_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_visit_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_visit_requests_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string
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
          org_id?: string
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
          org_id?: string
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
          {
            foreignKeyName: "ppm_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_completion_checklist_items: {
        Row: {
          category: string
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          job_id: string
          label: string
          notes: string | null
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          job_id: string
          label?: string
          notes?: string | null
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          job_id?: string
          label?: string
          notes?: string | null
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pre_completion_checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_completion_checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_completion_checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_completion_checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      price_book_items: {
        Row: {
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_book_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          org_id: string | null
          phone: string | null
          planner_engineer_order: Json
          show_on_planner: boolean
          signature_data: string | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          org_id?: string | null
          phone?: string | null
          planner_engineer_order?: Json
          show_on_planner?: boolean
          signature_data?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          org_id?: string | null
          phone?: string | null
          planner_engineer_order?: Json
          show_on_planner?: boolean
          signature_data?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_approval_tokens: {
        Row: {
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string
          expires_at: string
          id: string
          org_id: string
          quote_id: string
          responded_at: string | null
          response_notes: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name?: string
          expires_at?: string
          id?: string
          org_id?: string
          quote_id: string
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string
          expires_at?: string
          id?: string
          org_id?: string
          quote_id?: string
          responded_at?: string | null
          response_notes?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_approval_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approval_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approval_tokens_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rams: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_name: string | null
          created_at: string
          created_by: string
          current_revision_code: string
          current_revision_number: number
          factors: Json
          id: string
          job_id: string
          last_issued_at: string | null
          method_statement: Json
          org_id: string
          reviewed_by: string | null
          risk_assessment: Json
          site_address: string | null
          site_name: string | null
          status: string
          updated_at: string
          version: number
          works_description: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          created_at?: string
          created_by: string
          current_revision_code?: string
          current_revision_number?: number
          factors?: Json
          id?: string
          job_id: string
          last_issued_at?: string | null
          method_statement?: Json
          org_id?: string
          reviewed_by?: string | null
          risk_assessment?: Json
          site_address?: string | null
          site_name?: string | null
          status?: string
          updated_at?: string
          version?: number
          works_description?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string
          current_revision_code?: string
          current_revision_number?: number
          factors?: Json
          id?: string
          job_id?: string
          last_issued_at?: string | null
          method_statement?: Json
          org_id?: string
          reviewed_by?: string | null
          risk_assessment?: Json
          site_address?: string | null
          site_name?: string | null
          status?: string
          updated_at?: string
          version?: number
          works_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_documents: {
        Row: {
          assessment_date: string | null
          attendance_date: string | null
          client: string | null
          contract_job_name: string | null
          created_at: string
          created_by: string
          description_of_work: string | null
          id: string
          job_id: string
          location: string | null
          operatives: Json | null
          org_id: string
          personnel: string | null
          plant_and_equipment: Json | null
          ppe_items: Json | null
          rams_type: string
          resources: string | null
          risk_rows: Json | null
          sequence_of_ops: Json | null
          shareable_with_customer: boolean
          significant_risks: Json | null
          site_location: string | null
          special_training: string | null
          task_specific_ops: Json | null
          updated_at: string
        }
        Insert: {
          assessment_date?: string | null
          attendance_date?: string | null
          client?: string | null
          contract_job_name?: string | null
          created_at?: string
          created_by: string
          description_of_work?: string | null
          id?: string
          job_id: string
          location?: string | null
          operatives?: Json | null
          org_id?: string
          personnel?: string | null
          plant_and_equipment?: Json | null
          ppe_items?: Json | null
          rams_type?: string
          resources?: string | null
          risk_rows?: Json | null
          sequence_of_ops?: Json | null
          shareable_with_customer?: boolean
          significant_risks?: Json | null
          site_location?: string | null
          special_training?: string | null
          task_specific_ops?: Json | null
          updated_at?: string
        }
        Update: {
          assessment_date?: string | null
          attendance_date?: string | null
          client?: string | null
          contract_job_name?: string | null
          created_at?: string
          created_by?: string
          description_of_work?: string | null
          id?: string
          job_id?: string
          location?: string | null
          operatives?: Json | null
          org_id?: string
          personnel?: string | null
          plant_and_equipment?: Json | null
          ppe_items?: Json | null
          rams_type?: string
          resources?: string | null
          risk_rows?: Json | null
          sequence_of_ops?: Json | null
          shareable_with_customer?: boolean
          significant_risks?: Json | null
          site_location?: string | null
          special_training?: string | null
          task_specific_ops?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rams_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_feedback_changes: {
        Row: {
          after_value: Json | null
          before_value: Json | null
          comment_excerpt: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          feedback_request_id: string
          id: string
          library_item_id: string | null
          ord: number
          org_id: string
          proposed_action: string
          rationale: string | null
          saved_as_library_item_id: string | null
          target_ref: string | null
          target_section: string
          updated_at: string
        }
        Insert: {
          after_value?: Json | null
          before_value?: Json | null
          comment_excerpt: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          feedback_request_id: string
          id?: string
          library_item_id?: string | null
          ord?: number
          org_id: string
          proposed_action: string
          rationale?: string | null
          saved_as_library_item_id?: string | null
          target_ref?: string | null
          target_section: string
          updated_at?: string
        }
        Update: {
          after_value?: Json | null
          before_value?: Json | null
          comment_excerpt?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          feedback_request_id?: string
          id?: string
          library_item_id?: string | null
          ord?: number
          org_id?: string
          proposed_action?: string
          rationale?: string | null
          saved_as_library_item_id?: string | null
          target_ref?: string | null
          target_section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rams_feedback_changes_feedback_request_id_fkey"
            columns: ["feedback_request_id"]
            isOneToOne: false
            referencedRelation: "rams_feedback_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_changes_library_item_id_fkey"
            columns: ["library_item_id"]
            isOneToOne: false
            referencedRelation: "rams_library_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_changes_saved_as_library_item_id_fkey"
            columns: ["saved_as_library_item_id"]
            isOneToOne: false
            referencedRelation: "rams_library_items"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_feedback_requests: {
        Row: {
          created_at: string
          created_by: string
          id: string
          issued_revision_id: string | null
          job_id: string
          org_id: string
          rams_id: string
          rams_kind: string
          raw_text: string | null
          source: string
          source_document_path: string | null
          source_email_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          issued_revision_id?: string | null
          job_id: string
          org_id: string
          rams_id: string
          rams_kind: string
          raw_text?: string | null
          source: string
          source_document_path?: string | null
          source_email_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          issued_revision_id?: string | null
          job_id?: string
          org_id?: string
          rams_id?: string
          rams_kind?: string
          raw_text?: string | null
          source?: string
          source_document_path?: string | null
          source_email_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rams_feedback_requests_issued_revision_id_fkey"
            columns: ["issued_revision_id"]
            isOneToOne: false
            referencedRelation: "rams_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_feedback_requests_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "job_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_library_items: {
        Row: {
          archived: boolean
          block_type: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          kind: string
          name: string
          org_id: string
          payload: Json
          source_rams_id: string | null
          source_rams_kind: string | null
          updated_at: string
          work_types: string[]
        }
        Insert: {
          archived?: boolean
          block_type?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          kind: string
          name: string
          org_id: string
          payload?: Json
          source_rams_id?: string | null
          source_rams_kind?: string | null
          updated_at?: string
          work_types?: string[]
        }
        Update: {
          archived?: boolean
          block_type?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          org_id?: string
          payload?: Json
          source_rams_id?: string | null
          source_rams_kind?: string | null
          updated_at?: string
          work_types?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rams_library_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_library_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_revisions: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          job_id: string
          org_id: string
          pdf_path: string | null
          rams_id: string
          rams_kind: string
          revision_code: string
          revision_number: number
          snapshot: Json
          summary_of_changes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          job_id: string
          org_id: string
          pdf_path?: string | null
          rams_id: string
          rams_kind: string
          revision_code: string
          revision_number: number
          snapshot?: Json
          summary_of_changes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          job_id?: string
          org_id?: string
          pdf_path?: string | null
          rams_id?: string
          rams_kind?: string
          revision_code?: string
          revision_number?: number
          snapshot?: Json
          summary_of_changes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_revisions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_revisions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_revisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_revisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      rams_signoffs: {
        Row: {
          created_at: string
          engineer_id: string
          engineer_name: string | null
          id: string
          ip: string | null
          job_id: string
          org_id: string
          rams_id: string
          rams_kind: string
          rams_version: number
          signature_path: string | null
          signed_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          engineer_id: string
          engineer_name?: string | null
          id?: string
          ip?: string | null
          job_id: string
          org_id: string
          rams_id: string
          rams_kind: string
          rams_version?: number
          signature_path?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          engineer_id?: string
          engineer_name?: string | null
          id?: string
          ip?: string | null
          job_id?: string
          org_id?: string
          rams_id?: string
          rams_kind?: string
          rams_version?: number
          signature_path?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rams_signoffs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_signoffs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_signoffs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rams_signoffs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_reminder_log: {
        Row: {
          body_snippet: string | null
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          job_id: string | null
          org_id: string
          recipient_email: string
          reminder_kind: string
          schedule_id: string | null
          sent_at: string | null
          sent_by: string | null
          site_id: string | null
          status: string
          subject: string
        }
        Insert: {
          body_snippet?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          org_id: string
          recipient_email: string
          reminder_kind: string
          schedule_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          site_id?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_snippet?: string | null
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          org_id?: string
          recipient_email?: string
          reminder_kind?: string
          schedule_id?: string | null
          sent_at?: string | null
          sent_by?: string | null
          site_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_reminder_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminder_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminder_log_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "site_service_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_readings: {
        Row: {
          asset_id: string
          id: string
          org_id: string
          recorded_at: string
          sensor_id: string
          status: string
          value: number
        }
        Insert: {
          asset_id: string
          id?: string
          org_id?: string
          recorded_at?: string
          sensor_id: string
          status?: string
          value: number
        }
        Update: {
          asset_id?: string
          id?: string
          org_id?: string
          recorded_at?: string
          sensor_id?: string
          status?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sensor_readings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_readings_sensor_id_fkey"
            columns: ["sensor_id"]
            isOneToOne: false
            referencedRelation: "asset_sensors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_renewals: {
        Row: {
          applied_increase_pct: number
          contract_id: string
          id: string
          new_renewal_date: string
          new_value: number
          notes: string | null
          org_id: string
          previous_renewal_date: string
          previous_value: number
          renewed_at: string
          renewed_by: string | null
        }
        Insert: {
          applied_increase_pct?: number
          contract_id: string
          id?: string
          new_renewal_date: string
          new_value: number
          notes?: string | null
          org_id: string
          previous_renewal_date: string
          previous_value: number
          renewed_at?: string
          renewed_by?: string | null
        }
        Update: {
          applied_increase_pct?: number
          contract_id?: string
          id?: string
          new_renewal_date?: string
          new_value?: number
          notes?: string | null
          org_id?: string
          previous_renewal_date?: string
          previous_value?: number
          renewed_at?: string
          renewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_renewals_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_services: {
        Row: {
          contract_id: string
          created_at: string
          description: string
          id: string
          org_id: string
          ppm_schedule_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          description: string
          id?: string
          org_id: string
          ppm_schedule_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          description?: string
          id?: string
          org_id?: string
          ppm_schedule_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contract_services_ppm_schedule_id_fkey"
            columns: ["ppm_schedule_id"]
            isOneToOne: false
            referencedRelation: "ppm_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contract_sites: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          org_id: string
          site_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          org_id: string
          site_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          org_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contract_sites_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contract_sites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contracts: {
        Row: {
          billing_frequency: string
          contract_value: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          name: string
          notes: string | null
          org_id: string
          price_increase_pct: number
          reference_number: string
          renewal_date: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          billing_frequency?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          price_increase_pct?: number
          reference_number: string
          renewal_date: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          billing_frequency?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          price_increase_pct?: number
          reference_number?: string
          renewal_date?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_intervals: {
        Row: {
          active: boolean
          created_at: string
          id: string
          interval_months: number
          org_id: string
          reminder_lead_weeks: number
          send_due_date_reminder: boolean
          template_id: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          interval_months: number
          org_id: string
          reminder_lead_weeks?: number
          send_due_date_reminder?: boolean
          template_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          interval_months?: number
          org_id?: string
          reminder_lead_weeks?: number
          send_due_date_reminder?: boolean
          template_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_intervals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_intervals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_intervals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_intents: {
        Row: {
          code: string | null
          completed_at: string | null
          created_at: string
          email: string
          error_message: string | null
          id: string
          org_id: string | null
          org_name: string | null
          requested_at: string
          seed_templates: boolean
          user_id: string | null
        }
        Insert: {
          code?: string | null
          completed_at?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          org_name?: string | null
          requested_at?: string
          seed_templates?: boolean
          user_id?: string | null
        }
        Update: {
          code?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          org_name?: string | null
          requested_at?: string
          seed_templates?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_intents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signup_intents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      site_service_schedules: {
        Row: {
          active: boolean
          created_at: string
          customer_id: string | null
          id: string
          interval_months: number
          last_done_date: string | null
          last_job_id: string | null
          last_response_id: string | null
          next_due_date: string
          next_job_id: string | null
          notes: string | null
          org_id: string
          reminder_due_sent_at: string | null
          reminder_lead_sent_at: string | null
          site_id: string | null
          template_id: string | null
          updated_at: string
          work_type: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          interval_months: number
          last_done_date?: string | null
          last_job_id?: string | null
          last_response_id?: string | null
          next_due_date: string
          next_job_id?: string | null
          notes?: string | null
          org_id: string
          reminder_due_sent_at?: string | null
          reminder_lead_sent_at?: string | null
          site_id?: string | null
          template_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          interval_months?: number
          last_done_date?: string | null
          last_job_id?: string | null
          last_response_id?: string | null
          next_due_date?: string
          next_job_id?: string | null
          notes?: string | null
          org_id?: string
          reminder_due_sent_at?: string | null
          reminder_lead_sent_at?: string | null
          site_id?: string | null
          template_id?: string | null
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_service_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_last_response_id_fkey"
            columns: ["last_response_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_next_job_id_fkey"
            columns: ["next_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_next_job_id_fkey"
            columns: ["next_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_service_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      site_survey_photos: {
        Row: {
          caption: string | null
          captured_at: string
          created_at: string
          created_by: string | null
          file_path: string
          id: string
          kind: string
          org_id: string
          survey_id: string
          what3words: string | null
        }
        Insert: {
          caption?: string | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          file_path: string
          id?: string
          kind?: string
          org_id?: string
          survey_id: string
          what3words?: string | null
        }
        Update: {
          caption?: string | null
          captured_at?: string
          created_at?: string
          created_by?: string | null
          file_path?: string
          id?: string
          kind?: string
          org_id?: string
          survey_id?: string
          what3words?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_survey_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_survey_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_survey_photos_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "site_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      site_surveys: {
        Row: {
          access_notes: string | null
          asset_locations: string | null
          contact_name: string | null
          contact_phone: string | null
          converted_job_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          engineer_id: string | null
          hazards: string | null
          id: string
          notes: string | null
          org_id: string | null
          parking_welfare: string | null
          recommendations: string | null
          reference_number: string | null
          signature_url: string | null
          site_address: string | null
          site_id: string | null
          status: string
          survey_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          asset_locations?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          engineer_id?: string | null
          hazards?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
          parking_welfare?: string | null
          recommendations?: string | null
          reference_number?: string | null
          signature_url?: string | null
          site_address?: string | null
          site_id?: string | null
          status?: string
          survey_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          asset_locations?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          engineer_id?: string | null
          hazards?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
          parking_welfare?: string | null
          recommendations?: string | null
          reference_number?: string | null
          signature_url?: string | null
          site_address?: string | null
          site_id?: string | null
          status?: string
          survey_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_surveys_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_surveys_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_surveys_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_surveys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          category: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          name: string
          notes: string | null
          org_id: string | null
          outlets_count: number | null
          parent_id: string | null
          postcode: string | null
          riser_location: string | null
          site_type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          name: string
          notes?: string | null
          org_id?: string | null
          outlets_count?: number | null
          parent_id?: string | null
          postcode?: string | null
          riser_location?: string | null
          site_type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          name?: string
          notes?: string | null
          org_id?: string | null
          outlets_count?: number | null
          parent_id?: string | null
          postcode?: string | null
          riser_location?: string | null
          site_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          created_at: string
          engineer_id: string
          id: string
          job_id: string | null
          notes: string | null
          org_id: string | null
          quantity_change: number
          status: string
          transaction_type: string
          van_stock_id: string | null
        }
        Insert: {
          created_at?: string
          engineer_id: string
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id?: string | null
          quantity_change: number
          status?: string
          transaction_type: string
          van_stock_id?: string | null
        }
        Update: {
          created_at?: string
          engineer_id?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id?: string | null
          quantity_change?: number
          status?: string
          transaction_type?: string
          van_stock_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_van_stock_id_fkey"
            columns: ["van_stock_id"]
            isOneToOne: false
            referencedRelation: "van_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_backfill_log: {
        Row: {
          attempts: number
          bucket: string
          created_at: string
          db_rewrites: Json
          dry_run_result: Json | null
          id: string
          is_orphan: boolean
          last_error: string | null
          new_name: string | null
          old_name: string
          op: string
          org_id: string
          run_result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          created_at?: string
          db_rewrites?: Json
          dry_run_result?: Json | null
          id?: string
          is_orphan?: boolean
          last_error?: string | null
          new_name?: string | null
          old_name: string
          op?: string
          org_id: string
          run_result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          created_at?: string
          db_rewrites?: Json
          dry_run_result?: Json | null
          id?: string
          is_orphan?: boolean
          last_error?: string | null
          new_name?: string | null
          old_name?: string
          op?: string
          org_id?: string
          run_result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      submission_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          org_id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          org_id?: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
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
          display_order: number | null
          engineer_id: string
          file_name: string | null
          file_url: string | null
          id: string
          job_id: string
          latitude: number | null
          longitude: number | null
          org_id: string
          type: string
          whatsapp_message_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          engineer_id: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string
          type: string
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          display_order?: number | null
          engineer_id?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          job_id?: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string
          type?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_replies: {
        Row: {
          author_email: string | null
          author_kind: string
          author_name: string | null
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_kind: string
          author_name?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_kind?: string
          author_name?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          app_version: string | null
          assigned_to_platform: string | null
          attachment_path: string | null
          context: Json
          created_at: string
          description: string
          id: string
          internal_notes_count: number
          last_reply_at: string | null
          last_reply_by_kind: string | null
          org_id: string | null
          page_url: string | null
          priority: string
          reporter_email: string | null
          reporter_name: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          status: string
          subject: string | null
          ticket_type: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          assigned_to_platform?: string | null
          attachment_path?: string | null
          context?: Json
          created_at?: string
          description: string
          id?: string
          internal_notes_count?: number
          last_reply_at?: string | null
          last_reply_by_kind?: string | null
          org_id?: string | null
          page_url?: string | null
          priority?: string
          reporter_email?: string | null
          reporter_name?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          status?: string
          subject?: string | null
          ticket_type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          assigned_to_platform?: string | null
          attachment_path?: string | null
          context?: Json
          created_at?: string
          description?: string
          id?: string
          internal_notes_count?: number
          last_reply_at?: string | null
          last_reply_by_kind?: string | null
          org_id?: string | null
          page_url?: string | null
          priority?: string
          reporter_email?: string | null
          reporter_name?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          status?: string
          subject?: string | null
          ticket_type?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      time_clock: {
        Row: {
          clock_in_at: string
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out_at: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          created_at: string
          id: string
          org_id: string
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          org_id?: string
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          clock_in_at?: string
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          org_id?: string
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      van_stock: {
        Row: {
          created_at: string
          engineer_id: string
          id: string
          last_restocked: string | null
          min_quantity: number
          org_id: string | null
          part_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          engineer_id: string
          id?: string
          last_restocked?: string | null
          min_quantity?: number
          org_id?: string | null
          part_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          engineer_id?: string
          id?: string
          last_restocked?: string | null
          min_quantity?: number
          org_id?: string | null
          part_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "van_stock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_stock_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "van_stock_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts_library"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_checks: {
        Row: {
          auto_accepted_at: string | null
          check_date: string
          created_at: string
          defect_notes: string | null
          defect_photo_urls: string[] | null
          engineer_id: string
          has_defects: boolean
          id: string
          items: Json
          mileage: number | null
          org_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          vehicle_id: string | null
          vehicle_reg: string | null
        }
        Insert: {
          auto_accepted_at?: string | null
          check_date?: string
          created_at?: string
          defect_notes?: string | null
          defect_photo_urls?: string[] | null
          engineer_id: string
          has_defects?: boolean
          id?: string
          items?: Json
          mileage?: number | null
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          vehicle_id?: string | null
          vehicle_reg?: string | null
        }
        Update: {
          auto_accepted_at?: string | null
          check_date?: string
          created_at?: string
          defect_notes?: string | null
          defect_photo_urls?: string[] | null
          engineer_id?: string
          has_defects?: boolean
          id?: string
          items?: Json
          mileage?: number | null
          org_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          vehicle_id?: string | null
          vehicle_reg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_checks_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          default_engineer_id: string | null
          id: string
          label: string | null
          make: string | null
          model: string | null
          org_id: string
          registration: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_engineer_id?: string | null
          id?: string
          label?: string | null
          make?: string | null
          model?: string | null
          org_id?: string
          registration: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          default_engineer_id?: string | null
          id?: string
          label?: string | null
          make?: string | null
          model?: string | null
          org_id?: string
          registration?: string
          updated_at?: string
        }
        Relationships: []
      }
      xero_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          org_id: string
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
          org_id?: string
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
          org_id?: string
          refresh_token?: string
          tenant_id?: string
          tenant_name?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xero_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xero_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations_safe"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_defect_summary: {
        Row: {
          created_at: string | null
          id: string | null
          job_id: string | null
          location_on_site: string | null
          severity: string | null
          site_id: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          job_id?: string | null
          location_on_site?: string | null
          severity?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          job_id?: string | null
          location_on_site?: string | null
          severity?: string | null
          site_id?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "customer_job_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_job_summary: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          name: string | null
          reference_number: string | null
          site_id: string | null
          status: string | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          name?: string | null
          reference_number?: string | null
          site_id?: string | null
          status?: string | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string | null
          name?: string | null
          reference_number?: string | null
          site_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      organisations_safe: {
        Row: {
          created_at: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          plan: string | null
          plan_status: string | null
          primary_color: string | null
          slug: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          plan?: string | null
          plan_status?: string | null
          primary_color?: string | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          plan?: string | null
          plan_status?: string | null
          primary_color?: string | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profile_names: {
        Row: {
          full_name: string | null
          user_id: string | null
        }
        Insert: {
          full_name?: string | null
          user_id?: string | null
        }
        Update: {
          full_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _extract_int_from_jsonb: { Args: { v: Json }; Returns: number }
      admin_create_customer_portal_token: {
        Args: { _customer_email: string; _customer_id: string }
        Returns: string
      }
      admin_create_fire_log_token: {
        Args: { _site_id: string }
        Returns: string
      }
      admin_create_handover_token: {
        Args: {
          _customer_id: string
          _job_id: string
          _signer_email: string
          _signer_name: string
        }
        Returns: string
      }
      admin_create_installation_handover_token: {
        Args: {
          _client_email: string
          _client_name: string
          _job_id: string
          _project_id: string
        }
        Returns: string
      }
      admin_create_quote_approval_token: {
        Args: {
          _customer_email: string
          _customer_name: string
          _quote_id: string
        }
        Returns: string
      }
      admin_get_latest_handover_token: {
        Args: { _job_id: string }
        Returns: {
          customer_id: string
          expires_at: string
          id: string
          signature_data: string
          signed_at: string
          signer_name: string
          status: string
          token: string
        }[]
      }
      admin_list_customer_portal_tokens: {
        Args: { _customer_id: string }
        Returns: {
          created_at: string
          customer_email: string
          expires_at: string
          id: string
          is_active: boolean
          last_accessed: string
          token: string
        }[]
      }
      admin_list_fire_log_tokens: {
        Args: { _site_id: string }
        Returns: {
          id: string
          is_active: boolean
          token: string
        }[]
      }
      apply_backfill_rewrites: { Args: { _row_id: string }; Returns: number }
      build_backfill_manifest: {
        Args: { _bucket: string }
        Returns: {
          inserted: number
          orphans: number
          skipped: number
        }[]
      }
      cancel_organisation: {
        Args: { _org_id: string; _reason: string; _source?: string }
        Returns: undefined
      }
      capture_defects_from_response: {
        Args: { _response_id: string }
        Returns: number
      }
      confirm_paper_scan_job: {
        Args: {
          _batch_item_id?: string
          _category: string
          _completed_at: string
          _customer_id: string
          _customer_po?: string
          _date_known: boolean
          _existing_job_id?: string
          _override_name?: string
          _responses: Json
          _site_id: string
          _template_id: string
        }
        Returns: {
          job_id: string
          reference_number: string
          was_new: boolean
        }[]
      }
      count_org_staff_users: { Args: { _org_id: string }; Returns: number }
      count_seed_test_jobs: {
        Args: never
        Returns: {
          seed_jobs: number
          seed_visits: number
        }[]
      }
      create_customer_sign_off_token: {
        Args: {
          _customer_email?: string
          _customer_name: string
          _job_id: string
        }
        Returns: string
      }
      create_org_intake_secret: {
        Args: { _label: string; _org_id: string; _secret: string }
        Returns: string
      }
      create_remedial_job_from_quote: {
        Args: { _quote_id: string }
        Returns: string
      }
      current_user_org_status: {
        Args: never
        Returns: {
          is_platform_admin: boolean
          org_id: string
          org_name: string
          status: string
          suspended_at: string
          suspension_message: string
          suspension_reason: string
        }[]
      }
      customer_logo_path_belongs_to_caller: {
        Args: { _name: string }
        Returns: boolean
      }
      customer_user_can_see_job: {
        Args: { _job_id: string; _uid: string }
        Returns: boolean
      }
      customer_user_can_see_site: {
        Args: { _site_id: string; _uid: string }
        Returns: boolean
      }
      customer_user_customer_id: { Args: { _uid: string }; Returns: string }
      customer_user_org_id: { Args: { _uid: string }; Returns: string }
      customer_user_portal_enabled: { Args: { _uid: string }; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      draft_quote_from_defects: {
        Args: { _defect_ids: string[] }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      engineer_can_access_asset: {
        Args: { _asset_id: string; _user_id: string }
        Returns: boolean
      }
      engineer_can_access_customer: {
        Args: { _customer_id: string; _user_id: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_similar_customer: {
        Args: { _name: string; _threshold?: number }
        Returns: {
          id: string
          name: string
          similarity: number
        }[]
      }
      generate_contract_reference: { Args: never; Returns: string }
      generate_intake_email: { Args: { _slug: string }; Returns: string }
      generate_scan_intake_email: { Args: { _slug: string }; Returns: string }
      generate_vfp_reference: { Args: never; Returns: string }
      get_email_automation_status: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          schedule: string
        }[]
      }
      get_fire_log_token_by_value: {
        Args: { _token: string }
        Returns: {
          id: string
          is_active: boolean
          site_id: string
        }[]
      }
      get_handover_token_by_value: {
        Args: { _token: string }
        Returns: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          job_id: string
          notes: string
          org_id: string
          signature_data: string
          signed_at: string
          signer_email: string
          signer_name: string
          status: string
          token: string
        }[]
      }
      get_portal_fire_log_tokens: {
        Args: { _portal_token: string }
        Returns: {
          is_active: boolean
          site_id: string
          token: string
        }[]
      }
      get_portal_handover_tokens: {
        Args: { _portal_token: string }
        Returns: {
          created_at: string
          id: string
          job_id: string
          signed_at: string
          signer_name: string
          status: string
          token: string
        }[]
      }
      get_user_org_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_org: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_direct: { Args: { _user_id: string }; Returns: boolean }
      is_customer_user: { Args: { _uid: string }; Returns: boolean }
      is_org_active: { Args: { _org_id: string }; Returns: boolean }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_job_message_read: {
        Args: { _message_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      nextval_ppm_seq: { Args: never; Returns: number }
      normalise_template_name: { Args: { _name: string }; Returns: string }
      platform_list_organisations: {
        Args: never
        Returns: {
          created_at: string
          id: string
          job_count: number
          last_activity: string
          name: string
          plan: string
          slug: string
          status: string
          suspended_at: string
          suspension_message: string
          suspension_reason: string
          user_count: number
        }[]
      }
      preview_invitation_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expired: boolean
          org_id: string
          org_name: string
          role: string
        }[]
      }
      preview_signup_code: {
        Args: { _code: string }
        Returns: {
          note: string
          price_override_note: string
          price_override_pence: number
          seed_templates_default: boolean
          valid: boolean
        }[]
      }
      purge_old_client_errors: { Args: never; Returns: undefined }
      purge_old_rejected_email_po_jobs: {
        Args: never
        Returns: {
          deleted_jobs: number
          deleted_objects: number
        }[]
      }
      reactivate_organisation: {
        Args: { _org_id: string; _reason?: string; _source?: string }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      resolve_org_by_intake_email: {
        Args: { _email: string }
        Returns: {
          allowed: boolean
          kind: string
          org_id: string
          status: string
        }[]
      }
      seed_org_reference_data: {
        Args: { _new_org_id: string; _source_org_id?: string }
        Returns: undefined
      }
      set_email_automation_active: {
        Args: { _active: boolean; _jobname: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_handover_token: {
        Args: {
          _notes: string
          _signature_data: string
          _signer_email: string
          _signer_name: string
          _token: string
        }
        Returns: boolean
      }
      storage_object_org_id: { Args: { _name: string }; Returns: string }
      suspend_organisation: {
        Args: {
          _message?: string
          _org_id: string
          _reason: string
          _source?: string
        }
        Returns: undefined
      }
      sync_asset_from_job_sheet: {
        Args: { _response_id: string }
        Returns: undefined
      }
      upsert_service_schedule_from_historic: {
        Args: { _report_id: string }
        Returns: string
      }
      upsert_service_schedule_from_response: {
        Args: { _response_id: string }
        Returns: string
      }
      user_belongs_to_org: { Args: { _org_id: string }; Returns: boolean }
      user_can_access_storage_path: {
        Args: { _name: string }
        Returns: boolean
      }
      verify_org_intake_secret: {
        Args: { _org_id: string; _secret: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "engineer" | "platform_admin" | "customer_user"
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
      app_role: ["admin", "engineer", "platform_admin", "customer_user"],
    },
  },
} as const

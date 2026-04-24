import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as newJobFromApi } from './new-job-from-api.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-job-from-api': newJobFromApi,
}
